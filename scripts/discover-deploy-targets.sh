#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-www.alfabvic.com.au}"
FALLBACK_INSTANCE_ID="${FALLBACK_INSTANCE_ID:-}"

log() {
  printf '[discover-deploy-targets] %s\n' "$*"
}

append_unique_instance() {
  local candidate="$1"
  if [[ ! "${candidate}" =~ ^i-[a-zA-Z0-9]+$ ]]; then
    return
  fi
  if [[ -n "${SEEN_INSTANCE_IDS[$candidate]:-}" ]]; then
    return
  fi
  SEEN_INSTANCE_IDS["$candidate"]=1
  INSTANCE_IDS+=("$candidate")
}

declare -a INSTANCE_IDS=()
declare -a ORIGIN_DOMAINS=()
declare -A SEEN_INSTANCE_IDS=()

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
      ORIGIN_DOMAINS+=("$domain")
      log "Inspecting CloudFront origin domain: ${domain}"

      if [[ "${domain}" == *".elb.amazonaws.com" ]]; then
        lb_arns="$(aws elbv2 describe-load-balancers \
          --query "LoadBalancers[?DNSName=='${domain}'].LoadBalancerArn" \
          --output text 2>/dev/null || true)"

        if [[ -z "${lb_arns}" || "${lb_arns}" == "None" ]]; then
          continue
        fi

        for lb_arn in ${lb_arns}; do
          tg_arns="$(aws elbv2 describe-target-groups \
            --load-balancer-arn "${lb_arn}" \
            --query 'TargetGroups[].TargetGroupArn' \
            --output text 2>/dev/null || true)"

          for tg_arn in ${tg_arns}; do
            target_ids="$(aws elbv2 describe-target-health \
              --target-group-arn "${tg_arn}" \
              --query 'TargetHealthDescriptions[?Target.Id!=null].Target.Id' \
              --output text 2>/dev/null || true)"

            for target_id in ${target_ids}; do
              append_unique_instance "${target_id}"
            done
          done
        done
        continue
      fi

      if [[ "${domain}" =~ ^ec2-.*\.compute(-[a-z0-9]+)?\.amazonaws\.com$ ]]; then
        instance_ids_from_dns="$(aws ec2 describe-instances \
          --filters "Name=dns-name,Values=${domain}" "Name=instance-state-name,Values=running" \
          --query 'Reservations[].Instances[].InstanceId' \
          --output text 2>/dev/null || true)"

        for instance_id in ${instance_ids_from_dns}; do
          append_unique_instance "${instance_id}"
        done
      fi
    done
  fi
fi

if [[ ${#INSTANCE_IDS[@]} -eq 0 && -n "${FALLBACK_INSTANCE_ID}" ]]; then
  append_unique_instance "${FALLBACK_INSTANCE_ID}"
  log "Using fallback instance id from secret."
fi

instance_ids_output="${INSTANCE_IDS[*]}"
origin_domains_output="${ORIGIN_DOMAINS[*]}"

log "Resolved instance IDs: ${instance_ids_output:-<none>}"
log "Resolved origin domains: ${origin_domains_output:-<none>}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "distribution_id=${DISTRIBUTION_ID}"
    echo "instance_ids=${instance_ids_output}"
    echo "origin_domains=${origin_domains_output}"
  } >> "${GITHUB_OUTPUT}"
fi
