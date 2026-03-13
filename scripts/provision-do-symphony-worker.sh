#!/usr/bin/env bash
set -euo pipefail

WORKER_NAME="${WORKER_NAME:-alfab-symphony-worker}"
DO_REGION="${DO_REGION:-syd1}"
DO_SIZE="${DO_SIZE:-s-2vcpu-4gb}"
DO_IMAGE="${DO_IMAGE:-ubuntu-24-04-x64}"
DO_PROJECT_ID="${DO_PROJECT_ID:-}"
DO_TAGS="${DO_TAGS:-symphony,alfab}"
DO_ENABLE_MONITORING="${DO_ENABLE_MONITORING:-1}"
DO_ENABLE_PRIVATE_NETWORKING="${DO_ENABLE_PRIVATE_NETWORKING:-1}"

WORKER_INSTANCE="${WORKER_INSTANCE:-alfab}"

BOOTSTRAP_REPO_URL="${BOOTSTRAP_REPO_URL:-https://github.com/motis-group/alfab.git}"
BOOTSTRAP_REPO_BRANCH="${BOOTSTRAP_REPO_BRANCH:-main}"
BOOTSTRAP_DIR="${BOOTSTRAP_DIR:-/opt/alfab-bootstrap}"

WORKFLOW_REPO_URL="${WORKFLOW_REPO_URL:-${BOOTSTRAP_REPO_URL}}"
WORKFLOW_REPO_BRANCH="${WORKFLOW_REPO_BRANCH:-${BOOTSTRAP_REPO_BRANCH}}"
SYMPHONY_PROJECTS_ROOT="${SYMPHONY_PROJECTS_ROOT:-/opt/symphony-projects}"
WORKFLOW_REPO_DIR="${WORKFLOW_REPO_DIR:-${SYMPHONY_PROJECTS_ROOT}/${WORKER_INSTANCE}/repo}"
WORKFLOW_FILE_RELATIVE_PATH="${WORKFLOW_FILE_RELATIVE_PATH:-WORKFLOW.md}"

SYMPHONY_REPO_URL="${SYMPHONY_REPO_URL:-https://github.com/odysseus0/symphony.git}"
SYMPHONY_REPO_BRANCH="${SYMPHONY_REPO_BRANCH:-main}"
SYMPHONY_REPO_DIR="${SYMPHONY_REPO_DIR:-/opt/symphony}"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-/home/symphony/code/symphony-workspaces/${WORKER_INSTANCE}}"
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/playwright}"
SYMPHONY_LOGS_ROOT="${SYMPHONY_LOGS_ROOT:-/var/lib/symphony/logs/${WORKER_INSTANCE}}"
SYMPHONY_DASHBOARD_PORT="${SYMPHONY_DASHBOARD_PORT:-}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"
NODE_MAJOR="${NODE_MAJOR:-20}"

GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Symphony Worker}"
GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-}"

LINEAR_API_KEY="${LINEAR_API_KEY:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
CODEX_AUTH_JSON_B64="${CODEX_AUTH_JSON_B64:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
DO_SSH_KEY_ID="${DO_SSH_KEY_ID:-}"
DO_SSH_KEY_FINGERPRINT="${DO_SSH_KEY_FINGERPRINT:-}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-}"

log() {
  printf '[provision-do-symphony-worker] %s\n' "$*"
}

