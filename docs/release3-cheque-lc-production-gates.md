# Release 3 — Cheque and letter-of-credit lifecycle production cutover

**Release branch:** `codex/release3-cheque-lc-20261110` (PR #107, base = current production `main`).
**Scope:** cheque correction/clearing and auditable LC receipt, supplier usage, cession, bank deposit, cancellation, reuse, and correction preview/apply. Excludes deferred delivery conversion and Suivi global.

## Dependencies and implementation

- Releases 1 and 2 must already be installed, including `correction_operations`, `entity_revisions`, `avances`, `affectations_credit`, and current cash/bank/payment guards.
- The **single** SQL file `backend/migrations/production_cheque_lc_lifecycle_atomic.sql` provides LC origin/receipt/status fields, outgoing-use history, role-classified LC payments, partial uniqueness, versioned correction guards, cheque effective-date credit logic, credit/refund dependencies, role grants, RLS, and postconditions.
- Never replay the original staging `lc_lifecycle.sql`, `lc_lifecycle_runtime_access.sql`, and `instrument_corrections.sql` independently on production. Do not import the entire staging branch; it includes unrelated unreleased code.
- Keep existing credit/refund writers, correction history, and ledger cash/bank immutability protections active.
- LC settlements are non-cash; a cheque only changes cash/bank after clearing. Never create funds from LC supplier usage, duplicate a credit settlement, or revive canceled movements.
- No new user-required arbitrary verification notes or tags. The internal legacy `a_verifier` status must not be exposed as a new UI demand; unverifiable historical LC provenance remains blocked from spending.

## Mandatory acceptance — exact candidate commit

1. **CI**: backend, frontend, secrets, migration-validation, and native financial tests all pass on the exact head SHA. E2E/database-security workflows must be reviewed separately if skipped.
2. **Database rehearsal**: on disposable PostgreSQL, apply foundations (R1, R2), prove Release 3 rollback by deliberate failure, apply Release 3, check schema compatibility, native credit/refund smoke and rollback-only `tests/release3_native_pg_checks.sql`.
3. **Financial workflows**: create valid LC with source client and receipt date; settle supplier without cash/bank debit; transfer/deposit; cancel/reuse; correct reference, amount, date, bank account and holder with preview + audit; verify invalid provenance, stale preview, duplicate outgoing usage, and ledger drift fail closed.
4. **Cheque workflows**: pending -> cleared; changing effective clearing date with append-only movement replacement; rejecting/canceling and re-clearing; refund/credit chronology; disallow modifying funded instrument with active downstream dependency.
5. **Security**: application runtime is `app_runtime`; usage table has RLS enabled and no anon/authenticated grants, only app runtime scoped SELECT/INSERT and cancellation-field updates. Audit and payment history remain immutable.
6. **Regression**: verify tasks, lot production, existing transaction edits, basic deferred delivery, monthly exports, credit/refund balances, client/supplier profiles and cash/bank registers.
7. **Owner acceptance / runtime**: run authenticated browser E2E in an isolated writable test environment; verify production DB target and deployment SHA. Current PR preview may fail Vercel's strict environment check until its secret-bearing preview configuration is provisioned.

## Release sequence

1. Freeze and verify the target `main` SHA; reject an unexpected upstream change.
2. Read-only inspect production Supabase for exact R1/R2 functions, tables, runtime grants, LC counts and source attribution. Verify recoverability appropriate for financial records; do not treat an old staging backup as a production restore point.
3. Apply **one** Release 3 migration to the verified production Supabase project using the migration role. Review transaction/lock behavior and record migration version. If any preflight/postflight check fails, keep the existing app live and investigate; no partial changes should persist.
4. Verify the production DB schema, constraints and grants read-only; only then merge the exact CI-green PR and allow Vercel to deploy `main`.
5. Check Vercel READY deployment SHA, runtime health, authenticated LC/cheque reads and representative safe workflows. Reconcile payment, credit, bank/cash, and LC-usage references; monitor errors.
6. If application deployment fails before traffic: roll back the application build to the previous READY deployment. The database migration is additive and is **not** undone by an application rollback. Any schema reversal requires a separately reviewed corrective migration or proven data restoration procedure.

## Status

The PR is **not ready to merge** until all above gates are met. A successful migration rehearsal alone does not constitute business acceptance.
