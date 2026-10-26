# Deferred delivery production release

## Required elements

| Element | Included behavior |
| --- | --- |
| Database | Allocation history table, transaction allocation/deferred flags, expected delivery date; foreign keys, positive quantities, unique source pairs, indexes, RLS and backend-role grants. |
| Existing sales | Flags default false; existing direct production links copied into allocation history; no invented origins for legacy unlinked sales. |
| Sale creation/edit | Egg cards and summary; cumulative dated stock; explicit shortage acceptance and expected date; quantity/price preserved; draft acceptance resets when stock covers quantity or source changes. Existing saved deferred metadata retained. |
| Reservation engine | Building/product locks, oldest-command priority, dated stock FIFO, building/type/calibre matching, partial allocation, no duplicate sale or payment. |
| Production | New production automatically reserves eligible stock; allocated stock cannot be removed, recategorized or resold; actual allocation notice links to the affected sales. |
| Follow-up | Home pending-sales card, deferred register filters, client follow-up, dated allocation history, fully reserved status. |
| Reports | Separate available/reserved stock, current balances and historical activity, cancellation-aware totals, monthly report and exports. |
| Configuration | Existing production runtime/database/auth configuration; no new secrets, packages, scheduled jobs or external services. Allocation runs inside production/transaction writes. |
| Deployment | Apply reviewed additive SQL, verify schema and runtime permissions, merge this scoped branch into main, wait for production READY, verify production routes and health. |

## Release boundaries

Source: staging at 14a8706168b36cbbe2b96c15b0bff86ccaa87d19.
Base: production/main at f59d5f3a219895e474a7a0e2e37c0ebcb2f325a5.
Suivi global, its navigation/demo/export files, and unrelated dependency updates are excluded. Existing production integrity/audit/index migrations and checks are preserved.

Apply `backend/scripts/sql/release_deferred_delivery.sql` as one production Supabase migration. It represents the two included Alembic revisions; do not stamp unrelated Alembic history or rerun all historical migrations on the existing database.

## Operational meaning

One sale remains one transaction through later reservations. The expected date is informational; FIFO uses command creation order. Reservation completion does not confirm physical handover. Payments remain independent of stock allocation. No staging clients, sales, production or payments are copied to production.

## Recovery

If application rollout fails, restore the previous main production deployment. Keep the additive schema and allocation records; do not drop stock history or reverse financial records. Old code cannot safely operate newly created deferred orders, so prefer a forward fix after deferred orders have been entered.
