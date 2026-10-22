# Staging workflow

The permanent integration branch is `staging`. Vercel builds it as a Preview deployment against the `marwane-staging` database.

| Branch | Purpose | Database |
| --- | --- | --- |
| `staging` | Integrate features and run owner/tester validation | `marwane-staging` |
| `main` | Reviewed production releases | Production database |
| Feature branches | Isolated development and pull requests | Local test database or explicitly configured Preview database |

## Feature integration

1. Start from the latest `staging` commit in a clean checkout.
2. Open feature pull requests against `staging`.
3. Resolve conflicts while preserving existing staging fixes.
4. Run the relevant backend and frontend regression tests. Run PostgreSQL migration and concurrency checks against an isolated PostgreSQL test database.
5. Apply reviewed migrations to staging, preserving the baseline and migration mapping.
6. Merge the feature pull request into `staging`, then check the Vercel build and runtime health.
7. Validate the complete workflow through the staging interface before proposing a production release.

Vercel's `DATABASE_URL`, `SECRET_KEY`, `CRON_SECRET`, `CORS_ORIGINS`, and runtime flags are scoped to the `staging` Preview branch. Production variables remain scoped to Production. Branch-scoped Secrets can be moved by updating their branch scope; their values do not need to be retrieved.

The former `codex/fix-vercel-qa` branch is retained for history. Its automatic deployments are disabled after the staging branch transition.

## Independent lot rollout

The independent-lot migration keeps production and transaction references on their original `id_cycle` and records source snapshots in `independent_lot_migration_map`. Do not replay migrations unrelated to this release as part of conflict resolution.

Existing mapping rows marked `review_required` require documented reconciliation. A successful application build does not close those review items or replace the owner/tester workflow.
