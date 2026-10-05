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

For the LC reuse release, apply `supabase_migrations/0004_lc_usage_reuse.sql` as one
transaction. It is safe to replay, retains legacy cancellation audit columns,
converts each cancelled cession's bilateral links to one reversal pointer, and
normalizes LC availability only during the initial field backfill. A rerun does
not reset usage versions or financial state. Ambiguous cancellation history aborts
the transaction for review. Migrations fail quickly if active requests block their
locks; retry after the traffic has subsided.

To run the same read-only preflight with configured environment variables:

```sh
uv run --no-project --python 3.12 --with-requirements requirements.txt python backend/scripts/check_database_schema.py
```

CI also runs the check after Alembic migration and runs the maintenance SQL's
regression tests against synthetic data in isolated PostgreSQL schemas, rolling
those transactions back. For local PostgreSQL tests, set
`POSTGRES_MIGRATION_TEST_URL` to a disposable database whose role can create test
schemas, then run from `backend`:

```sh
python -m pytest --override-ini addopts='' tests/test_database_schema.py tests/test_lc_schema_migration.py tests/test_lc_cession_cancellation.py -q
```
