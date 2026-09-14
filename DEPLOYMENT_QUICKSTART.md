# Vercel + Supabase deployment quickstart

This is the supported deployment path for the application. The frontend and
FastAPI serverless API run on Vercel; PostgreSQL runs on Supabase. The Docker
files in this repository are for local development only.

## 1. Configure Supabase

Before changing production data:

1. Create or select the staging Supabase project.
2. Configure the dedicated `app_runtime` and `app_migrator` PostgreSQL roles.
3. Apply the Alembic migrations with `MIGRATION_DATABASE_URL`.
4. Run the read-only security and reconciliation checks.
5. Verify backups/PITR and complete the restoration drill.

The exact operational procedure is documented in
[`TODO_IMMEDIAT.md`](./TODO_IMMEDIAT.md),
[`docs/backup-restore-runbook.md`](./docs/backup-restore-runbook.md), and the
[`enterprise acceptance checklist`](./docs/enterprise-acceptance-checklist.md).

## 2. Configure Vercel

Link the GitHub repository to the Vercel project and configure these variables
in the appropriate Preview and Production scopes:

```text
DATABASE_URL=<Supabase URL using the app_runtime role>
SECRET_KEY=<unique random value, at least 32 characters>
CRON_SECRET=<unique random value, at least 32 characters>
ENVIRONMENT=preview or production
DEBUG=false
ENABLE_AUTH=true
ENABLE_RATE_LIMITING=true
CORS_ORIGINS=https://<deployed-domain>
```

Never expose database credentials or privileged Supabase keys through a
`VITE_*` variable. `MIGRATION_DATABASE_URL` is used only by Alembic and is not
read by the running API. Keep it in the controlled migration job or its
server-side CI secret store, not in the Vercel runtime environment.

## 3. Validate before promotion

The Vercel build runs a runtime configuration preflight before installing
frontend dependencies. A missing or incorrectly scoped runtime credential,
secret, or deployed CORS origin fails the build with the variable name only;
secret values are never printed.

For the candidate deployment, verify:

- `/api/v1/health/live` returns 200 without requiring the database.
- `/api/v1/health/ready` returns 200 against the configured Supabase target.
- The client shell, login, payments, receivables, payables, alerts, stock,
  transformations, and monthly reports work on desktop and mobile.
- The Vercel Cron route succeeds with its `Authorization: Bearer` header.
- The GitHub quality workflow is green, including authenticated E2E when the
  staging secrets and `RUN_E2E=true` are configured.

Production promotion is a controlled release action. Do not promote a preview
until every applicable item in the acceptance checklist has evidence attached
to the release record.

## 4. Rollback

Roll back application code through the previous Vercel deployment. Handle
database changes with corrective-forward migrations and financial changes with
audited reversal records; never delete financial rows or destructively roll
back the production schema.
