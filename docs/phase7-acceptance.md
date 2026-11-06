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


## Follow-up verification — 6 November 2026

**Staging-only, read-only live data checks:** Supabase `aqosvbpcxfpntcejebma`. No user credentials were retrieved, no staging data was mutated, and no production changes were made.

### October financial benchmarks

Independent SQL against active transactions and charges gives:

| October 2026 | Staging figure |
| --- | ---: |
| Active sales | 18,070.90 MAD |
| Active purchases | 8,750.00 MAD |
| Active charges | 3,850.00 MAD |
| Active transactions | 16 |
| Inactive transactions retained | 12 |

These must agree with `GET /reports/monthly?month=2026-10`, the client/supplier register, and Excel/PDF exports. A live authenticated comparison is still pending; the calculations above are independent SQL reference values, not claimed screenshots or downloaded artifacts.

### Deferred sales and production-source integrity

Read-only PostgreSQL checks returned:

- 19 active production source rows; 15,425 recorded eggs across the available categories.
- 1,450 eggs in allocations to active sales, of which 1,449 are marked completed, with **zero** production sources reserved beyond their recorded quantity and **zero** completed quantities above active allocations.
- 69 eggs in historic allocations to inactive/canceled sales. These must remain auditable but must not be counted as currently reserved stock.
- Deferred sales #15 and #22 account for 9 and 50 eggs respectively sourced from production dated later than the original invoice date. No live cross-building or explicitly cross-cycle deferred allocation was present in this data sample.
- One ordinary (non-deferred) sale has an allocation of one egg with `quantite_livree=0`. This field is not meaningful for an ordinary sale. `Suivi global` previously omitted it; the code now uses `allocation.quantite` for ordinary sales and `quantite_livree` only for deferred completions.
- Regression tests cover ordinary allocations with zero deferred-completion markers, partially reserved deferred sales, and cross-lot source attribution in a synthetic scenario. A real cross-lot case cannot be claimed tested on staging because none was found there.

**Accounting date distinction:** The canonical monthly report recognizes the full invoice in the original transaction month, while per-lot `Suivi global` uses completed/allocated production quantities to attribute egg volume and a proportional value to the source lot. Those are different measures and should not be compared as if both were whole-farm invoiced revenue. Do not silently change the delivery accounting date based solely on a source's production date; that requires an explicit business rule.

### Read-only live staging security inventory

- Every public table has RLS enabled.
- Zero direct `PUBLIC`/`anon` or `authenticated` table grants; zero runtime `DELETE` or `TRUNCATE` privileges on accounting/stock journals.
- Zero non-invoker public views; zero public `SECURITY DEFINER` functions.
- `app_runtime` and `app_migrator` are not superusers and cannot bypass RLS.
- Supabase security advisors still report: two deliberately policyless internal tables (`alembic_version`, `independent_lot_migration_map`) with RLS enabled (deny-by-default); three functions with role-mutable `search_path`; two extensions (`pg_trgm`, `unaccent`) in the public schema. These advisory-level schema-hardening topics are not silently patched during a Phase 7 reporting audit.

Advisory guidance:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

### Automated coverage added

- The full unit/CI gate runs the new ordinary-egg allocation and deferred-source regression tests.
- A native PostgreSQL conversion test now asserts that the historical original remains available, the replacement is active, and the monthly report, payables, receivables, and cash totals reconcile after sale-to-purchase conversion.
- `frontend/tests-e2e/phase7-read-only.spec.ts` provides an authenticated **read-only** acceptance: fetch and reconcile active transaction totals, verify all transaction IDs and canceled-state labels in the downloaded Excel file, verify the financial grand total, check the monthly report's Excel values and current cash/receivable/payable balances, and verify valid PDF downloads. The regular frontend CI validates Playwright test discovery without credentials.
- **Execution limitation:** the repository's authenticated E2E workflow is gated by `RUN_E2E=true` and `E2E_BASE_URL`, `E2E_EMAIL`, `E2E_PASSWORD` secrets. Its workflow remains skipped unless those are configured. The available connected browser was not logged in to the staging app and cannot perform an authenticated walkthrough in Chat mode. An E2E specification and API-only checks do not substitute for a real signed-in Excel/PDF download test.
- The database-security workflow is likewise workflow-dispatch gated; the live security results above come from direct read-only Supabase queries and advisors, not the skipped GitHub job.

### Release decision

**Staging reporting implementation: ready for code-level acceptance once final CI passes. Phase 7 full authenticated acceptance: open. Production promotion: not authorized.** Remaining actionable gate: run the new authenticated read-only E2E against staging or complete its equivalent owner walkthrough, then sign off downloaded files and historical cross-lot presentation. Broader concurrency/recovery/schema-hardening is retained for Phase 8.


## Final deterministic browser export acceptance — 6 November 2026, 10:40 UTC

CI run: https://github.com/AmineBenz0/marwane-vercel/actions/runs/42203626680

- Full backend: **731 passed**, 33 skipped, 83.20% service coverage, Python dependencies show no known vulnerabilities.
- Frontend: **337 unit tests passed**; successful build and high-severity npm audit gate (five moderate advisories remain).
- Browser: **18 passed**, including two new tests (`frontend/tests-ui/phase7-exports.spec.ts`) that download and inspect the actual XLSX content and PDF file signatures. Transaction export: all three synthetic transactions are present, the canceled transaction is labeled `Annulée`, and the grand total counts only the 125.50 MAD in active transactions rather than all 325.50 MAD. Monthly report export: 100.00 MAD in sales, 25.50 MAD in purchases, 35.00 MAD in charges, and dated current balances match the rendered contract.
- Database migration/integrity and secret-scanning jobs passed; the staging preview corresponding to the code commit is READY.
- These are **deterministic mocks**, not live staging credentials or business data. They prove the browser-based export pipeline and its calculation contract, but not equivalence between actual staging API responses and downloaded reports.

**Acceptance boundary:** Phase 7 implementation, historical-stock reconciliation, real SQL benchmarks, and deterministic UI/Excel/PDF regression checks are complete and green. **Live authenticated cross-system report/download acceptance remains open** because the available browser connection is not signed into staging and GitHub's `e2e` job is still skipped pending test credentials/flag. Do not label these live E2E tests as passed.

**Phase 8 handoff:** Database security advisors (search paths, public extensions, deliberately policyless internal tables), conditional CI jobs, rollback/concurrency/backup checks, and moderate npm advisories remain separately tracked. No production promotion has been authorized.
