# Enterprise release acceptance checklist

This checklist is the release source of truth for the enterprise remediation
waves. A release is not promoted until every applicable item has evidence
attached to the release record.

## Security and operations

- [ ] Staging and production Supabase targets are confirmed.
- [ ] Backup/PITR retention is verified and a restoration drill is recorded.
- [ ] Alembic has one head and the complete migration chain succeeds on a staging clone.
- [ ] Every exposed public table has RLS enabled.
- [ ] Anonymous grants are revoked unless explicitly required.
- [ ] Direct Supabase `authenticated` grants are revoked; FastAPI JWT policies
      are reviewed for the single-tenant model.
- [ ] Security Advisor has no unresolved high or critical findings.
- [ ] Secrets are absent from tracked files and Git history; rotated credentials are recorded.
- [ ] Any credential previously present in `local-admin-credentials.txt` or Git history has been revoked and replaced.
- [ ] `DATABASE_URL`, migration credentials, `SECRET_KEY`, `CRON_SECRET`, and environment scopes are verified.

## Financial integrity

- [ ] Payment status is calculated from valid payment records, including partial, overdue, cheque, and overpayment states.
- [ ] Cash and bank movements reconcile with payment and charge sources.
- [ ] Corrections use void/reversal records with user, timestamp, reason, and source references.
- [ ] LC usage is unique and cancelled payments do not consume an LC.
- [ ] The read-only reconciliation script reports no high-severity issues.
- [ ] A real receivable and payable payment has been verified end to end.

## Receivables, payables, and alerts

- [ ] `/creances` and `/dettes` work on desktop and mobile.
- [ ] Search, status, client/supplier, due-date, overdue, sorting, and pagination filters work.
- [ ] Multiple payments and the mark-paid shortcut preserve the canonical balance.
- [ ] Overdue alerts are persistent, duplicate-safe, readable, and markable as read.
- [ ] The scheduled alert route rejects invalid secrets and succeeds with the configured Vercel Cron authorization.

## Products, BOM, inventory, and costing

- [ ] Product types are selectable, validated, and backfilled without changing legacy meaning.
- [ ] A BOM rejects invalid input/output types, non-positive quantities, circular composition, and duplicate active versions.
- [ ] A transformation previews requirements, rejects insufficient stock, and commits atomically.
- [ ] Raw-material consumption, finished-product output, weighted cost, idempotent retry, and reversal are verified.
- [ ] Legacy egg-production stock calculations remain unchanged.

## Search, reporting, and exports

- [ ] Unified search returns permission-filtered grouped results with accent-insensitive matching.
- [ ] The monthly report returns verified canonical backend totals.
- [ ] Excel and PDF exports match the visible filtered data and work on supported browsers.

## Quality gates

- [ ] Backend tests and linting pass.
- [ ] Frontend linting, unit tests, and production build pass.
- [ ] Dependency audit has no high or critical findings.
- [ ] Secret scanning passes.
- [ ] Authenticated Playwright desktop and mobile workflows pass.
- [ ] Preview smoke tests pass against the migrated staging database.
- [ ] Production smoke tests pass after promotion.
- [ ] Monitoring shows no repeated API, database, cron, or reconciliation failures during the observation window.

## Rollback evidence

- [ ] The previous Vercel deployment is retained as a rollback candidate.
- [ ] Database changes have a corrective-forward migration plan.
- [ ] Financial corrections use reversals rather than destructive production rollback.