require_env() {
  local name="$1"
  local value="$2"

  if [[ -z "${value}" ]]; then
    echo "${name} is required." >&2
    exit 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

append_env_line() {
  local file="$1"
  local name="$2"
  local value="$3"

  printf "%s=%q\n" "${name}" "${value}" >>"${file}"
}

require_prereqs() {
  require_command doctl
  require_command ssh
  require_command scp
  require_command mktemp

  require_env LINEAR_API_KEY "${LINEAR_API_KEY}"

  if [[ -z "${OPENAI_API_KEY}" && -z "${CODEX_AUTH_JSON_B64}" ]]; then
    if [[ -f "${HOME}/.codex/auth.json" ]]; then
      CODEX_AUTH_JSON_B64="$(base64 < "${HOME}/.codex/auth.json" | tr -d '\n')"
      log "Using local ${HOME}/.codex/auth.json for worker Codex auth."
    else
      echo "Either OPENAI_API_KEY or CODEX_AUTH_JSON_B64 is required." >&2
      exit 1
    fi
  fi

  if [[ -z "${GITHUB_TOKEN}" ]]; then
    if gh auth status >/dev/null 2>&1; then
      GITHUB_TOKEN="$(gh auth token)"
      log "Using token from local GitHub CLI auth."
    else
      echo "GITHUB_TOKEN is required." >&2
      exit 1
    fi
  fi

  if ! doctl account get >/dev/null 2>&1; then
    echo "doctl is not authenticated. Run 'doctl auth init' first." >&2
    exit 1
  fi
}

resolve_ssh_key() {
  if [[ -n "${DO_SSH_KEY_ID}" ]]; then
    echo "${DO_SSH_KEY_ID}"
    return
  fi

  if [[ -n "${DO_SSH_KEY_FINGERPRINT}" ]]; then
    echo "${DO_SSH_KEY_FINGERPRINT}"
    return
  fi

  local key_count

  key_count="$(doctl compute ssh-key list --no-header --format ID | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "${key_count}" == "1" ]]; then
    doctl compute ssh-key list --no-header --format ID | sed '/^$/d'
    return
  fi

  echo "Set DO_SSH_KEY_ID or DO_SSH_KEY_FINGERPRINT. The account has ${key_count} SSH keys." >&2
  exit 1
}

wait_for_ssh() {
  local ip="$1"
  local -a ssh_args

  ssh_args=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=5)
  if [[ -n "${SSH_IDENTITY_FILE}" ]]; then
    ssh_args+=(-i "${SSH_IDENTITY_FILE}")
  fi

  log "Waiting for SSH on ${ip}."
  for _ in {1..60}; do
    if ssh "${ssh_args[@]}" "root@${ip}" true >/dev/null 2>&1; then
      return
    fi
    sleep 5
  done

  echo "Timed out waiting for SSH on ${ip}." >&2
  exit 1
}

write_remote_env_file() {
  local temp_file="$1"

  : >"${temp_file}"
  append_env_line "${temp_file}" LINEAR_API_KEY "${LINEAR_API_KEY}"
  append_env_line "${temp_file}" OPENAI_API_KEY "${OPENAI_API_KEY}"
  if [[ -n "${CODEX_AUTH_JSON_B64}" ]]; then
    append_env_line "${temp_file}" CODEX_AUTH_JSON_B64 "${CODEX_AUTH_JSON_B64}"
  fi
  append_env_line "${temp_file}" GITHUB_TOKEN "${GITHUB_TOKEN}"
  append_env_line "${temp_file}" WORKER_INSTANCE "${WORKER_INSTANCE}"
  append_env_line "${temp_file}" WORKFLOW_REPO_URL "${WORKFLOW_REPO_URL}"
  append_env_line "${temp_file}" WORKFLOW_REPO_BRANCH "${WORKFLOW_REPO_BRANCH}"
  append_env_line "${temp_file}" SYMPHONY_PROJECTS_ROOT "${SYMPHONY_PROJECTS_ROOT}"
  append_env_line "${temp_file}" WORKFLOW_REPO_DIR "${WORKFLOW_REPO_DIR}"
  append_env_line "${temp_file}" WORKFLOW_FILE_RELATIVE_PATH "${WORKFLOW_FILE_RELATIVE_PATH}"
  append_env_line "${temp_file}" SYMPHONY_REPO_URL "${SYMPHONY_REPO_URL}"
  append_env_line "${temp_file}" SYMPHONY_REPO_BRANCH "${SYMPHONY_REPO_BRANCH}"
  append_env_line "${temp_file}" SYMPHONY_REPO_DIR "${SYMPHONY_REPO_DIR}"
  append_env_line "${temp_file}" WORKSPACE_ROOT "${WORKSPACE_ROOT}"
  append_env_line "${temp_file}" PLAYWRIGHT_BROWSERS_PATH "${PLAYWRIGHT_BROWSERS_PATH}"
  append_env_line "${temp_file}" SYMPHONY_LOGS_ROOT "${SYMPHONY_LOGS_ROOT}"
  append_env_line "${temp_file}" SWAP_SIZE_GB "${SWAP_SIZE_GB}"
  append_env_line "${temp_file}" NODE_MAJOR "${NODE_MAJOR}"
  append_env_line "${temp_file}" GIT_AUTHOR_NAME "${GIT_AUTHOR_NAME}"

  if [[ -n "${GIT_AUTHOR_EMAIL}" ]]; then
    append_env_line "${temp_file}" GIT_AUTHOR_EMAIL "${GIT_AUTHOR_EMAIL}"
  fi

  if [[ -n "${SYMPHONY_DASHBOARD_PORT}" ]]; then
    append_env_line "${temp_file}" SYMPHONY_DASHBOARD_PORT "${SYMPHONY_DASHBOARD_PORT}"
  fi
}

