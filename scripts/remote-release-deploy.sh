#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="${RELEASE_DIR:-}"
CURRENT_LINK="${CURRENT_LINK:-/opt/alfab/current}"
RELEASES_DIR="${RELEASES_DIR:-/opt/alfab/releases}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-www.alfabvic.com.au}"
ALT_DEPLOY_DOMAIN="${ALT_DEPLOY_DOMAIN:-alfabvic.com.au}"

log() {
  printf '[remote-release-deploy] %s\n' "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command sudo
require_command curl

if [[ -z "${RELEASE_DIR}" ]]; then
  echo "RELEASE_DIR is required." >&2
  exit 1
fi

if [[ ! -d "${RELEASE_DIR}" ]]; then
  echo "Release directory does not exist: ${RELEASE_DIR}" >&2
  exit 1
fi

if [[ ! -f "${RELEASE_DIR}/package.json" ]]; then
  echo "package.json not found in ${RELEASE_DIR}" >&2
  exit 1
fi

cd "${RELEASE_DIR}"
chmod +x scripts/*.sh

log "Deploying release ${RELEASE_DIR}"
sudo APP_DIR="${RELEASE_DIR}" DEPLOY_DOMAIN="${DEPLOY_DOMAIN}" ALT_DEPLOY_DOMAIN="${ALT_DEPLOY_DOMAIN}" bash scripts/ec2-deploy.sh

log "Updating current symlink"
sudo mkdir -p "$(dirname "${CURRENT_LINK}")"
if [[ -e "${CURRENT_LINK}" && ! -L "${CURRENT_LINK}" ]]; then
  sudo rm -rf "${CURRENT_LINK}"
fi
sudo ln -sfnT "${RELEASE_DIR}" "${CURRENT_LINK}"

log "Pruning old releases"
mapfile -t release_paths < <(sudo ls -1dt "${RELEASES_DIR}"/* 2>/dev/null || true)
if [[ "${#release_paths[@]}" -gt "${KEEP_RELEASES}" ]]; then
  for release_path in "${release_paths[@]:KEEP_RELEASES}"; do
    if [[ -n "${release_path}" && "${release_path}" != "${RELEASE_DIR}" ]]; then
      sudo rm -rf "${release_path}"
    fi
  done
fi

log "Running local health checks"
curl -fsS http://127.0.0.1/login >/dev/null
sudo systemctl is-active alfab >/dev/null
sudo systemctl is-active nginx >/dev/null

log "Release deployed successfully"
