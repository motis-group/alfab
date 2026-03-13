#!/usr/bin/env bash
set -euo pipefail

WORKER_INSTANCE="${WORKER_INSTANCE:-}"
WORKER_USER="${WORKER_USER:-symphony}"
WORKER_GROUP="${WORKER_GROUP:-$WORKER_USER}"
WORKER_HOME="${WORKER_HOME:-/home/$WORKER_USER}"

SYMPHONY_REPO_DIR="${SYMPHONY_REPO_DIR:-/opt/symphony}"
WORKFLOW_REPO_URL="${WORKFLOW_REPO_URL:-}"
WORKFLOW_REPO_BRANCH="${WORKFLOW_REPO_BRANCH:-main}"
SYMPHONY_PROJECTS_ROOT="${SYMPHONY_PROJECTS_ROOT:-/opt/symphony-projects}"
WORKFLOW_REPO_DIR="${WORKFLOW_REPO_DIR:-${SYMPHONY_PROJECTS_ROOT}/${WORKER_INSTANCE}/repo}"
WORKFLOW_FILE_RELATIVE_PATH="${WORKFLOW_FILE_RELATIVE_PATH:-WORKFLOW.md}"
SYMPHONY_WORKFLOW_FILE="${SYMPHONY_WORKFLOW_FILE:-${WORKFLOW_REPO_DIR}/${WORKFLOW_FILE_RELATIVE_PATH}}"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-${WORKER_HOME}/code/symphony-workspaces/${WORKER_INSTANCE}}"
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/playwright}"
SYMPHONY_LOGS_ROOT="${SYMPHONY_LOGS_ROOT:-/var/lib/symphony/logs/${WORKER_INSTANCE}}"
SYMPHONY_DASHBOARD_PORT="${SYMPHONY_DASHBOARD_PORT:-}"
LINEAR_API_KEY="${LINEAR_API_KEY:-}"
AUTO_START="${AUTO_START:-1}"

log() {
  printf '[register-symphony-project] %s\n' "$*"
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run this script as root (e.g. sudo ...)." >&2
    exit 1
  fi
}

