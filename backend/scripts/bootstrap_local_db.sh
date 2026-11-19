#!/usr/bin/env bash
# Build the full schema on an EMPTY, disposable PostgreSQL database.
#
# The schema is Alembic migrations (three parallel heads, hence "heads") plus
# reviewed raw SQL files applied in a fixed order. This mirrors the CI
# "migration-validation" job. Never run it against staging or production.
#
# Usage (from backend/):
#   DATABASE_URL="postgresql://postgres@localhost:5432/comptabilite_db?sslmode=disable" \
#     bash scripts/bootstrap_local_db.sh
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the empty local database}"
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to run: DATABASE_URL is not a localhost database." >&2; exit 1 ;;
esac

PSQL_URL="${DATABASE_URL%%\?*}"
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
PY="${PYTHON:-python}"

# Roles the migrations grant to; they are cluster-wide, so create them only once.
psql "$PSQL_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN CREATE ROLE app_runtime NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
SQL

ENVIRONMENT="${ENVIRONMENT:-development}" "$PY" -m alembic upgrade heads

for f in \
  production_correction_history_foundation \
  production_integrated_corrections_atomic \
  production_party_credits_refunds_atomic \
  production_cheque_lc_lifecycle_atomic \
  production_deferred_avoirs_atomic \
  production_deferred_refund_guards_atomic; do
  echo "Applying migrations/$f.sql"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -1 -q -f "migrations/$f.sql" >/dev/null
done

ENVIRONMENT="${ENVIRONMENT:-development}" "$PY" scripts/check_database_schema.py
