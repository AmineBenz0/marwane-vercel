# Integrated corrections — production database migration runbook

**Status:** PREPARED, NOT EXECUTED. Do not enable correction writes or merge PR #105 until the gates below pass.

## Verified production target and baseline (10 November 2026)

- Supabase project: `pudpijigevertmjmbtmc` (`comptabilite-db`, `eu-west-3`, PostgreSQL 17)
- Installed and recorded migration: `20261109235054_production_correction_history_foundation`
- Existing immutable correction-operation/revision tables and both row-version capture triggers are active
- Missing: `paiements.nature`, `transactions.stock_revision`, `transactions.quantite_annulee`, `egg_sale_allocations.quantite_livree`
- Verified empty at preflight: transactions, payments, cash, bank movements and egg-sale allocations (but **other production tables contain business data**)
- Current `protect_financial_identity` is the original immutable guard; the new financial-edit guard must be installed atomically with the columns

**The exact release target must be rechecked immediately before any production migration.** A financial row inserted after this audit causes the new migration to refuse to execute.

## Migration source of truth

Use ONLY:

`backend/migrations/production_integrated_corrections_atomic.sql`

This combines the following reviewed candidate SQL effects in a **single transaction**, in order:
1. `production_integrated_correction_compatibility.sql` — delivered-egg backfill, payment settlement and cancelled-quantity compatibility
2. `stock_correction_revisions.sql` — stock revision marker
3. `audited_payment_corrections.sql` — audited amount/date correction guard
4. `20261029210000_phase3_cash_bank_payment_corrections.sql` — final cash/bank routing guard

The installed `production_correction_history_foundation.sql` is **not** included and must never be replayed.

The combined migration first obtains short-lived table locks, checks the production-like foundation and the empty financial baseline, and finally verifies that all columns and the audited payment guard exist. Any error within a database transaction rolls the complete candidate migration back.

## Acceptance gates, in order

- [ ] GitHub Actions migration-validation runs the **exact current PR commit** on disposable PostgreSQL and passes.
- [ ] The intentional rollback rehearsal proves none of the four compatibility columns survive an interrupted migration.
- [ ] The native PostgreSQL correction suite and backend/frontend regression suites pass.
- [ ] Confirm the production project ref, row counts, identity-trigger names, original financial guard and active revision triggers immediately before the migration.
- [ ] Export a restorable, credential-protected **full production database backup** (schema and data, including roles/grants/policies where relevant). Do not upload credentials or customer data into chat. Supabase Free projects do not receive the automatic daily backups offered on paid tiers; use a local/off-site logical dump or another verified option.
- [ ] **Rehearse restoring the backup into an isolated PostgreSQL target**, then compare schema, table counts and representative business data. Merely creating a dump is not sufficient.
- [ ] Document a tested application rollback, maintenance window and reviewer approval for the exact migration and application commit.
- [ ] Run migration **once as a single migration transaction**, recorded in Supabase migration history. Do not execute each staged SQL part independently.
- [ ] Validate all postconditions, existing data counts, RLS/grants, audit/revision triggers and financial immutability checks before deploying the application.
- [ ] Keep `ENABLE_CORRECTION_WRITES=False` and `VITE_ENABLE_CORRECTION_WRITES` disabled until separate authenticated feature acceptance is completed.

## Read-only post-migration checks

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND (
    (table_name='transactions' AND column_name IN ('row_version','stock_revision','quantite_annulee'))
    OR (table_name='paiements' AND column_name IN ('row_version','nature'))
    OR (table_name='egg_sale_allocations' AND column_name='quantite_livree')
  )
ORDER BY table_name,column_name;

SELECT c.relname AS table_name,t.tgname,t.tgenabled
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('transactions','paiements')
  AND t.tgname IN ('trg_correction_version','trg_correction_capture')
  AND NOT t.tgisinternal
ORDER BY c.relname,t.tgname;

SELECT p.proname, pg_get_functiondef(p.oid) LIKE '%app.correction_operation_id%' AS audited_guard_installed
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='protect_financial_identity' AND p.pronargs=0;
```

Do not automatically repair any unexpected data discrepancy. If a migration fails, check that the transaction rolled back; if it succeeds but postconditions fail, keep the correction writer disabled and investigate before deploying the new app.

**References:** Supabase docs `https://supabase.com/docs/guides/platform/backups` and `https://supabase.com/docs/guides/deployment/database-migrations`.
