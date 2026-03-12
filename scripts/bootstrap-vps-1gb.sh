#!/usr/bin/env bash
set -euo pipefail

APP_REPO_URL="${APP_REPO_URL:-https://github.com/motis-group/alfab.git}"
APP_BRANCH="${APP_BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/alfab/current}"

DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-www.alfabvic.com.au}"
ALT_DEPLOY_DOMAIN="${ALT_DEPLOY_DOMAIN:-alfabvic.com.au}"

DB_NAME="${DB_NAME:-alfab}"
DB_USER="${DB_USER:-alfab_app}"
DB_PASSWORD="${DB_PASSWORD:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SUPERADMIN_USERNAME="${SUPERADMIN_USERNAME:-}"

SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
NODE_MAJOR="${NODE_MAJOR:-20}"
NODE_OPTIONS_VALUE="${NODE_OPTIONS_VALUE:---max-old-space-size=384}"

REQUEST_TLS="${REQUEST_TLS:-0}"
TLS_EMAIL="${TLS_EMAIL:-}"

log() {
  printf '[bootstrap-vps-1gb] %s\n' "$*"
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run this script as root (e.g. sudo ...)." >&2
    exit 1
  fi
}

require_inputs() {
  if [[ -z "${DB_PASSWORD}" ]]; then
    echo "DB_PASSWORD is required." >&2
    exit 1
  fi

  if [[ -z "${ADMIN_PASSWORD}" ]]; then
    echo "ADMIN_PASSWORD is required." >&2
    exit 1
  fi
}

install_base_packages() {
  log "Installing base packages."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git jq ufw nginx postgresql postgresql-contrib
}

ensure_node() {
  local current_major
  current_major=0
  if command -v node >/dev/null 2>&1; then
    current_major="$(node -p "process.versions.node.split('.')[0]")"
  fi

  if [[ "${current_major}" -ge 18 ]]; then
    log "Node.js $(node -v) already installed."
    return
  fi

  log "Installing Node.js ${NODE_MAJOR}.x."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y nodejs
}

configure_firewall() {
  log "Configuring UFW."
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
}

configure_swap() {
  if swapon --show | awk '{print $1}' | grep -qx '/swapfile'; then
    log "Swap already configured at /swapfile."
    return
  fi

  log "Configuring ${SWAP_SIZE_GB}G swap file."
  if ! fallocate -l "${SWAP_SIZE_GB}G" /swapfile; then
    dd if=/dev/zero of=/swapfile bs=1M count="$((SWAP_SIZE_GB * 1024))" status=progress
  fi
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile

  if ! grep -q '^/swapfile ' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
}

deploy_repo() {
  local parent_dir
  parent_dir="$(dirname "${APP_DIR}")"
  mkdir -p "${parent_dir}"

  if [[ -d "${APP_DIR}/.git" ]]; then
    log "Updating existing repository at ${APP_DIR}."
    git -C "${APP_DIR}" fetch --depth=1 origin "${APP_BRANCH}"
    git -C "${APP_DIR}" checkout "${APP_BRANCH}"
    git -C "${APP_DIR}" reset --hard "origin/${APP_BRANCH}"
  else
    log "Cloning repository to ${APP_DIR}."
    rm -rf "${APP_DIR}"
    git clone --depth=1 --branch "${APP_BRANCH}" "${APP_REPO_URL}" "${APP_DIR}"
  fi
}

configure_postgres() {
  log "Configuring PostgreSQL role and database."
  systemctl enable --now postgresql

  sudo -u postgres psql -v ON_ERROR_STOP=1 \
    --set=db_user="${DB_USER}" \
    --set=db_password="${DB_PASSWORD}" \
    --set=db_name="${DB_NAME}" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user') \gexec

SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'db_user', :'db_password')
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name') \gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'db_user') \gexec
SQL
}

write_env_file() {
  local db_password_encoded
  local database_url
  db_password_encoded="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "${DB_PASSWORD}")"
  database_url="postgres://${DB_USER}:${db_password_encoded}@127.0.0.1:5432/${DB_NAME}"

  log "Writing /etc/alfab.env."
  cat >/etc/alfab.env <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=${database_url}
DATABASE_SSL=false
DATABASE_SSL_REJECT_UNAUTHORIZED=false
NODE_OPTIONS=${NODE_OPTIONS_VALUE}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

  if [[ -n "${SUPERADMIN_USERNAME}" ]]; then
    echo "SUPERADMIN_USERNAME=${SUPERADMIN_USERNAME}" >> /etc/alfab.env
  fi

  chmod 600 /etc/alfab.env
}

run_deploy() {
  log "Running app deploy script."
  cd "${APP_DIR}"
  DEPLOY_DOMAIN="${DEPLOY_DOMAIN}" ALT_DEPLOY_DOMAIN="${ALT_DEPLOY_DOMAIN}" APP_DIR="${APP_DIR}" \
    bash scripts/ec2-deploy.sh
}

maybe_request_tls() {
  if [[ "${REQUEST_TLS}" != "1" ]]; then
    return
  fi

  if [[ -z "${TLS_EMAIL}" ]]; then
    echo "REQUEST_TLS=1 set but TLS_EMAIL is missing." >&2
    exit 1
  fi

  log "Requesting TLS certificate via certbot."
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx --non-interactive --agree-tos \
    --email "${TLS_EMAIL}" \
    -d "${ALT_DEPLOY_DOMAIN}" \
    -d "${DEPLOY_DOMAIN}" \
    --redirect
  systemctl restart nginx
}

print_summary() {
  cat <<EOF

Bootstrap complete.
- App URL: http://${ALT_DEPLOY_DOMAIN} (HTTPS when certbot succeeds)
- App path: ${APP_DIR}
- Env file: /etc/alfab.env

Next:
1) Point DNS A records for ${ALT_DEPLOY_DOMAIN} and ${DEPLOY_DOMAIN} to this VPS IP.
2) If REQUEST_TLS=0, run certbot after DNS propagates.
EOF
}

main() {
  require_root
  require_inputs
  install_base_packages
  ensure_node
  configure_firewall
  configure_swap
  deploy_repo
  configure_postgres
  write_env_file
  run_deploy
  maybe_request_tls
  print_summary
}

main "$@"
