# Database schema release check

Vercel runs `backend/scripts/check_database_schema.py` before building the frontend.
The check uses `DATABASE_URL` with the existing least-privilege runtime role and
the current SQLAlchemy metadata. It checks all mapped tables and columns, probes
read permissions without retrieving records, and checks the LC reversal foreign
key and unique index. Its transaction is read-only; it never applies migrations.
Connection and query timeouts are bounded, and failures never log credentials.

Apply reviewed migrations with a separate maintenance connection before pushing
code that depends on new database fields. The Supabase maintenance SQL and Alembic
are alternative migration paths; do not blindly run Alembic from an untracked
existing Supabase schema. This project's existing production schema was created
through SQL and has no `alembic_version` table.

For a new, empty database, use `supabase_bootstrap.sql`. It creates all 27
current application tables, applies the SQL compatibility changes (including LC
usage/reversal constraints), and seeds the three known buildings in one
transaction. It intentionally creates no default administrator credentials;
provision the first user through a controlled setup process. This file is for
fresh databases only. For an existing database, apply the reviewed incremental
migration instead of rerunning the bootstrap.

For the LC reuse release, apply `supabase_migrations/0004_lc_usage_reuse.sql` as one
transaction. It is safe to replay, retains legacy cancellation audit columns,
converts each cancelled cession's bilateral links to one reversal pointer, and
normalizes LC availability only during the initial field backfill. A rerun does
not reset usage versions or financial state. Ambiguous cancellation history aborts
the transaction for review. Migrations fail quickly if active requests block their
locks; retry after the traffic has subsided.

To run the same read-only preflight with configured environment variables:

```sh
uv run --no-project --python 3.12 --with-requirements requirements.txt python -I backend/scripts/check_database_schema.py
```

CI also runs the check after Alembic migration and runs the maintenance SQL's
regression tests against synthetic data in isolated PostgreSQL schemas, rolling
those transactions back. For local PostgreSQL tests, set
`POSTGRES_MIGRATION_TEST_URL` to a disposable database whose role can create test
schemas, then run from `backend`:

```sh
python -m pytest --override-ini addopts='' tests/test_database_schema.py tests/test_lc_schema_migration.py tests/test_lc_cession_cancellation.py -q
```

## Shared arrival lots

Before deploying the shared-lot release, apply
`supabase_migrations/0005_shared_production_lots.sql` with the Supabase maintenance
connection. The existing production database is SQL-managed: do not run the
entire Alembic chain against it. The SQL is transactional and replayable, adds
`lots_production` and `cycles_production.id_lot`, retains production and
transaction IDs, and grants only SELECT/INSERT/UPDATE to the runtime role.

Each old building cycle becomes a separate historical parent because shared
arrivals cannot be inferred safely from matching dates. New arrivals are created
once with explicit building allocations whose sum must equal the incoming count.
The parent owns arrival, starting age, formula progression and closure. Existing
common fields on allocations are compatibility snapshots for old SQL reports,
synchronized in the same transaction. Buildings cannot edit or close a shared
lot independently. Counts can be corrected for the same set of buildings,
provided no corrected count is below recorded mortality; transfers require a
separate future workflow.

After applying the migration, run the existing read-only schema preflight, then
release the tested branch. The new application must not be deployed against the
old schema. CI covers migration replay and history preservation in isolated
PostgreSQL schemas.
