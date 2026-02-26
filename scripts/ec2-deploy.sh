#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
SECRET_ID="${SECRET_ID:-alfab/prod/database}"
APP_DIR="${APP_DIR:-/opt/alfab/current}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "App directory does not exist: ${APP_DIR}" >&2
  exit 1
fi

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

run_as_root() {
  if [[ -n "${SUDO}" ]]; then
    ${SUDO} "$@"
  else
    "$@"
  fi
}

install_runtime_packages() {
  if command -v dnf >/dev/null 2>&1; then
    run_as_root dnf install -y nginx jq tar curl || true
  elif command -v apt-get >/dev/null 2>&1; then
    run_as_root apt-get update -y
    run_as_root apt-get install -y nginx jq tar curl
  elif command -v yum >/dev/null 2>&1; then
    run_as_root yum install -y nginx jq tar curl || true
  else
    echo "Unsupported OS: no dnf/apt-get/yum available." >&2
    exit 1
  fi
}

select_app_user() {
  for candidate in ec2-user ubuntu www-data; do
    if id -u "${candidate}" >/dev/null 2>&1; then
      echo "${candidate}"
      return
    fi
  done

  id -un
}

install_runtime_packages

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required on the target host." >&2
  exit 1
fi

node_major="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${node_major}" -lt 18 ]]; then
  echo "Node.js 18+ is required (found $(node -v))." >&2
  exit 1
fi

cd "${APP_DIR}"

if [[ ! -f package.json ]]; then
  echo "package.json not found in ${APP_DIR}" >&2
  exit 1
fi

npm ci

DATABASE_URL=""
if command -v aws >/dev/null 2>&1; then
  set +e
  SECRET_JSON="$(aws secretsmanager get-secret-value --secret-id "${SECRET_ID}" --region "${AWS_REGION}" --query SecretString --output text 2>/dev/null)"
  secret_status=$?
  set -e

  if [[ ${secret_status} -eq 0 ]]; then
    DATABASE_URL="$(echo "${SECRET_JSON}" | jq -r '.database_url // empty')"
  fi
fi

if [[ -z "${DATABASE_URL}" && -f /etc/alfab.env ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' /etc/alfab.env | tail -n1 | cut -d '=' -f2- || true)"
fi

if [[ -z "${DATABASE_URL}" || "${DATABASE_URL}" == "null" ]]; then
  echo "Could not determine DATABASE_URL from ${SECRET_ID} or existing /etc/alfab.env." >&2
  exit 1
fi

cat <<ENVVARS | run_as_root tee /etc/alfab.env >/dev/null
NODE_ENV=production
PORT=3000
DATABASE_URL=${DATABASE_URL}
ENVVARS
run_as_root chmod 600 /etc/alfab.env

set -a
source /etc/alfab.env
set +a

npm run build

if [[ -x scripts/apply-db-migrations.sh && -d db/migrations ]]; then
  bash scripts/apply-db-migrations.sh db/migrations
fi

APP_USER="$(select_app_user)"

cat <<UNIT | run_as_root tee /etc/systemd/system/alfab.service >/dev/null
[Unit]
Description=ALFAB Next.js app
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=/etc/alfab.env
ExecStart=/usr/bin/npm run start -- --hostname 0.0.0.0 --port 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

if [[ -d /etc/nginx/conf.d ]]; then
  cat <<'NGINX' | run_as_root tee /etc/nginx/conf.d/alfab.conf >/dev/null
server {
    listen 80;
    server_name _;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_pass http://127.0.0.1:3000;
    }
}
NGINX
  run_as_root rm -f /etc/nginx/conf.d/default.conf
fi

if [[ -d /etc/nginx/sites-available ]]; then
  cat <<'NGINX' | run_as_root tee /etc/nginx/sites-available/alfab >/dev/null
server {
    listen 80;
    server_name _;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_pass http://127.0.0.1:3000;
    }
}
NGINX
  run_as_root ln -sf /etc/nginx/sites-available/alfab /etc/nginx/sites-enabled/alfab
  run_as_root rm -f /etc/nginx/sites-enabled/default
fi

run_as_root chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
run_as_root systemctl daemon-reload
run_as_root systemctl enable --now alfab
run_as_root systemctl enable --now nginx
run_as_root systemctl restart alfab
run_as_root systemctl restart nginx

for _ in {1..30}; do
  if curl -fsS http://127.0.0.1/ >/dev/null; then
    echo "Deploy finished successfully."
    exit 0
  fi

  sleep 1
done

echo "Deploy finished but health check did not pass after 30 attempts." >&2
run_as_root systemctl status alfab --no-pager -l || true
run_as_root systemctl status nginx --no-pager -l || true
exit 1
