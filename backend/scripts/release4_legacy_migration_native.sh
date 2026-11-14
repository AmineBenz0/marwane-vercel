#!/usr/bin/env bash
# ONLY called from GitHub Actions against its throwaway localhost PostgreSQL.
# No staging/prod credentials and no stock/payment rows outside CI.
set -euo pipefail
: "${DATABASE_URL:?disposable localhost DATABASE_URL required}"
case "$DATABASE_URL" in
  postgresql://postgres:postgres@localhost:5432/comptabilite_db) ;;
  *) echo 'Refusing non-disposable PostgreSQL URL' >&2; exit 1 ;;
esac
test "$ENVIRONMENT" = development
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE ROLE app_runtime NOLOGIN"
python -m alembic upgrade heads
for migration in     production_correction_history_foundation.sql     production_integrated_corrections_atomic.sql     production_party_credits_refunds_atomic.sql     production_cheque_lc_lifecycle_atomic.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "migrations/$migration" >/dev/null
done

# This synthetic inactive sale has no payments, and an old stock audit event.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f scripts/release4_legacy_migration_fixture.sql >/dev/null

# Atomicity: canceled historical state and absent financial ledger must remain
# unchanged after an interrupted DDL transaction.
if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1   -f migrations/production_deferred_avoirs_atomic.sql   -c 'SELECT 1 / 0' >/dev/null 2>&1; then
  echo "Interrupted ledger migration unexpectedly committed"; exit 1
fi
test "$(psql "$DATABASE_URL" -At -c "SELECT to_regclass('public.legacy_deferred_cancellations') IS NULL")" = t
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f migrations/production_deferred_avoirs_atomic.sql >/dev/null
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f migrations/production_deferred_refund_guards_atomic.sql >/dev/null
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/release4_staging_readiness.sql >/dev/null

test "$(psql "$DATABASE_URL" -At -c "SELECT count(*) FROM public.legacy_deferred_cancellations")" = 1
test "$(psql "$DATABASE_URL" -At -c "SELECT count(*) FROM public.avoirs_livraison_differee")" = 0
test "$(psql "$DATABASE_URL" -At -c "
  SELECT count(*) FROM public.legacy_deferred_cancellations b
  JOIN public.transactions t USING(id_transaction)
  WHERE b.original_row=to_jsonb(t)
    AND t.est_actif IS FALSE AND t.quantite_annulee=6
    AND NOT EXISTS(SELECT 1 FROM public.paiements p WHERE p.id_transaction=t.id_transaction)
")" = 1

for op in INSERT UPDATE DELETE TRUNCATE; do
  test "$(psql "$DATABASE_URL" -At -c "
    SELECT has_table_privilege('app_runtime','public.legacy_deferred_cancellations','$op')")" = f
done
test "$(psql "$DATABASE_URL" -At -c "
  SELECT has_table_privilege('app_runtime','public.legacy_deferred_cancellations','SELECT')")" = t

# Frozen legacy rows cannot be edited, reactivated or given new credit notes.
for statement in   "UPDATE public.transactions SET quantite=7 WHERE id_transaction=(SELECT id_transaction FROM public.legacy_deferred_cancellations LIMIT 1)"   "UPDATE public.transactions SET est_actif=true WHERE id_transaction=(SELECT id_transaction FROM public.legacy_deferred_cancellations LIMIT 1)" \
  "DELETE FROM public.transactions WHERE id_transaction=(SELECT id_transaction FROM public.legacy_deferred_cancellations LIMIT 1)"; do
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1      -c "$statement" -c "SET CONSTRAINTS ALL IMMEDIATE" >/dev/null 2>&1; then
    echo "Frozen historical cancellation changed"; exit 1
  fi
done
test "$(psql "$DATABASE_URL" -At -c "
  SELECT count(*) FROM public.legacy_deferred_cancellations b
  JOIN public.transactions t USING(id_transaction) WHERE b.original_row=to_jsonb(t)")" = 1
echo "Phase 8 legacy baseline passed: archived sale preserved, no invented credit and privileges fail closed"
