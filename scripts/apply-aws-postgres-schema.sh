#!/usr/bin/env bash

set -euo pipefail

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not installed."
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set."
  exit 1
fi

echo "Applying base order/costing schema..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "docs/order-management-schema.sql"

echo "Applying billing schema..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "docs/billing-schema.sql"

echo "AWS PostgreSQL schema apply complete."