validate_instance_name() {
  if [[ -z "${WORKER_INSTANCE}" ]]; then
    echo "WORKER_INSTANCE is required." >&2
    exit 1
  fi

  if [[ ! "${WORKER_INSTANCE}" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "WORKER_INSTANCE must match [A-Za-z0-9._-]+." >&2
    exit 1
  fi
}

require_inputs() {
  validate_instance_name

  if [[ -z "${LINEAR_API_KEY}" ]]; then
    echo "LINEAR_API_KEY is required." >&2
    exit 1
  fi

  if [[ -z "${WORKFLOW_REPO_URL}" ]]; then
    echo "WORKFLOW_REPO_URL is required." >&2
    exit 1
  fi

  if [[ ! -x /usr/local/bin/symphony-worker-instance-start ]]; then
    echo "Shared host bootstrap is missing /usr/local/bin/symphony-worker-instance-start." >&2
    exit 1
  fi

  if [[ ! -f /etc/systemd/system/symphony-worker@.service ]]; then
    echo "Shared host bootstrap is missing /etc/systemd/system/symphony-worker@.service." >&2
    exit 1
  fi

  if [[ ! -d "${SYMPHONY_REPO_DIR}/elixir" ]]; then
    echo "Symphony repo not found at ${SYMPHONY_REPO_DIR}." >&2
    exit 1
  fi
}

run_as_worker() {
  sudo -u "${WORKER_USER}" env \
    HOME="${WORKER_HOME}" \
    PATH="/usr/local/bin:/usr/bin:/bin:${WORKER_HOME}/.local/bin" \
    "$@"
}

ensure_paths() {
  mkdir -p \
    "$(dirname "${WORKFLOW_REPO_DIR}")" \
    "${WORKSPACE_ROOT}" \
    "${SYMPHONY_LOGS_ROOT}" \
    /etc/symphony-worker

  chown -R "${WORKER_USER}:${WORKER_GROUP}" \
    "$(dirname "${WORKFLOW_REPO_DIR}")" \
    "${WORKSPACE_ROOT}" \
    "${SYMPHONY_LOGS_ROOT}"
}

clone_or_update_workflow_repo() {
  if [[ -d "${WORKFLOW_REPO_DIR}/.git" ]]; then
    log "Updating workflow repository at ${WORKFLOW_REPO_DIR}."
    run_as_worker sh -lc "git -C '${WORKFLOW_REPO_DIR}' fetch origin '${WORKFLOW_REPO_BRANCH}' --depth=1 && git -C '${WORKFLOW_REPO_DIR}' checkout '${WORKFLOW_REPO_BRANCH}' && git -C '${WORKFLOW_REPO_DIR}' pull --ff-only origin '${WORKFLOW_REPO_BRANCH}'"
  else
    log "Cloning workflow repository to ${WORKFLOW_REPO_DIR}."
    rm -rf "${WORKFLOW_REPO_DIR}"
    run_as_worker git clone --depth=1 --branch "${WORKFLOW_REPO_BRANCH}" "${WORKFLOW_REPO_URL}" "${WORKFLOW_REPO_DIR}"
  fi

  if [[ ! -f "${SYMPHONY_WORKFLOW_FILE}" ]]; then
    echo "Workflow file not found: ${SYMPHONY_WORKFLOW_FILE}" >&2
    exit 1
  fi

  chown -R "${WORKER_USER}:${WORKER_GROUP}" "${WORKFLOW_REPO_DIR}"
}

write_env_file() {
  local env_file

  env_file="/etc/symphony-worker/${WORKER_INSTANCE}.env"
  log "Writing ${env_file}."
  cat >"${env_file}" <<EOF
HOME=${WORKER_HOME}
PATH=/usr/local/bin:/usr/bin:/bin:${WORKER_HOME}/.local/bin
LINEAR_API_KEY=${LINEAR_API_KEY}
PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH}
SYMPHONY_INSTANCE=${WORKER_INSTANCE}
SYMPHONY_REPO_DIR=${SYMPHONY_REPO_DIR}
SYMPHONY_WORKFLOW_FILE=${SYMPHONY_WORKFLOW_FILE}
SYMPHONY_LOGS_ROOT=${SYMPHONY_LOGS_ROOT}
SYMPHONY_WORKSPACE_ROOT=${WORKSPACE_ROOT}
EOF

  if [[ -n "${SYMPHONY_DASHBOARD_PORT}" ]]; then
    echo "SYMPHONY_DASHBOARD_PORT=${SYMPHONY_DASHBOARD_PORT}" >>"${env_file}"
  fi

  chmod 600 "${env_file}"
}

enable_service() {
  local service_name

  service_name="symphony-worker@${WORKER_INSTANCE}.service"
  log "Enabling ${service_name}."
  systemctl daemon-reload

  if [[ "${AUTO_START}" == "1" ]]; then
    systemctl enable --now "${service_name}"
  else
    systemctl enable "${service_name}"
  fi
}

print_summary() {
  local service_name

  service_name="symphony-worker@${WORKER_INSTANCE}.service"

  cat <<EOF

Symphony project worker registered.
- Instance: ${WORKER_INSTANCE}
- Service: ${service_name}
- Workflow repo: ${WORKFLOW_REPO_DIR}
- Workflow file: ${SYMPHONY_WORKFLOW_FILE}
- Workspaces: ${WORKSPACE_ROOT}
- Logs root: ${SYMPHONY_LOGS_ROOT}

Useful commands:
- systemctl status ${service_name} --no-pager
- journalctl -u ${service_name} -f
EOF

  if [[ -n "${SYMPHONY_DASHBOARD_PORT}" ]]; then
    cat <<EOF
- Dashboard (localhost only): http://127.0.0.1:${SYMPHONY_DASHBOARD_PORT}
EOF
  fi
}

main() {
  require_root
  require_inputs
  ensure_paths
  clone_or_update_workflow_repo
  write_env_file
  enable_service
  print_summary
}

main "$@"
