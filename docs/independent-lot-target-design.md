# Independent building lots: target data model

**Phase:** 3 — agreed target model  
**Status:** Implements the user-approved ownership and lifecycle design  
**Scope:** Preserve current tables and historical cycle identifiers while removing shared-lot ownership.

## Entity roles

| Existing structure | Role in this release |
| --- | --- |
| `batiments` | Permanent building. A building can have successive lots. |
| `lots_production` | Authoritative independent lot metadata and lifecycle. One lot belongs to one building. |
| `cycles_production` | Operational cycle linking exactly one lot to exactly one building. Existing cycle IDs remain stable. |
| Production, transaction, charge, and related references | Continue to use existing `id_cycle` values. |

A parent lot will have exactly one cycle, and each cycle will have exactly one parent lot. A lot's initial flock equals its cycle's initial flock. A lot cannot be moved to another building after creation.

## Authoritative fields and synchronization

`lots_production` is authoritative for lot name, strain, arrival date, starting age, duration, planned end date, actual closing date, status, and notes. The lot's per-building initial flock is authoritative for flock size; on shared legacy parents, the cycle's building-specific flock is used when splitting the parent. The cycle columns remain compatibility snapshots for existing queries and API responses.

The database migration will:
- split any legacy parent shared across buildings into one parent row per child cycle;
- preserve each `id_cycle` and record the old-parent-to-new-lot mapping;
- set each independent lot flock equal to its building cycle flock;
- capture pre-migration parent and cycle snapshots in a restricted audit table;
- synchronize cycle snapshots from the authoritative lot fields;
- reject cycle snapshot updates that bypass the parent lot.

Application lot updates and closes change the parent and cycle in one transaction. The database trigger synchronizes the snapshots in that transaction. The cycle endpoint remains compatible but routes lifecycle edits through the parent.

## Database enforcement

- Make `cycles_production.id_lot` non-null.
- Add a unique index on `cycles_production.id_lot`, so one lot cannot have multiple cycles.
- Add deferred constraint triggers so a committed lot has exactly one cycle; this permits a parent and cycle to be inserted together in one transaction.
- Add a partial unique index on `cycles_production(id_batiment)` for statuses `actif` and `a_cloturer`. This enforces at most one active lot per building even when concurrent writers race.
- Keep the cycle's building foreign key and parent-lot foreign key. Prevent changing the cycle's parent or building after creation.
- Keep the old composite `(id_lot, id_batiment)` uniqueness rule only until the migration replaces it; it does not prevent multiple buildings sharing one parent.
- Do not infer data for parentless cycles, lots without cycles, or unknown flock sizes. The migration fails on orphaned parents/cycles and records field snapshots for every migrated pair.

PostgreSQL partial indexes index only rows matching their predicate, so the active-lot uniqueness rule can target active statuses without restricting completed history. See the [PostgreSQL partial-index documentation](https://www.postgresql.org/docs/current/indexes-partial.html).

## Application validation

- Validate exactly one building allocation and require its flock count to equal the lot's flock count.
- Lock the building row during lot creation and validate that no active cycle exists for that building.
- Keep the partial unique index as the final concurrency guard.
- Route cycle edits and closing through the parent lot. Reject a cycle with no parent instead of editing lifecycle snapshots independently.
- Close only the selected building lot. Keep same-day turnover, planned-end-date, explicit historical association, and report-scope behavior from the acceptance rules.

## Migration and release sequence

1. Apply `supabase_migrations/0006_independent_lots_per_building.sql` only after verifying the database target and taking a restorable backup. The same SQL is wrapped by `backend/alembic/versions/independent_lots_per_building.py` for environments managed through Alembic; use one migration runner per target and record its history.
2. Review `independent_lot_migration_map` and reconcile per-building lot counts and field snapshots. No production or staging database has been migrated by this change.
3. Deploy application code that creates and updates one lot/cycle pair per building. Keep all existing cycle IDs and foreign keys.
4. Compare per-building and per-cycle production, mortality, feed, transactions, charges, stock snapshots, and authoritative financial totals before and after.
5. Remove legacy multi-allocation UI and shared-lot compatibility only after all deployed application versions use the one-to-one relationship.

The audit's unlinked historical production and financial rows remain explicitly unassigned. They are not auto-attached by this model migration.
