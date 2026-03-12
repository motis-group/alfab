#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
SECRET_ID="${SECRET_ID:-alfab/prod/database}"
SOURCE_DB_INSTANCE_ID="${SOURCE_DB_INSTANCE_ID:-alfab-prod-pg}"
STOP_SOURCE_AFTER="${STOP_SOURCE_AFTER:-1}"
DUMP_ONLY="${DUMP_ONLY:-0}"
DUMP_FILE="${DUMP_FILE:-/tmp/${SOURCE_DB_INSTANCE_ID}-$(date +%Y%m%d-%H%M%S).dump}"
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-}"
SOURCE_HOST_OVERRIDE="${SOURCE_HOST_OVERRIDE:-}"
SOURCE_PORT_OVERRIDE="${SOURCE_PORT_OVERRIDE:-}"
STARTED_SOURCE=0
STOP_HANDLED=0

log() {
  printf '[migrate-rds-to-vps] %s\n' "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command aws
require_command jq
require_command psql
require_command pg_dump
require_command pg_restore

if [[ "${DUMP_ONLY}" != "1" && -z "${TARGET_DATABASE_URL}" ]]; then
  echo "TARGET_DATABASE_URL is required." >&2
  echo "Example: TARGET_DATABASE_URL='postgres://user:pass@vps-ip:5432/alfab' $0" >&2
  exit 1
fi

cleanup() {
  local exit_code=$?
  if [[ "${STOP_SOURCE_AFTER}" == "1" && "${STARTED_SOURCE}" == "1" && "${STOP_HANDLED}" == "0" ]]; then
    log "Stopping source RDS instance ${SOURCE_DB_INSTANCE_ID}."
    aws rds stop-db-instance \
      --region "${AWS_REGION}" \
      --db-instance-identifier "${SOURCE_DB_INSTANCE_ID}" >/dev/null || true
  fi
  exit "${exit_code}"
}

trap cleanup EXIT

log "Reading source database credentials from Secrets Manager (${SECRET_ID}, ${AWS_REGION})."
SECRET_JSON="$(aws secretsmanager get-secret-value \
  --region "${AWS_REGION}" \
  --secret-id "${SECRET_ID}" \
  --query SecretString \
  --output text)"

SOURCE_HOST="$(echo "${SECRET_JSON}" | jq -r '.host // empty')"
SOURCE_PORT="$(echo "${SECRET_JSON}" | jq -r '.port // "5432"')"
SOURCE_DBNAME="$(echo "${SECRET_JSON}" | jq -r '.dbname // empty')"
SOURCE_USER="$(echo "${SECRET_JSON}" | jq -r '.username // empty')"
SOURCE_PASSWORD="$(echo "${SECRET_JSON}" | jq -r '.password // empty')"

if [[ -n "${SOURCE_HOST_OVERRIDE}" ]]; then
  SOURCE_HOST="${SOURCE_HOST_OVERRIDE}"
fi

if [[ -n "${SOURCE_PORT_OVERRIDE}" ]]; then
  SOURCE_PORT="${SOURCE_PORT_OVERRIDE}"
fi

if [[ -z "${SOURCE_HOST}" || -z "${SOURCE_DBNAME}" || -z "${SOURCE_USER}" || -z "${SOURCE_PASSWORD}" ]]; then
  echo "Secret ${SECRET_ID} is missing required keys (host, dbname, username, password)." >&2
  exit 1
fi

SOURCE_STATUS="$(aws rds describe-db-instances \
  --region "${AWS_REGION}" \
  --db-instance-identifier "${SOURCE_DB_INSTANCE_ID}" \
  --query 'DBInstances[0].DBInstanceStatus' \
  --output text)"

if [[ "${SOURCE_STATUS}" == "stopped" ]]; then
  log "Source RDS instance ${SOURCE_DB_INSTANCE_ID} is stopped; starting it."
  aws rds start-db-instance \
    --region "${AWS_REGION}" \
    --db-instance-identifier "${SOURCE_DB_INSTANCE_ID}" >/dev/null
  aws rds wait db-instance-available \
    --region "${AWS_REGION}" \
    --db-instance-identifier "${SOURCE_DB_INSTANCE_ID}"
  STARTED_SOURCE=1
elif [[ "${SOURCE_STATUS}" != "available" ]]; then
  log "Source RDS instance status is '${SOURCE_STATUS}'; waiting for available."
  aws rds wait db-instance-available \
    --region "${AWS_REGION}" \
    --db-instance-identifier "${SOURCE_DB_INSTANCE_ID}"
fi

log "Checking source PostgreSQL connectivity."
PGPASSWORD="${SOURCE_PASSWORD}" psql \
  "host=${SOURCE_HOST} port=${SOURCE_PORT} dbname=${SOURCE_DBNAME} user=${SOURCE_USER} sslmode=require connect_timeout=10" \
  -v ON_ERROR_STOP=1 \
  -c "select now();" >/dev/null

log "Creating compressed dump: ${DUMP_FILE}"
PGPASSWORD="${SOURCE_PASSWORD}" pg_dump \
  -h "${SOURCE_HOST}" \
  -p "${SOURCE_PORT}" \
  -U "${SOURCE_USER}" \
  -d "${SOURCE_DBNAME}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --verbose \
  --file "${DUMP_FILE}" \
  --sslmode=require

if [[ "${DUMP_ONLY}" == "1" ]]; then
  log "DUMP_ONLY=1 set; skipping restore step."
else
  log "Checking target PostgreSQL connectivity."
  psql "${TARGET_DATABASE_URL}" -v ON_ERROR_STOP=1 -c "select current_database();" >/dev/null

  log "Restoring dump into target database."
  pg_restore \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --verbose \
    --dbname="${TARGET_DATABASE_URL}" \
    "${DUMP_FILE}"
fi

if [[ "${STOP_SOURCE_AFTER}" == "1" && "${STARTED_SOURCE}" == "1" ]]; then
  log "Stopping source RDS instance ${SOURCE_DB_INSTANCE_ID} to avoid further compute charges."
  aws rds stop-db-instance \
    --region "${AWS_REGION}" \
    --db-instance-identifier "${SOURCE_DB_INSTANCE_ID}" >/dev/null
  STOP_HANDLED=1
fi

log "Migration completed successfully."
log "Dump file retained at ${DUMP_FILE}"
