# Production lot business rules

**Status:** Agreed acceptance baseline for the independent-lot change  
**Scope:** Production lots, building cycles, daily production attribution, lot history, and lot-level reporting.

A lot represents one flock in one building. A building is permanent and may have successive lots.

| ID | Rule | Required behaviour |
| --- | --- | --- |
| BR-01 | Building lifetime | Ending a lot does not end, replace, or archive the building. |
| BR-02 | Lot ownership | Each lot belongs to exactly one building for its lifetime. A lot cannot be shared across buildings or moved after it has production history. |
| BR-03 | Concurrent lots | Lots in different buildings have independent lifecycles. Multiple buildings may each have an active lot at the same time. |
| BR-04 | One active lot per building | A building may have no more than one active lot at a time. Duplicate active lots in that building are rejected, including concurrent create attempts. |
| BR-05 | Independent attributes | Each lot owns its name, arrival date, starting age, strain, initial flock size, planned duration/end date, actual closing date, notes, and status. |
| BR-06 | Independent closing | Closing a lot changes only that lot. |
| BR-07 | Same-day turnover | A successor may start on the previous lot’s closing date. New, unassigned entries for that building and date resolve to the successor. Entries already saved with an explicit cycle association retain it. |
| BR-08 | Turnover scope | This release does not support separate daily entries for both flocks in one building on the turnover date. |
| BR-09 | Historical attribution | Existing production records keep their original cycle/lot association through migration and future edits. |
| BR-10 | Planned end date | Passing the planned end date does not close a lot. Closing is explicit. |
| BR-11 | Date validity | A lot cannot start in the future. Closing cannot precede arrival or be in the future. Daily entries resolve to a lot valid on their production date, subject to BR-07. |
| BR-12 | Flock accounting | Initial flock and mortality are tracked per building lot. Cumulative mortality cannot exceed that lot’s initial flock. |
| BR-13 | Report scope | Lot reports include only the selected lot. Farm totals may aggregate lots/buildings and are labelled as aggregate totals. |
| BR-14 | Lot history | Finished lots remain available for history and reporting. A finished lot cannot resume or accept new entries after closing. |

## Acceptance criteria

1. Two different buildings can each start a lot while the other lot remains active.
2. A second active lot in one building is rejected by application and database constraints, including under concurrency.
3. Each lot’s schedule, strain, starting age, flock size, status, and close date can change without affecting another building’s lot.
4. Closing a lot leaves other buildings’ lots and entry flows unchanged.
5. Same-day successor turnover is allowed; new unassigned entries resolve to the successor and previously linked entries retain their cycle.
6. A lot stays active after its planned end date until explicitly closed.
7. Mortality, remaining flock, weekly progression, and egg evolution are isolated to the correct building lot.
8. Farm totals aggregate across buildings without changing individual lot report scope.
9. Migration preserves historical associations and reconciled per-building totals.
10. Finished lots remain viewable and cannot accept new daily entries after closing.

## Migration guardrails

- Preserve existing cycle IDs and foreign-key references from production, transactions, expenses, and other dependent records.
- Split legacy shared lots into one parent lot per building cycle with an explicit mapping for traceability.
- Preserve per-building flock values and lifecycle fields. Do not infer missing values or silently redistribute totals.
- Reconcile production, mortality, stock, expenses, and relevant financial totals before and after migration.
- Document unexpected rows and discrepancies; do not auto-attach unassigned historical records.
- Do not deploy a legacy application that imposes one farm-wide active lot after independent active lots exist.
