# Release 4 — Phase 2 ledger acceptance and deployment gate

**Scope:** code-only candidate on draft PR #108. No production or staging
migration has been applied. Phase 8 will perform the isolated staging migration
and authenticated end-to-end verification before any production decision.

## Ledger and its guarantees

`public.avoirs_livraison_differee` is an append-only commercial adjustment
ledger. One row records one cancellation of an **unallocated** portion of an
active deferred customer egg sale. No invoice, settlement or stock row is
rewritten by the migration.

Every ledger row records:

- globally unique `id_avoir` referencing the existing immutable
  `correction_operations.operation_id`; the operation contains immutable
  request hash, actor, request and result payloads;
- the original transaction/client/creator and the effective business date;
- original quantity and **negotiated sale total**, plus before/change/after
  canceled quantities and credit-note totals;
- a database-issued creation timestamp and permanent audit provenance.

The database checks the original sale, actor, operation kind/payload, effective
date, ordered cumulative quantities, pro-rata cumulative rounding and finite
positive original terms. It rejects invalid amounts and duplicate/replayed
operation IDs. The matching operation and ledger row are part of one SQL
transaction. Replaying a request with the same ID and exact payload will be
handled by the Phase 4 endpoint by reading the immutable operation result,
not by inserting a second record.

**Cross-ledger parity:** deferred PostgreSQL constraint triggers check that
`transactions.quantite_annulee` equals the sum of recorded cancellation
quantities and that the cumulative commercial adjustments match the original
agreed amount. A stock-only or finance-only cancellation is rejected at
transaction commit. The original sale amount and payment history stay intact.

**Access:** RLS enabled, no direct browser access for `anon` or
`authenticated`. The dedicated `app_runtime` role has SELECT/INSERT only.
UPDATE/DELETE/TRUNCATE are also rejected by immutable-history triggers.
Trigger functions are SECURITY INVOKER and not publicly executable. There is
no new user-supplied reason field or cash/bank movement.

## Migration order and prerequisites

Production baseline:

1. Existing Release 1 correction history and integrated correction migrations.
2. Existing Release 2 credits/refunds migration.
3. Existing Release 3 cheque/LC lifecycle migration.
4. **Only after staging validation and explicit production approval:**
   `backend/migrations/production_deferred_avoirs_atomic.sql` in one
   transaction with a maintenance role.

The Phase 2 preflight refuses missing Release 3 components, a pre-existing
ledger table and pre-existing nonzero `quantite_annulee` values that have
not been reconciled. This is deliberate: an old stock closure must never be
silently converted to an assumed financial credit.

The migration does not run automatically on branch pushes. Do not run it
against the divergent `staging` branch database without reconciling that
database to the production Release 3 schema.

## Test evidence required to close Phase 2

The GitHub Actions `release4-ledger-native` job provisions **disposable
localhost PostgreSQL 16**, installs Release 1→4 schemas from scratch, and
executes `backend/tests/test_release4_ledger_pg.py`. The tests verify:

- schema RLS, app_runtime grants and immutable triggers;
- two linked partial cancellations and exact cumulative monetary adjustment;
- zero silent updates/deletes or duplicate journal entries;
- rejected stock-only and adjustment-only mutations at the commit gate;
- invalid negotiated amounts, orphan audit operations and subsequent tampering.

The ordinary backend suite uses SQLite, and these native tests skip unless the
target is explicitly the disposable `localhost/comptabilite_db` database
with `ENVIRONMENT=testing`.

## Still intentionally unavailable

There is **no active cancel-remainder API**, no cancellation button, no
customer-credit posting, no refund or settlement. The new ORM model is mapped
but not queried by live projections; Phase 3 will integrate dated net balances.
Phase 4 will wire a locked, version-checked, idempotent stock+avoir writer.
Phases 5–8 will complete credit settlement, reporting, UI and staging QA.

**Important:** The PostgreSQL script must remain un-applied to production until
all later phase checks succeed; green SQL tests alone are not release approval.
