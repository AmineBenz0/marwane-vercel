# Independent building lots: target design and migration procedure

**Phase:** 3 — target-state design  
**Status:** Design proposal based on the agreed business rules and the 2026-10-20 baseline  
**Scope:** Database, API, daily attribution, UI, rollout, and reconciliation. No application or database changes are made by this document.

## Design objective

Represent each flock lifecycle as one lot owned by exactly one building. Different buildings can have active lots simultaneously. Existing production records, transactions, expenses, and other records keep their existing cycle IDs and foreign-key associations.

The existing parent-lot/repartitions structure models one shared arrival distributed across buildings. The audited tables show that production and financial records primarily attach to `id_cycle`, while the parent lot is the shared wrapper. The migration should remove the shared ownership behavior without rewriting cycle IDs.

## Recommended ownership model

Use the existing cycle row as the canonical lifecycle record for a building lot, because it already has the building ID, lifecycle dates, status, flock snapshot, and the foreign-key identity used by historical records. Keep the API/UI term “lot” for users.

- A lot/cycle has one required `id_batiment`.
- Each building may have multiple historical lot/cycles, but no overlapping lifecycle and at most one active lot.
- Keep existing `id_cycle` values unchanged.
- Retire the shared parent `lots_production` and its multi-building `repartitions` semantics after compatibility has been handled.
- If a lot resource/table remains necessary for API compatibility, it must map one-to-one to a cycle and one building. It must not be an independent source of lifecycle truth.
- Preserve old parent lot IDs in an explicit migration mapping/audit table or an equivalent durable trace field. Do not repurpose them as cycle IDs.

This avoids maintaining two editable copies of lot dates, flock size, strain, status, and notes. Before implementation, confirm every field in the deployed DDL and all runtime consumers; retain compatibility fields only where a demonstrated consumer requires them.

## Database constraints

Implement constraints only after production and staging DDL are compared and migration-history drift is understood.

1. Keep `cycles_production.id_batiment NOT NULL` and preserve its existing key.
2. Enforce one active cycle per building with a partial unique index on `id_batiment` for active status. Use the canonical status predicate after confirming all stored status values and casing.
3. Enforce non-overlapping date ranges per building using a database exclusion constraint where supported, or a transaction-safe locking/validation strategy. Treat intervals as inclusive at both endpoints only for the specific outgoing-close/successor-start turnover rule; for ordinary overlap, reject.
4. Permit the exact shared boundary where the outgoing cycle’s `date_fin_reelle` equals the successor’s `date_debut`.
5. Keep cycle IDs stable and retain all existing foreign keys from production, transactions, charges/expenses, and any other tables.
6. Add migration mapping/audit structures before removing or making nullable any parent foreign key. Remove `id_lot` only after all deployed application versions and data consumers no longer depend on it.
7. Validate positive initial flock, non-negative starting age, valid date bounds, and mortality not exceeding initial flock through application validation and database protections where practical.

Do not create a partial unique index on the old parent lot table as a substitute for per-building ownership; a shared parent still cannot express the desired rule cleanly.

## API and service behavior

- List lots by building and include history; farm-wide lists may aggregate for overview screens.
- Create one lot for one building with its own start date, initial flock, age, strain, duration, and notes.
- Close only the requested building lot. Reject closing before arrival or in the future.
- Do not auto-close at planned end date.
- Resolve an unassigned daily entry to the building’s valid cycle on its production date. On the turnover boundary, select the successor.
- Preserve explicit `id_cycle` on all existing records and on edits unless the user explicitly selects a valid historical lot through an authorized correction workflow.
- Reject entries after actual close date. Keep a previously saved cycle association even if a successor is later created.
- Keep lot-level performance and chart queries filtered by the selected cycle. Label farm-wide aggregates as aggregates.
- Make create/close operations transactional. Lock the building row or use an equivalent serialization strategy so concurrent requests cannot create two active cycles.

## Frontend behavior

- Put lot creation, current-lot status, closing, and history in the building context.
- Let Building A and Building B have active lots independently.
- Show a clear conflict when creating a second active lot for the same building.
- Show planned end date as informational; offer explicit close action.
- Keep historical lots selectable for their own reports. Do not show shared allocation controls.
- Ensure farm overview totals remain clearly farm-wide and do not leak into a selected-lot report.

