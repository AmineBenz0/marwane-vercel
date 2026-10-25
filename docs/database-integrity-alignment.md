# Database integrity alignment

The SQL-managed production database and the Alembic-managed staging database
have compatible application columns but historically different integrity rules.
`supabase_migrations/20261024180624_align_database_integrity.sql` aligns the reviewed
rules without copying or rewriting business records or replaying Alembic history.

## Scope

- Match 16 database defaults to the current application, including 100-week cycles.
  Defaults affect omitted values on future inserts, not existing lot schedules.
- Retain the union of both environments' ten differing validation checks:
  positive expense/bank amounts, bank directions, product categories,
  transformation quantities/directions, non-negative egg counts/weights,
  and exactly one client/supplier owner for an LC.
- Add eight integrity indexes where absent: active payment/expense uniqueness
  in each cash/bank ledger, one non-cancelled payment per LC, one active BOM per
  output product, unique LC references, and unique user email addresses.
- Protect historical financial, transaction, stock and production rows from
  physical deletion. Protect recorded payment/cash/bank identity from overwrites.
  Existing cancellation, reversal, notes and status changes remain possible.
- Deny runtime deletion of historical tables and modification of correction
  journal entries. The runtime can still read and append those records.
- Allow the runtime to read vaccines and update `prix_defaut` only, preserving
  catalogue price changes from the tariff screen and daily entry workflow.

Six invoker trigger functions pin their search path to `pg_catalog` and cannot
be invoked directly by anonymous/authenticated Supabase roles. They use only
the trigger's old/new record, without privileged cross-table access.

The migration does not install or alter `audit_transaction_changes`, copy the
unused cash-balance view or `productions.reforme` column, rename equivalent
constraints, remove duplicate query indexes, or upgrade PostgreSQL. Existing
idempotency indexes remain in place even when their names/predicates differ.

## Apply and verify

1. Inspect the live schema and preflight existing records for the proposed checks
   and duplicate rules. Resolve conflicts through an approved business correction;
   this migration never silently repairs them.
2. Record per-table row counts and content hashes before applying.
3. Apply the exact migration to staging using the maintenance connection.
   It is transactional, with a 5-second lock timeout and a 60-second statement
   timeout. A validation, uniqueness or locking failure rolls back the migration.
4. Run `backend/scripts/sql/verify_database_alignment.sql`. Success returns no
   issues. Compare the row counts/hashes, and exercise price edits, payment/LC
   cancellation/reuse and expense/stock reversals.
5. Apply the same reviewed file to production, then repeat the read-only
   verification and data fingerprints.

The file is replayable. Already-present checks/indexes remain in place and all
new checks are validated. Trigger/policy replacements are performed atomically.
No application deployment is needed to activate these database protections.
Do not use a schema reset or the full Alembic upgrade chain on production.

## Regression coverage

`backend/tests/test_database_alignment.py` creates synthetic mapped tables in a
unique schema, grants a limited runtime role, applies the migration and rolls
everything back. It covers replay and history preservation, invalid values,
deletion/overwrite protection, cancellation followed by reuse, vaccine column
permissions and atomic rejection of invalid pre-existing data.

Run on a disposable PostgreSQL database whose maintenance role can create test
schemas and, if missing, the three test roles:

```sh
cd backend
POSTGRES_MIGRATION_TEST_URL='<disposable PostgreSQL URL>' \
  python -m pytest --override-ini addopts='' tests/test_database_alignment.py -q
```

Release validation also reconstructs both live schema variants and applies the
migration twice, and runs the existing payment, LC, vaccine and egg-stock
application tests with the alignment installed on disposable PostgreSQL.

## Applied environments

Applied on 2026-10-25, first to staging and then to production:

| Environment | Supabase migration version | Result |
|---|---|---|
| Staging | `20261025101401` | Applied; postflight returned zero issues |
| Production | `20261025101528` | Applied; postflight returned zero issues |

The migration name is `align_database_integrity` in both histories; the source
file is identical. Per-table content hashes and counts matched before/after
for all 31 staging and 30 production application tables. Staging's existing
stock allocations were preserved. No new security-advisor findings appeared;
staging's mutable-search-path function findings decreased from ten to four.

Staging also passed synthetic, rolled-back checks for vaccine price editing,
history protection, invalid egg counts, cash/bank duplicate prevention, and LC
cancellation/reuse. The maintenance connection cannot assume `app_runtime`, so
live grants were checked through the postflight; execution as that role was
verified separately on disposable PostgreSQL. No temporary records remain.

## Validation results and separately identified issues

Validation completed on 2026-10-25:

- 18 new migration/permissions tests passed on disposable PostgreSQL (PGlite).
- 70 existing application workflow tests passed with the alignment installed.
- Both current live schema variants passed reconstruction, migration replay and
  read-only postflight. Staging's newer `egg_sale_allocations` table is preserved.
- One reconciliation test intentionally overwrites financial history to create
  corruption. It passes in the original SQLite suite and is excluded from the
  aligned PostgreSQL suite because the new trigger correctly rejects that write.

PostgreSQL application testing found that the existing transformation reversal
query uses `FOR UPDATE` with joined collections, attempting to lock the nullable
side of an outer join. The same failure reproduces without this migration.
This application query issue is separate from the database alignment; no
transformation endpoint is changed in this release.

The invalid-bank-ID vaccine test also fails without the migration on PostgreSQL:
the charge insert reaches its existing foreign key before bank validation,
returning HTTP 500 instead of 400. The operation rolls back, but its error handling
needs a separate application fix. These two baseline failures were excluded from
the aligned workflow run; they are not reported as passing tests.
