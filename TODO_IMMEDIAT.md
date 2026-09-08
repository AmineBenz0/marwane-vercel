# Vercel / Supabase operational checklist

The former Azure/Docker checklist is obsolete. Use this release checklist for
the current architecture.

## Before merge

- [ ] Backend tests, frontend lint, and production build are green.
- [ ] Alembic graph has one head and migrations validate on a staging database.
- [ ] No secrets are present in tracked files or Git history; any historical credential has been revoked.
- [ ] Dependency audit has no unresolved high or critical findings.
- [ ] Preview smoke tests cover login, transactions, payments, alerts, stock, and reports.

## Supabase

- [ ] Confirm the project, database, and migration target before applying changes.
- [ ] Back up production and verify PITR retention.
- [ ] Apply Alembic migrations with the migration role, never with an application credential.
- [ ] Verify RLS is enabled on every public application table.
- [ ] Verify anonymous grants are revoked and authenticated policies are present.
- [ ] Run Security Advisor and attach the result to the release record.
- [ ] Run `python backend/scripts/check_integrity.py` and resolve all high findings.
- [ ] Run `python backend/scripts/check_database_security.py` and attach the table/RLS/role/grant inventory.

## Vercel

- [ ] Configure `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `SECRET_KEY`, `CRON_SECRET`, and `ENVIRONMENT` in the correct scopes.
- [ ] Keep privileged database credentials server-side; never expose them as `VITE_*` variables.
- [ ] Confirm the Vercel Cron route returns 200 with the platform Authorization header.
- [ ] Validate `/api/v1/health/live`, `/api/v1/health/ready`, OpenAPI, and the client shell.
- [ ] Promote only the validated deployment.
- [ ] Keep the prior deployment available for application rollback.

## After promotion

- [ ] Run authenticated desktop and mobile smoke flows.
- [ ] Verify one real receivable payment and one payable payment with reconciliation.
- [ ] Verify a BOM transformation changes raw-material and finished-product balances.
- [ ] Verify monthly report totals against the reconciliation output.
- [ ] Monitor API/database failures and scheduled-job errors for 24 hours.
