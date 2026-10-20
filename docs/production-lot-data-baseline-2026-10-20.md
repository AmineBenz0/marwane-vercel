# Production lots: code and data baseline

**Audit date:** 2026-10-20  
**Purpose:** Phase 2 baseline for the independent-building-lots change. This is a read-only audit snapshot. No production or staging rows were changed.

## Repository and release baseline

| Item | Exact baseline |
| --- | --- |
| Production deployment | Vercel READY production deployment `dpl_J8JaHEmHLTYC47MEjhkgDbcKCrFF`, created 2026-10-20 21:30 UTC |
| Production commit | `df986ab1f3e745284a7db675e79b65f5419391d0` on `main`, “Improve transaction required-field guidance” |
| Latest staging/preview deployment | Vercel READY preview for `codex/fix-vercel-qa`, created 2026-10-20 19:13 UTC |
| Staging commit | `732d592218f1f03e439b2d3c9c03453a89369a8c`, “Adapt product validation feedback to sale and purchase” |
| Lot-change branch | `codex/independent-building-lots`, created from production commit `df986ab1f3e745284a7db675e79b65f5419391d0` |
| Branch check | GitHub compare reports identical to production at creation (0 ahead, 0 behind) |
| Release divergence | Staging and production are divergent: staging has 56 commits ahead and 15 behind production from their merge base. It contains unrelated changes, including transaction/payment, vaccine, and charge work. Do not merge the staging branch wholesale. |
| Local workspace | Existing dirty worktree `codex/fix-vercel-qa` has unrelated edits and untracked files. It was not switched, reset, cleaned, or used as the clean implementation baseline. |

The production deployment's database URL was not decrypted or exposed. `comptabilite-db` is the production database candidate based on project identity and its data set; verify the deployed production connection maps to Supabase project `pudpijigevertmjmbtmc` before any production migration. Staging project `marwane-staging` is Supabase project `aqosvbpcxfpntcejebma`. This mapping is an explicit pre-migration check.

## Code and data reference inventory

The production commit already has a parent `lots_production` model and child `cycles_production` rows. The parent lot can represent an arrival shared by several buildings, and the cycle has nullable `id_lot` plus a unique parent/building pair. Migration `supabase_migrations/0005_shared_production_lots.sql` adds/backfills the shared-parent model. The current production router's lot creation checks for any non-finished lot globally, creates one parent with multiple `repartitions`, and closes the parent as a unit. The legacy cycle router adapts a one-building cycle into a parent lot. This is where the current “one active lot” scope conflicts with the requested per-building rule.

The latest staging preview has materially changed these same lot/cycle routes, utilities, tests, and frontend files. Its lot-management screen still treats the active lot as a single global selection and disables create when one exists, while presenting per-building allocations. This worktree also contains staging/current references in the following areas; review these together when implementing:

| Concern | Reference areas to inventory/review |
| --- | --- |
| `id_lot` parent/child relation | `backend/app/models/lot_production.py`, `backend/app/models/cycle_production.py`; lot and cycle schemas/routers; shared-lot migration; production-cycle helpers |
| `id_cycle` foreign keys and reads/writes | Production, transaction, and charge models/schemas/routers; daily production attribution and stock/performance queries; transaction/expense services; frontend production service and building/lot/cycle panels |
| Shared allocations | Lot schema `repartitions` validation; lot router create/update/close; `LotsManagementPage.jsx` / `LotPanel`; shared-lot migration and tests |
| “One active lot” checks | `lots_production.py` global non-finished-lot guard; staging `LotPanel` active-lot selection and create guard; cycle context/active-cycle helpers; tests for shared lots |
| Attribution/reporting | `backend/app/utils/production_cycles.py`, production daily/context/history/stock/performance endpoints, `frontend/src/services/productionService.js`, building production page and lot/cycle panels |

Exact release-baseline files inspected include `backend/app/routers/lots_production.py`, `cycles_production.py`, `productions.py`, models `lot_production.py` and `cycle_production.py`, lot schema, `production_cycles.py`, and migration `0005_shared_production_lots.sql`. The staging lot screen is a separate source revision; do not assume its UI behavior is present in production commit.

Production and staging migration histories differ. Production records `daily_vaccine_expenses_prod` and `caisse_cession_trace`; staging records `staging_app_database_roles`, `rotate_staging_app_role_credentials`, `allow_runtime_vaccine_tariff_updates`, and `caisse_cession_trace`, and also has an `alembic_version` entry `daily_vaccine_expenses`. Production has no `alembic_version` row. Treat this as schema/migration-history drift and inspect actual DDL before migration; a missing history row alone does not prove a table or column is absent.

## Production candidate data: `comptabilite-db`

Read-only counts: 3 buildings, 2 parent lots, 3 cycles, 1 active lot/cycle. No parentless cycles, lots without cycles, duplicate active cycles per building, overlapping periods, missing/nonpositive flock sizes, parent/cycle snapshot differences in the audited fields, or parent allocation total mismatches.

| Cycle | Building | State and period | Starting flock | Linked production baseline |
| --- | --- | --- | ---: | --- |
| 1 | 1 | Finished; shared lot | 99 | No linked production |
| 2 | 2 | Finished; shared lot | 1 | No linked production |
| 3 | 1 | Active from 2026-10-09 | 290 | 4 linked rows, all inactive; type totals: normal 1,000,000; double jaune 12,200; blanc 2,000; cassé 300 |

