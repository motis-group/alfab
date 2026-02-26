#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-}"
MIGRATIONS_DIR="${1:-db/migrations}"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL must be set." >&2
  exit 1
fi

if [[ ! -d "${MIGRATIONS_DIR}" ]]; then
  echo "Migrations directory not found: ${MIGRATIONS_DIR}" >&2
  exit 1
fi

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
create table if not exists schema_migrations (
  version text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
SQL

shopt -s nullglob
migration_files=("${MIGRATIONS_DIR}"/*.sql)

if [[ ${#migration_files[@]} -eq 0 ]]; then
  echo "No migration files found in ${MIGRATIONS_DIR}."
  exit 0
fi

for file in "${migration_files[@]}"; do
  version="$(basename "${file}")"
  checksum="$(sha256sum "${file}" | awk '{print $1}')"

  existing_checksum="$(psql "${DATABASE_URL}" -Atq -v ON_ERROR_STOP=1 -c "select checksum from schema_migrations where version = '${version}'")"

  if [[ -n "${existing_checksum}" ]]; then
    if [[ "${existing_checksum}" != "${checksum}" ]]; then
      echo "Checksum mismatch for already-applied migration ${version}." >&2
      echo "Expected ${existing_checksum}, got ${checksum}." >&2
      exit 1
    fi

    echo "Skipping already-applied migration ${version}."
    continue
  fi

  echo "Applying migration ${version}..."
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${file}"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c "insert into schema_migrations (version, checksum) values ('${version}', '${checksum}')"
  echo "Applied migration ${version}."
done
