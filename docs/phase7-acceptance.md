# Phase 7 — Indirect consumers and history consistency

Date: 5 November 2026
Scope: staging implementation and regression verification. **Phase 7 is not yet production-approved.**

## Purpose

Prevent one financial correction, soft cancellation, lot attribution or transaction pagination boundary from producing different totals in the transaction register, dashboard, `Suivi global` and exports. Historical rows are retained. No new mandatory input fields or accounting allocation formulas are introduced.

## Changes made

1. **Transaction register / exports:** All advanced- and quick-filter totals and Excel/PDF exports use the complete paginated result instead of an unadvertised first-1,000-row subset. The transaction API sorts by descending date and unique transaction ID. Duplicate pages or the 50,000-row safety cap produce an explicit load error, not an apparently complete report.
2. **Canceled/converted original records:** Their rows remain in the historical register and exports with an explicit `État` column, but inactive monetary amounts are omitted from export grand totals, matching the active-only summary cards and canonical monthly backend report.
3. **Main dashboard:** Monthly transaction count, sales/purchase totals and the rolling 30-day trend now collect all pages of active transactions using the same pagination helper.
4. **Within one production lot:** Charges and egg sales without a building or cycle assignment remain in the `Tous les bâtiments` view but no longer appear in full for *every* individual building. Explicit delivery stock allocations identify the actual building even if the original deferred sale had a different building.
5. **Across overlapping production lots:** An unassigned charge or sale is assigned to a lot by date only if that day belongs to exactly one active lot. When several lots overlap, `Suivi global` excludes that unallocated amount from each lot and displays a short explanation; the canonical farm-wide financial report retains the amount. This avoids inventing an allocation percentage or tripling an expense.
6. **Ledger/history writers:** No changes to database schemas, stored amounts, payments, LC usages, inventory movements or the immutable correction journal. Existing APIs for receivables, payables, monthly reporting and cash ledgers already filter inactive transactions or use canonical ledger state.

## Read-only staging audit

Staging Supabase: `aqosvbpcxfpntcejebma`. No production or staging database mutation.

- 30 transactions: 17 active, 13 inactive.
- 0 active payments attached to inactive transactions.
- Active sales: 20,410.90 MAD; purchases: 8,750.00 MAD.
- 4 active sales without building/cycle assignment.
- 2 active common charges: 3,000 MAD on 9 October 2026 and 450 MAD on 11 October 2026.
- Each common charge fell on a day with **three concurrently active lots**; assigning it to every lot previously risked counting 3,450 MAD three times.

## Automated regression scope

- API transaction pagination order with identical dates.
- Client-side page traversal, filtering, duplicate-page and capacity guards.
- Transaction export state and active-only financial totals.
- `Suivi global` common charges/sales by individual building, source-based deferred stock allocations, and overlapping vs unique lot dates.
- Existing backend monthly, financial balance, PostgreSQL migration, LC and Phase 6E tests retained.
- The branch CI and preview deployment must pass before accepting implementation.

## Remaining Phase 7 acceptance

- Authenticated, live staging walkthrough after a canceled/converted transaction: transaction list, customer/supplier balance, monthly report, `Suivi global`, cash/bank register and downloaded Excel/PDF files must agree.
- Verify real historic deferred deliveries and egg stock for a sale whose originating date and delivery-source lot differ; the current presentation remains based on transaction date with source attribution by allocations.
- Review account-wide global charge/sale allocation only if the owner supplies a meaningful allocation rule. Do not distribute shared costs arbitrarily.
- No production promotion until Phase 8 release gates (security, backup/recovery, concurrency and full E2E) plus owner approval.

**Release decision:** Not a production go-ahead. No production deployment or Supabase data write is part of Phase 7 fixes.
