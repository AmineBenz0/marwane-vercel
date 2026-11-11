# Release 4 — Deferred-delivery scheduling and unallocated remainder closure

**Base:** production `main` after Release 3 (`d1f155ff`).  
**Candidate:** `codex/release4-deferred-close-20261111` / PR #108.

## Business contract and staging reconciliation

Production uses automatic fulfillment: each `egg_sale_allocations.quantite` is already
`quantite_livree` when assigned. Its `quantite_en_attente` is the unsourced
remainder, **not** an undelivered reservation. Staging uses a separate
reservation-vs-delivery interpretation, so its generic cancellation/release
logic **must not** be copied to production.

**Included:**
- A dedicated version-checked date change, refusing estimates earlier than
  the original transaction date. The date is informational; transaction and
  payment dates, reservation priority, stock and financial ledgers do not change.
- A dedicated version-checked close action for only unallocated stock; the
  API rejects unexpected stock origins, already-completed deliveries, stale
  version or pending quantity, and reserved-but-not-delivered allocations.
- Existing `quantite_annulee` records the closed quantity; no allocation or
  stock movement is reversed. Auto-allocation subtracts the closed amount and
  refreshes commitments after acquiring the existing building/product locks.
- Append-only `transactions_audit` events for replanification and closure;
  the stock history excludes zero-quantity administrative events from its
  covered-quantity calculations.
- Delivery panel exposes both actions with explicit confirmation. **Closing
  the unallocated stock requirement is NOT an invoice correction or refund.**
  Sale amount, credit and payment histories are intentionally untouched.

**Excluded:** changing financial obligations of partially fulfilled sales,
refunding clients, releasing already fulfilled allocations, Phase 6E transaction
reactivation/conversion, reports and Suivi global.

## Data and migration

The current production schema already includes `transactions.quantite_annulee`,
`transactions.row_version`, `egg_sale_allocations.quantite_livree`,
the bounded cancellation constraint, correction-version trigger and transaction
audit trigger. The `app_runtime` role has the existing UPDATE and audit INSERT
rights. Release 4 does **not** need to apply SQL or overwrite stage/production
data. Recheck these assumptions on the exact production cutover.

## Validation and release gates

1. Exact candidate CI must pass: backend and frontend, migration validation,
   secrets audit, Release 1/2/3 native PostgreSQL, **Release 4 native PG tests**.
   Secret-dependent browser E2E and DB-security jobs, if skipped, are not green.
2. Verify date before transaction, no-op date, stale version, repeated close,
   mismatched pending quantity, and non-delivered allocation failures.
3. Verify close of a partly fulfilled paid sale leaves money untouched, excludes
   canceled units from FIFO, allows later eligible promises to receive new stock,
   and preserves dated stock/audit history.
4. Review business meaning of the close action: it deliberately changes stock
   obligations **without changing the financial debt**. Do not promote if
   users require invoice reduction/refund as part of cancellation; that requires
   a separate audited financial design and acceptance.
5. Confirm a working authenticated deployment or disclose the browser
   acceptance gap; never claim CI native API tests are browser acceptance.
6. Reconcile target production SHA, environment and schema; then merge and
   check Vercel READY, authenticated reads, and application error telemetry.

## Rollback and rollout

No schema change is necessary. Previous stable application revision can be
restored if no Release 4 operations were recorded. Once operators have closed
remainders, a rollback to old allocation code is **not safe**: it ignores
`quantite_annulee` when assigning stock, potentially reopening closed
obligations. Prefer a forward fix and preserve all audit/history records.

## Release status

Candidate in draft PR #108. Not merged, no Release 4 production deployment.

## Phase 0 safety gate (2026-11-11)

The original stock-only remainder closure has been **disabled at both API routing and UI levels** pending the commercial credit-note and net-balance implementation. Existing historical data and stock calculations are retained, and rescheduling remains enabled. Regression checks assert that clients cannot submit the old stock-only operation.

The two original positive closure tests are kept skipped intentionally as Phase 4 references; they must be redesigned to assert **atomic stock + financial cancellation** before re-enabling the route. This candidate must stay in draft and must not be promoted as a complete Release 4.
