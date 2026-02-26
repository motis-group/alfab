#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
SECRET_ID="${SECRET_ID:-alfab/prod/database}"
APP_DIR="${APP_DIR:-/opt/alfab/current}"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "App directory does not exist: ${APP_DIR}" >&2
  exit 1
fi

# Amazon Linux 2023 packages
sudo dnf install -y nginx nodejs jq postgresql15 tar curl

cd "${APP_DIR}"

if [[ ! -f package.json ]]; then
  echo "package.json not found in ${APP_DIR}" >&2
  exit 1
fi

npm ci

SECRET_JSON="$(aws secretsmanager get-secret-value --secret-id "${SECRET_ID}" --region "${AWS_REGION}" --query SecretString --output text)"
DATABASE_URL="$(echo "${SECRET_JSON}" | jq -r '.database_url')"

if [[ -z "${DATABASE_URL}" || "${DATABASE_URL}" == "null" ]]; then
  echo "Could not read database_url from ${SECRET_ID}." >&2
  exit 1
fi

cat >/etc/alfab.env <<ENVVARS
NODE_ENV=production
PORT=3000
DATABASE_URL=${DATABASE_URL}
ENVVARS
chmod 600 /etc/alfab.env

set -a
source /etc/alfab.env
set +a

npm run build

# Run migrations only if migration assets exist.
if [[ -x scripts/apply-db-migrations.sh && -d db/migrations ]]; then
  bash scripts/apply-db-migrations.sh db/migrations
fi

cat >/etc/systemd/system/alfab.service <<UNIT
[Unit]
Description=ALFAB Next.js app
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=${APP_DIR}
EnvironmentFile=/etc/alfab.env
ExecStart=/usr/bin/npm run start -- --hostname 0.0.0.0 --port 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/nginx/conf.d/alfab.conf <<'NGINX'
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

sudo rm -f /etc/nginx/conf.d/default.conf
sudo chown -R ec2-user:ec2-user "${APP_DIR}"

sudo systemctl daemon-reload
sudo systemctl enable --now alfab
sudo systemctl enable --now nginx
sudo systemctl restart alfab
sudo systemctl restart nginx

for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1/ >/dev/null; then
    echo "Deploy finished successfully."
    exit 0
  fi

  sleep 1
done

echo "Deploy finished but health check did not pass after 30 attempts." >&2
sudo systemctl status alfab --no-pager -l || true
sudo systemctl status nginx --no-pager -l || true
exit 1