One finished shared lot contains cycles 1 and 2 for buildings 1 and 2. Parent initial flock is 100 and child allocations 99 + 1 = 100. This is the concrete shared-lot record that must be split into building-owned lots while preserving cycle IDs/references and documenting the source-parent mapping.

There are 58 production rows without a cycle association, all without a date-valid cycle candidate:
- Building 1: 3 inactive rows, 1,014 eggs, 10 mortality, 15,001.5 kg feed, dated 2026-09-13 through 2026-10-04.
- Building 3: 55 rows, 52 active; all rows total 1,515,423 eggs, 118 mortality, 210,000 kg feed; active rows total 1,414,223 eggs, 102 mortality, 195,000 kg feed, dated 2026-10-01 through 2026-10-14.

All 52 active production records (1,414,223 eggs, 102 mortality, 195,000 kg feed) are unlinked. The quantity scale compared with the known 290-bird flock is a high-priority anomaly to confirm with the owner. Do not infer their cycle or normalize counts during migration.

Financial references:
- 1 active transaction has no cycle: building 1, amount 100, quantity 100.
- 2 non-cancelled charges have no building or cycle, amount total 10,500.
- No building/cycle mismatch was found among rows that do carry a cycle association.

Stock snapshot semantics: the daily stock endpoint is date-scoped, cycle-aware, and based on active production/sales for that date. For 2026-10-20 it returns the active cycle on building 1 and zero daily production/eggs/linked sales. This is not a cumulative stock or farm-wide inventory balance.

## Staging data: `marwane-staging`

Read-only counts: 6 buildings, 3 parent lots, 3 cycles, 2 active lots/cycles. Each lot currently has one child cycle (buildings 7, 8, 9). No parentless cycles, parents without cycles, shared lots, duplicate active cycles per building, overlapping periods, missing/nonpositive flock sizes, or parent allocation total mismatches.

Each of the three parent/cycle pairs differs in `name` and `notes`; audited schedule, status, strain, age, and flock fields match. The Phase 3 model decision makes the parent lot authoritative for name and notes. The migration records both pre-migration snapshots in a restricted mapping table before synchronizing the cycle snapshots.

| Cycle | Building | State and period | Starting flock | Active linked production | Active mortality | Active feed | Linked transaction gross | Linked charges |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 4 | 7 | Active from 2026-07-14 | 3,200 | Normal 7,250; double jaune 24 | 2 | 1,062 kg | 1,500 | 0 |
| 5 | 8 | Active from 2026-08-31 | 2,500 | Normal 5,400; perdu 36 | 9 | 863 kg | 0 | 0 |
| 6 | 9 | Finished 2025-02-19 to 2026-07-08 | 1,800 | Normal 1,290 | 2 | 180 kg | 0 | 0 |

Three active daily-production rows are unlinked and outside all cycle date ranges: building 1 has 2 rows and 300 eggs; building 2 has 1 row and 0 eggs.

Financial references:
- 6 active transactions are unlinked and have no building: gross total 22,090; quantity 419.
- 4 charges are unlinked: 3,850 non-cancelled total. Two have no building (3,450); one each is on buildings 1 and 2 (200 each).
- No building/cycle mismatch was found among records that do have a cycle association.
- Linked sales gross across the audited cycles is 1,500; no charges are linked to cycles.

As on production, the daily stock endpoint for 2026-10-20 has active cycles 4 and 5 but no active production or linked sales on that date, so its daily snapshot is zero. This is not a cumulative cycle or financial balance.

## Reconciliation baseline and migration blockers

| Measure | Production candidate | Staging |
| --- | ---: | ---: |
| Buildings / lots / cycles | 3 / 2 / 3 | 6 / 3 / 3 |
| Shared parent lots | 1 | 0 |
| Parentless cycles | 0 | 0 |
| Unlinked production rows | 58 | 3 |
| Unlinked active transactions | 1 | 6 |
| Unlinked non-cancelled charges | 2; 10,500 | 4; 3,850 |
| Cycle-linked production / mortality / feed | Cycle 3 has 4 inactive rows; active linked totals are 0 | Per-cycle values in tables above |
| Daily stock input snapshot (2026-10-20) | 0 | 0 |

Before migration, resolve or formally disposition: production connection-to-project mapping; production's 58 unlinked production rows, especially 52 active rows and anomalous scale; 1 unlinked active production-candidate transaction; 2 unlinked charges; staging's 3 unlinked production rows, 6 transactions, and 4 charges; and the 3 staging parent/cycle name-and-notes mismatches. Their IDs and values should be exported to a protected migration workpaper before any data transformation. Keep explicit cycle associations unchanged. No unknown flock sizes, duplicate active cycles, date overlaps, or allocation arithmetic errors were found in these snapshots.

Capture these same per-cycle measures again immediately before and after migration: eggs by type (including active/inactive status), mortality, feed, associated sales/transaction amounts, associated expenses, and daily stock snapshot for the same date. Also record farm-wide stock and cash/bank/receivables/payables totals from their authoritative ledgers; this read-only pass did not establish a reliable cumulative per-cycle stock metric or enough ledger detail to state those totals. Compare normalized values by building and preserved cycle ID, investigate every delta, and retain the shared-parent-to-new-lots mapping.

## Query and safety notes

The database work consisted of `SELECT` queries against production and staging independently. No migration, update, delete, insert, or repair was performed. Values above are query results, not presumed business truth. This baseline is suitable for planning and reconciliation, but not for deciding the correct attribution of any unlinked record.
