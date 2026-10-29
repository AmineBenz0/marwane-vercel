# Owner correction rollout — implementation tracker

## Phase 0: baseline and operating policy

The first live staging baseline was inspected on 29 October 2026 against commit
`ecd754871ff59a8beb29a6065fe0d4b64827b0ef`. All inspection queries ran inside
explicit read-only transactions. No financial records, stock origins, or schema
objects were repaired as part of this phase. Private amounts and source-record
identifiers belong in the owner's private baseline report, not this repository.

Staging uses both an Alembic version marker and subsequently recorded Supabase
migrations. The marker alone is not a schema-completeness indicator. Payment
identity protections, append-only financial correction triggers, transaction
audit, stock source uniqueness, and LC usage constraints are installed.

Aggregate checks found no payment-effect duplication, active payment amount or
direction disagreement, invalid active payment/due dates, negative general
inventory, invalid allocation bounds, production overallocation, active LC
payment reuse, or active charge/movement mismatch. This is a bounded aggregate
baseline, not proof that all historical business data is correct.

### Findings and handling

| Finding | Handling before affected corrections are enabled |
| --- | --- |
| Cash view includes LC-cession transfer rows | Align the legacy view with the canonical cash predicate; retain the underlying rows and test view/API parity. |
| Stored bank balance differs from active ledger sum | Preserve both values for review. Do not fabricate an opening balance or overwrite the stored balance without evidence. Exclude the affected account from the initial correction acceptance set until reconciled. |
| Older ordinary sales have no production origin | Preserve their compatibility behavior; source/quantity corrections require an explicitly supplied valid allocation plan. Do not infer historical origins. |
| Runtime role can update/delete transaction audit rows | Harden legacy history privileges in the foundation migration and test all audit writers. |
| Allocation table has unnecessary anon/authenticated grants | RLS currently prevents anonymous row visibility; remove unnecessary grants in the foundation migration while preserving runtime allocation operations. |
| Existing lot migration review items | Carry forward separately; do not invent a lot mapping as part of financial correction work. |
| Runtime role switching unavailable through management SQL | Catalog grants/policies were inspected; actual runtime-role connection and trigger-write testing remain a foundation integration gate. |

### Accepted implementation defaults

- Correct current transaction/payment records under stable IDs, with immutable
  before/after revisions and grouped operation history.
- Restate corrected business periods; retain the actual correction timestamp.
- Keep creation-order reservation priority and completed delivery evidence.
- Preserve recorded supplier funding unless the owner explicitly changes it.
- Keep surplus visible; recording a refund, return, or advance is an explicit
  business operation and must not be inferred from a typo correction.
- Preserve recorded transformation cost snapshots; historical revaluation is an
  explicit future operation.
- Save related changes once, atomically, with expected revisions and separate
  correction idempotency. No-op saves create no ledger effects.
- Enable each editable field only after its complete dependency adapter is ready.

## Repeating the aggregate check

From `backend`, with the intended staging runtime connection configured:

```sh
PYTHONPATH=. python scripts/check_correction_baseline.py \
  --expected-project-ref '<staging-project-ref>' \
  --output /tmp/correction-baseline-private.json
```

The script checks the destination, establishes and confirms a read-only
transaction, sets a bounded query timeout, and rolls back even on failure.
Exit codes: 0 = the listed aggregate checks passed; 2 = review required;
1 = configuration/query failure. Passing this script does not replace catalog,
role, concurrency, migration, production-source, or owner acceptance checks.
Generated reports contain private aggregates and must never be committed.

## Next implementation increment: correction foundation

1. Capture actual trigger, constraint, grant and migration definitions as the
   migration precondition. Retain both schema histories.
2. Add operation/revision records and optimistic revision metadata without
   unlocking paid transaction/payment edits yet.
3. Retain cash/bank movement identity and append-only history protections.
   Implement an audited, revision-checked payment correction contract.
4. Include narrow legacy cash-view and audit/grant hardening in reviewed SQL.
   Keep unresolved bank/source records out of automatic repair/backfill.
5. Deliver replay-safe deployed-path SQL, Alembic equivalent and bootstrap
   coverage; verify on disposable PostgreSQL with the actual runtime privileges.
6. Apply the tested additive foundation to staging and rerun the baseline before
   wiring preview/apply endpoints or enabling correction fields in the UI.

The broad correction release remains gated on resolving or explicitly excluding
the affected legacy cases. An additive history foundation can be developed while
those records are reviewed.
