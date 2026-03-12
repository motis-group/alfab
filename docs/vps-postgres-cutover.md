# VPS + PostgreSQL Cutover (Off AWS RDS)

This runbook moves ALFAB to one low-cost VPS (app + PostgreSQL) and migrates data out of AWS RDS.

## Recommended baseline (simple, low-risk)

- Provider: DigitalOcean Basic Droplet (`syd1`)
- OS: Ubuntu 24.04 LTS
- Size: **1 GB RAM / 1 vCPU / 25 GB SSD**
- Public IP: 1 static IPv4

This is the cheapest simple setup; add swap to avoid out-of-memory during builds.

## One-command bootstrap (fresh 1GB VPS)

Run on the VPS as root (or prefix with `sudo`):

```bash
git clone --depth=1 https://github.com/motis-group/alfab.git /opt/alfab-bootstrap && DB_PASSWORD='<db-password>' ADMIN_PASSWORD='<admin-password>' DEPLOY_DOMAIN='www.alfabvic.com.au' ALT_DEPLOY_DOMAIN='alfabvic.com.au' /opt/alfab-bootstrap/scripts/bootstrap-vps-1gb.sh
```

Optional envs:

- `APP_REPO_URL` (defaults to `https://github.com/motis-group/alfab.git`)
- `APP_BRANCH` (defaults to `main`)
- `DB_NAME` (defaults to `alfab`)
- `DB_USER` (defaults to `alfab_app`)
- `SUPERADMIN_USERNAME` (optional)
- `REQUEST_TLS=1 TLS_EMAIL=<you@domain.com>` to auto-request TLS after DNS points to the VPS

## 1) Provision and secure the VPS

```bash
sudo apt-get update -y
sudo apt-get install -y nginx postgresql postgresql-contrib jq curl git ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2) Create local PostgreSQL database

```bash
sudo -u postgres psql -c "CREATE USER alfab_app WITH PASSWORD '<strong-password>';"
sudo -u postgres psql -c "CREATE DATABASE alfab OWNER alfab_app;"
sudo -u postgres psql -c "ALTER ROLE alfab_app SET client_encoding TO 'utf8';"
```

Set app connection string:

```bash
export TARGET_DATABASE_URL='postgres://alfab_app:<strong-password>@127.0.0.1:5432/alfab'
```

## 3) Migrate data from AWS RDS to VPS PostgreSQL

From this repository root:

Backup-only export (safe first step):

```bash
export AWS_REGION='ap-southeast-2'
export SECRET_ID='alfab/prod/database'
export SOURCE_DB_INSTANCE_ID='alfab-prod-pg'
export DUMP_ONLY=1
./scripts/migrate-rds-to-vps-postgres.sh
```

Full export + restore to the VPS database:

```bash
export AWS_REGION='ap-southeast-2'
export SECRET_ID='alfab/prod/database'
export SOURCE_DB_INSTANCE_ID='alfab-prod-pg'
export TARGET_DATABASE_URL='postgres://alfab_app:<strong-password>@127.0.0.1:5432/alfab'
./scripts/migrate-rds-to-vps-postgres.sh
```

Notes:

- Run migration from a host that can reach the private RDS endpoint (same VPC, VPN, or SSM tunnel).
- The script auto-starts `alfab-prod-pg` if stopped.
- The script runs `pg_dump` (custom format) and `pg_restore --clean --if-exists`.
- If it had to start RDS, it stops it again at the end (`STOP_SOURCE_AFTER=1` by default).

Example with an SSM tunnel (local machine):

```bash
aws ssm start-session \
  --target <bastion-or-ec2-instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["alfab-prod-pg.c9ym6ee0m0sm.ap-southeast-2.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}'
```

Then run migration in a second terminal with overrides:

```bash
export SOURCE_HOST_OVERRIDE='127.0.0.1'
export SOURCE_PORT_OVERRIDE='15432'
./scripts/migrate-rds-to-vps-postgres.sh
```

## 4) Deploy app on VPS

```bash
sudo mkdir -p /opt/alfab/current
sudo chown -R "$USER":"$USER" /opt/alfab
git clone <your-repo-url> /opt/alfab/current
cd /opt/alfab/current
npm ci
```

Create runtime env file:

```bash
sudo tee /etc/alfab.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://alfab_app:<strong-password>@127.0.0.1:5432/alfab
DATABASE_SSL=false
DATABASE_SSL_REJECT_UNAUTHORIZED=false
NODE_OPTIONS=--max-old-space-size=384
ADMIN_PASSWORD=<admin-password>
EOF
sudo chmod 600 /etc/alfab.env
```

Run the existing deploy script:

```bash
cd /opt/alfab/current
./scripts/ec2-deploy.sh
```

## 5) Rewire domain (alfabvic.com.au)

Current name servers are GoDaddy (`ns23.domaincontrol.com`, `ns24.domaincontrol.com`), so change records there:

- `A` record for `@` → `<new-vps-ip>`
- `A` record for `www` → `<new-vps-ip>`
- TTL: `300` during cutover, then back to `3600` after verification

Optional check:

```bash
dig +short A alfabvic.com.au
dig +short A www.alfabvic.com.au
```

## 6) TLS certificate

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d alfabvic.com.au -d www.alfabvic.com.au
```

## 7) Post-cutover checks

- `https://alfabvic.com.au/login` loads.
- Quote calculator CRUD works.
- Order management and billing pages load.

## 8) Final AWS cleanup after confirmation

After 24-48 hours of clean production traffic:

1. Take one final logical backup from VPS (`pg_dump`) and store off-box.
2. Delete `alfab-prod-pg` in RDS.
3. Delete/rotate `alfab/prod/database` secret.
4. Remove leftover AWS resources not used by ALFAB.
