#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-www.alfabvic.com.au}"
FALLBACK_INSTANCE_ID="${FALLBACK_INSTANCE_ID:-}"
REMOTE_HOST="${REMOTE_HOST:-}"
DISCOVERY_REGIONS="${DISCOVERY_REGIONS:-${AWS_REGION} us-west-2 us-east-1}"

log() {
  printf '[discover-deploy-targets] %s\n' "$*"
}

append_discovery_region() {
  local candidate="$1"
  if [[ -z "${candidate}" ]]; then
    return
  fi
  if [[ -n "${SEEN_REGIONS[$candidate]:-}" ]]; then
    return
  fi
  SEEN_REGIONS["$candidate"]=1
  DISCOVERY_REGION_LIST+=("$candidate")
}

append_target() {
  local instance_id="$1"
  local region="$2"

  if [[ ! "${instance_id}" =~ ^i-[a-zA-Z0-9]+$ ]]; then
    return
  fi

  if [[ -z "${region}" ]]; then
    region="${AWS_REGION}"
  fi

  local target_key="${region}:${instance_id}"
  if [[ -n "${SEEN_TARGETS[$target_key]:-}" ]]; then
    return
  fi

  SEEN_TARGETS["$target_key"]=1
  INSTANCE_TARGETS+=("$target_key")

  if [[ -z "${SEEN_INSTANCE_IDS[$instance_id]:-}" ]]; then
    SEEN_INSTANCE_IDS["$instance_id"]=1
    INSTANCE_IDS+=("$instance_id")
  fi
}

discover_instances_by_ip() {
  local ip="$1"

  if [[ -z "${ip}" ]]; then
    return
  fi

  for region in "${DISCOVERY_REGION_LIST[@]}"; do
    private_ids="$(aws ec2 describe-instances \
      --region "${region}" \
      --filters "Name=instance-state-name,Values=running" "Name=private-ip-address,Values=${ip}" \
      --query 'Reservations[].Instances[].InstanceId' \
      --output text 2>/dev/null || true)"

    for instance_id in ${private_ids}; do
      append_target "${instance_id}" "${region}"
    done

    public_ids="$(aws ec2 describe-instances \
      --region "${region}" \
      --filters "Name=instance-state-name,Values=running" "Name=ip-address,Values=${ip}" \
      --query 'Reservations[].Instances[].InstanceId' \
      --output text 2>/dev/null || true)"

    for instance_id in ${public_ids}; do
      append_target "${instance_id}" "${region}"
    done
  done
}

resolve_host_ips() {
  local host="$1"

  if [[ -z "${host}" ]]; then
    return
  fi

  if command -v getent >/dev/null 2>&1; then
    getent ahostsv4 "${host}" | awk '{print $1}'
  fi

  if command -v dig >/dev/null 2>&1; then
    dig +short A "${host}" || true
  fi
}

declare -a INSTANCE_TARGETS=()
declare -a INSTANCE_IDS=()
declare -a ORIGIN_DOMAINS=()
declare -a DISCOVERY_REGION_LIST=()
declare -A SEEN_TARGETS=()
declare -A SEEN_INSTANCE_IDS=()
declare -A SEEN_REGIONS=()

for region in ${DISCOVERY_REGIONS}; do
  append_discovery_region "${region}"
done
append_discovery_region "${AWS_REGION}"

DISTRIBUTION_ID=""

set +e
DISTRIBUTION_ID="$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Quantity > \`0\` && contains(join(',',Aliases.Items), '${DEPLOY_DOMAIN}')].Id | [0]" \
  --output text 2>/dev/null)"
list_status=$?
set -e

if [[ ${list_status} -ne 0 || -z "${DISTRIBUTION_ID}" || "${DISTRIBUTION_ID}" == "None" ]]; then
  log "CloudFront distribution for ${DEPLOY_DOMAIN} was not discovered."
  DISTRIBUTION_ID=""
