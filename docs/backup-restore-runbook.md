# Supabase backup and restore runbook

This runbook is the operational procedure for the Vercel/Supabase release.
It is intentionally written without credentials or project-specific secrets.
Run the drill against a disposable staging project or clone before production
promotion.

## Responsibilities and prerequisites

- The release owner confirms the target Supabase project and the expected
  restore point before any operation.
- The database owner verifies that automated backups and PITR retention meet
  the client retention policy.
- The operator uses a migration credential for schema operations and keeps the
  runtime credential server-side. Never paste either credential into issues,
  logs, or chat.
- The application is placed in maintenance/read-only mode if the chosen
  restore procedure can expose concurrent writes.

## Pre-release evidence

Record the following in the release ticket:

1. Supabase project reference and environment (`staging` or `production`).
2. Backup/PITR retention and the latest successful backup timestamp.
3. Alembic revision currently applied.
4. A read-only integrity report from
   `python backend/scripts/check_integrity.py`.
5. A database security inventory from
   `python backend/scripts/check_database_security.py`.
6. Operator, UTC timestamp, and the selected restore-point identifier.

## Restoration drill

1. Create or select a disposable staging target. Do not use the production
   database as the first restore target.
2. Restore the selected Supabase backup or PITR snapshot into that target using
   the Supabase dashboard or the approved provider procedure.
3. Confirm the restored schema revision and apply only the migrations required
   to reach the release candidate, using `MIGRATION_DATABASE_URL`.
4. Point a temporary Vercel preview at the restored target. Configure
   `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `SECRET_KEY`, `CRON_SECRET`, and
   explicit `CORS_ORIGINS` in the preview environment only.
5. Run the live and ready health checks, authenticated desktop/mobile smoke
   tests, and the read-only integrity/security scripts.
6. Compare record counts and canonical totals for clients, suppliers,
   transactions, payments, charges, bank movements, cash movements, BOMs, and
   stock movements with the source release evidence.
7. Execute one reversible staging workflow: create a payment, verify the
   balance, void it with a reason, and verify the reversal and audit record.
8. Record restore start/end timestamps, observed RPO/RTO, validation results,
   and any discrepancy. Destroy the disposable target according to the
   provider retention policy after the evidence is stored.

## Production recovery

For a real incident, obtain explicit incident-owner approval before restoring.
Select the latest safe PITR point that meets the incident timeline, preserve
the original database for forensic review when possible, and document the
chosen RPO/RTO. Deploy the compatible application version only after schema
compatibility is confirmed.

Application rollback uses a Vercel deployment rollback. Database rollback uses
corrective-forward migrations and audited financial reversals; never use a
destructive schema rollback or delete financial rows to make balances appear
correct.

## Completion criteria

The drill is complete when the restored target passes the health checks,
security inventory, reconciliation check, authenticated smoke flows, and the
reversible payment test, with evidence attached to the release record. A
production release remains blocked until this evidence exists.