## Metadata conflict policy

The staging audit found three parent/cycle differences in name and notes. Do not sync one side automatically. Before migration, export those pairs and obtain a source-of-truth decision. A one-lot-per-cycle target needs one final name and notes value per existing cycle. Record the chosen value and the discarded value in the migration workpaper; preserve a reversible snapshot.

The production shared lot has a parent flock total of 100 and child cycle values 99 and 1. Preserve each building’s child value as its initial flock; do not copy aggregate parent total to both lots.

## Data migration procedure

### Preflight

1. Verify the production Vercel connection maps to the production Supabase project; keep credentials out of logs and workpapers.
2. Export schema DDL, indexes, foreign keys, status values, sequences, row counts, and current migration ledgers independently for production and staging.
3. Re-run the baseline queries in a read-only transaction immediately before migration and save a protected, access-controlled workpaper containing record IDs and exact values.
4. Obtain owner disposition for every unlinked production/cycle/financial row and every parent/cycle metadata conflict. Do not infer historical attribution from date proximity alone.
5. Confirm the target has a restorable backup and rehearse on a recent staging clone.

### Transform

1. Create a durable old-parent-to-child-cycle mapping before changing the parent relation. Include old lot ID, preserved cycle ID, building ID, old parent fields, and chosen cycle fields.
2. For each shared parent, create the independent lot representation for each child building/cycle. Keep each `id_cycle` unchanged. For the production shared lot, the expected split is building 1 / cycle 1 / 99 birds and building 2 / cycle 2 / 1 bird.
3. Convert each already single-building lot to a one-to-one cycle/lot representation without changing cycle IDs or historical references.
4. Resolve name/notes only from the approved workpaper decision. Do not alter production, transaction, or expense associations as part of the structural migration.
5. Keep unassigned records unassigned unless the owner has approved a specific record-to-cycle mapping. Apply approved corrections as a separately logged operation.
6. Add and validate per-building active-lot and date-range constraints before enabling writes through the new application.
7. Retain old parent data/mapping through the rollback and verification window.

### Reconciliation and release

Compare before/after by preserved cycle ID and building:

- production row counts and eggs by type, with active/inactive status split;
- mortality and feed totals;
- transaction counts, quantities, and amounts;
- expense/charge counts and amounts, with cancellation status;
- date-scoped stock snapshot using the same date and endpoint semantics;
- authoritative farm stock and finance ledger totals;
- active lots per building and all historical start/end ranges;
- all foreign-key counts and unresolved/unlinked records.

Every unexpected delta blocks release until explained and approved. Keep the new application and schema rollout coordinated: do not allow an older version with a farm-wide active-lot restriction to serve writes after independent active lots exist. If expand/contract deployment is required, first deploy code that can read both shapes without enabling independent writes; then migrate; then enable new writes; remove legacy fields only in a later cleanup release.

## Required automated checks

- Two buildings can each hold an active lot.
- Same-building duplicate creation fails sequentially and under concurrent requests.
- Closing one building’s lot has no effect on another.
- Same-day turnover routes new unassigned daily entry to the successor.
- Existing explicit cycle IDs remain unchanged through migration and edits.
- Planned end date alone does not close a lot.
- Date and mortality validations hold at API and database boundaries.
- Lot reports isolate the selected cycle; farm aggregate reports sum lots without changing lot-level totals.
- Migration rehearsal proves idempotency, rollback, foreign-key integrity, and reconciliation.

## Open gates before executing a migration

- Production deployment-to-Supabase project mapping is not yet verified.
- Production has 58 unlinked daily production rows, including 52 active rows with unusually large totals, plus one unlinked active transaction and two unlinked charges.
- Staging has three unlinked production rows, six unlinked transactions, four unlinked charges, and three parent/cycle name-and-notes differences.
- Farm-wide cumulative stock and authoritative financial totals were not established in the first baseline.

These are data-owner decisions and evidence gaps, not values to repair silently. Implementation of read/write behavior and migration execution must be planned around those decisions.