else
  log "Discovered CloudFront distribution: ${DISTRIBUTION_ID}"

  set +e
  origin_domains_raw="$(aws cloudfront get-distribution-config \
    --id "${DISTRIBUTION_ID}" \
    --query 'DistributionConfig.Origins.Items[].DomainName' \
    --output text 2>/dev/null)"
  origin_status=$?
  set -e

  if [[ ${origin_status} -eq 0 && -n "${origin_domains_raw}" && "${origin_domains_raw}" != "None" ]]; then
    for domain in ${origin_domains_raw}; do
      ORIGIN_DOMAINS+=("${domain}")
      log "Inspecting CloudFront origin domain: ${domain}"

      if [[ "${domain}" == *".elb.amazonaws.com" ]]; then
        for region in "${DISCOVERY_REGION_LIST[@]}"; do
          lb_arns="$(aws elbv2 describe-load-balancers \
            --region "${region}" \
            --query "LoadBalancers[?DNSName=='${domain}'].LoadBalancerArn" \
            --output text 2>/dev/null || true)"

          for lb_arn in ${lb_arns}; do
            tg_arns="$(aws elbv2 describe-target-groups \
              --region "${region}" \
              --load-balancer-arn "${lb_arn}" \
              --query 'TargetGroups[].TargetGroupArn' \
              --output text 2>/dev/null || true)"

            for tg_arn in ${tg_arns}; do
              target_ids="$(aws elbv2 describe-target-health \
                --region "${region}" \
                --target-group-arn "${tg_arn}" \
                --query 'TargetHealthDescriptions[?Target.Id!=null].Target.Id' \
                --output text 2>/dev/null || true)"

              for target_id in ${target_ids}; do
                append_target "${target_id}" "${region}"
              done
            done
          done
        done
        continue
      fi

      if [[ "${domain}" =~ ^ec2-.*\.compute(-[a-z0-9]+)?\.amazonaws\.com$ ]]; then
        for region in "${DISCOVERY_REGION_LIST[@]}"; do
          instance_ids_from_dns="$(aws ec2 describe-instances \
            --region "${region}" \
            --filters "Name=dns-name,Values=${domain}" "Name=instance-state-name,Values=running" \
            --query 'Reservations[].Instances[].InstanceId' \
            --output text 2>/dev/null || true)"

          for instance_id in ${instance_ids_from_dns}; do
            append_target "${instance_id}" "${region}"
          done
        done
      fi
    done
  fi
fi

if [[ -n "${REMOTE_HOST}" ]]; then
  log "Attempting EC2 discovery from configured remote host."

  remote_host_ips="$(resolve_host_ips "${REMOTE_HOST}" | awk 'NF' | sort -u || true)"
  if [[ -n "${remote_host_ips}" ]]; then
    log "Resolved remote host IPs: ${remote_host_ips//$'\n'/ }"
    while IFS= read -r ip; do
      discover_instances_by_ip "${ip}"
    done <<< "${remote_host_ips}"
  else
    log "Could not resolve remote host to IP."
  fi
fi

if [[ ${#INSTANCE_TARGETS[@]} -eq 0 && -n "${FALLBACK_INSTANCE_ID}" ]]; then
  append_target "${FALLBACK_INSTANCE_ID}" "${AWS_REGION}"
  log "Using fallback instance id from secret."
fi

instance_targets_output="${INSTANCE_TARGETS[*]}"
instance_ids_output="${INSTANCE_IDS[*]}"
origin_domains_output="${ORIGIN_DOMAINS[*]}"
discovery_regions_output="${DISCOVERY_REGION_LIST[*]}"

log "Discovery regions: ${discovery_regions_output:-<none>}"
log "Resolved instance targets: ${instance_targets_output:-<none>}"
log "Resolved instance IDs: ${instance_ids_output:-<none>}"
log "Resolved origin domains: ${origin_domains_output:-<none>}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "distribution_id=${DISTRIBUTION_ID}"
    echo "instance_targets=${instance_targets_output}"
    echo "instance_ids=${instance_ids_output}"
    echo "origin_domains=${origin_domains_output}"
    echo "discovery_regions=${discovery_regions_output}"
  } >> "${GITHUB_OUTPUT}"
fi