run_remote_bootstrap() {
  local ip="$1"
  local temp_env="$2"
  local -a ssh_args
  local -a scp_args

  ssh_args=(-o StrictHostKeyChecking=accept-new)
  scp_args=(-o StrictHostKeyChecking=accept-new)

  if [[ -n "${SSH_IDENTITY_FILE}" ]]; then
    ssh_args+=(-i "${SSH_IDENTITY_FILE}")
    scp_args+=(-i "${SSH_IDENTITY_FILE}")
  fi

  log "Uploading bootstrap environment."
  scp "${scp_args[@]}" "${temp_env}" "root@${ip}:/root/symphony-worker-bootstrap.env" >/dev/null

  log "Running remote bootstrap."
  ssh "${ssh_args[@]}" "root@${ip}" /bin/bash <<EOF
set -euo pipefail
set -a
source /root/symphony-worker-bootstrap.env
set +a
rm -f /root/symphony-worker-bootstrap.env

if [[ -d "${BOOTSTRAP_DIR}/.git" ]]; then
  git -C "${BOOTSTRAP_DIR}" fetch origin "${BOOTSTRAP_REPO_BRANCH}" --depth=1
  git -C "${BOOTSTRAP_DIR}" checkout "${BOOTSTRAP_REPO_BRANCH}"
  git -C "${BOOTSTRAP_DIR}" pull --ff-only origin "${BOOTSTRAP_REPO_BRANCH}"
else
  rm -rf "${BOOTSTRAP_DIR}"
  git clone --depth=1 --branch "${BOOTSTRAP_REPO_BRANCH}" "${BOOTSTRAP_REPO_URL}" "${BOOTSTRAP_DIR}"
fi

bash "${BOOTSTRAP_DIR}/scripts/bootstrap-symphony-worker-vps.sh"
EOF
}

print_summary() {
  local droplet_id="$1"
  local ip="$2"

  cat <<EOF

DigitalOcean Symphony host ready.
- Droplet ID: ${droplet_id}
- Hostname: ${WORKER_NAME}
- Public IP: ${ip}
- First instance: ${WORKER_INSTANCE}

Useful commands:
- ssh root@${ip}
- ssh root@${ip} 'systemctl status symphony-worker@${WORKER_INSTANCE} --no-pager'
- ssh root@${ip} 'journalctl -u symphony-worker@${WORKER_INSTANCE} -f'
EOF

  if [[ -n "${SYMPHONY_DASHBOARD_PORT}" ]]; then
    cat <<EOF
- Dashboard tunnel: ssh -L ${SYMPHONY_DASHBOARD_PORT}:127.0.0.1:${SYMPHONY_DASHBOARD_PORT} root@${ip}
EOF
  fi
}

main() {
  require_prereqs

  local ssh_key
  ssh_key="$(resolve_ssh_key)"
  log "Using SSH key ${ssh_key}."

  local droplet_output
  local -a create_args

  create_args=(
    compute droplet create "${WORKER_NAME}"
    --region "${DO_REGION}"
    --size "${DO_SIZE}"
    --image "${DO_IMAGE}"
    --ssh-keys "${ssh_key}"
    --wait
    --format ID,Name,PublicIPv4,Status
    --no-header
  )

  if [[ -n "${DO_PROJECT_ID}" ]]; then
    create_args+=(--project-id "${DO_PROJECT_ID}")
  fi
  if [[ -n "${DO_TAGS}" ]]; then
    create_args+=(--tag-names "${DO_TAGS}")
  fi
  if [[ "${DO_ENABLE_MONITORING}" == "1" ]]; then
    create_args+=(--enable-monitoring)
  fi
  if [[ "${DO_ENABLE_PRIVATE_NETWORKING}" == "1" ]]; then
    create_args+=(--enable-private-networking)
  fi

  log "Creating droplet ${WORKER_NAME} in ${DO_REGION} (${DO_SIZE})."
  droplet_output="$(doctl "${create_args[@]}")"

  local droplet_id
  local droplet_ip

  droplet_id="$(awk '{print $1}' <<<"${droplet_output}")"
  droplet_ip="$(awk '{print $3}' <<<"${droplet_output}")"

  if [[ -z "${droplet_id}" || -z "${droplet_ip}" ]]; then
    echo "Failed to parse droplet details from doctl output: ${droplet_output}" >&2
    exit 1
  fi

  wait_for_ssh "${droplet_ip}"

  local temp_env
  temp_env="$(mktemp)"
  chmod 600 "${temp_env}"
  trap 'rm -f "${temp_env}"' EXIT

  write_remote_env_file "${temp_env}"
  run_remote_bootstrap "${droplet_ip}" "${temp_env}"
  print_summary "${droplet_id}" "${droplet_ip}"
}

main "$@"
