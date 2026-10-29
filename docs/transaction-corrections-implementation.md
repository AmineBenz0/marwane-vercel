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

## Phase 1: correction-history foundation

Installed on staging on 29 October 2026. Deployed SQL is
`supabase_migrations/20261029111705_correction_history_foundation.sql`; Supabase
recorded the same migration name under version `20261029112941`. Its identical
backend SQL copy is bundled for Alembic. The Alembic revision merges the three
existing heads (`8e31a62c90bf`, `caisse_cession_trace`,
`daily_vaccine_expenses`). Do not replay old Alembic revisions against staging's
already SQL-migrated schema or stamp away the existing migration histories.

### Delivered behavior

- Current transactions and payments keep stable IDs and gain database-managed
  `row_version` values. Read responses expose this metadata for the future
  correction contract; existing save endpoints do not yet check expected versions.
- Existing records receive one baseline snapshot of their state at installation.
  Inserts and meaningful updates automatically capture immutable full snapshots,
  including writes from existing application screens. Timestamp-only writes do
  not advance revisions. No earlier history is invented.
- Operation records provide a UUID, request fingerprint, actor, reason and request/
  result payloads for a future atomic command. The UUID is unique. Retry result
  handling, expected-version conflicts and preview/apply endpoints belong to the
  next increment; this migration alone does not implement them.
- Shared validated correction envelopes require a reason and expected revision.
  Contract helpers lock/refresh the current row, reject stale revisions, compute
  exact-value request fingerprints and reject operation reuse by another actor or
  payload. These helpers leave transaction boundaries to the next orchestrator.
- Financial journal entries may link to an operation. The transaction-local
  operation setting only correlates audit records and checks the record actor;
  it never bypasses existing financial identity guards.
- New operation/revision history and legacy transaction audit reject update,
  delete and truncate. RLS is enabled, exposed roles lose history/allocation
  grants, and the runtime retains history reads and inserts, including its
  legacy audit sequence access.
- The legacy cash view now excludes canceled movements and LC cessions, matching
  the canonical active-cash calculation. Underlying ledger records are unchanged.
- Schema checks detect missing columns, disabled/missing foundation triggers,
  missing history RLS and unsafe runtime history table privileges.
- Bootstrap includes the identical foundation block and the previously missing
  cash-to-cession foreign-key column. This verifies foundation installation on an
  empty database; it does not certify the historical bootstrap as equivalent to
  every older Alembic/Supabase migration or its complete role provisioning.

### Verification and limits

- Backend regression, correction-contract and migration-copy tests: 28 passed. One native PostgreSQL
  fixture test is available through `POSTGRES_MIGRATION_TEST_URL` and was skipped
  locally because no disposable native server was configured.
- The committed SQL fixture/assertions ran against PGlite PostgreSQL 18.6: replay,
  baseline uniqueness, actual `SET ROLE app_runtime` writes, legacy audit inserts,
  operation correlation, actor mismatch, failed-write rollback, no-op suppression,
  immutable history, sequence grants, invalid snapshots and retained payment locks.
  The empty-database bootstrap also passed with its required extensions and roles.
- Actual staging PostgreSQL 17.11: migration applied; legacy transaction/payment
  writes, full snapshots, no-op behavior and payment financial locks passed inside
  an explicitly rolled-back transaction. Runtime grants, policies and enabled
  triggers were inspected. Management SQL still cannot switch to `app_runtime`;
  the actual-runtime path was exercised on the isolated PGlite fixture.
- All existing transaction/payment fields (excluding new revision metadata), cash
  and bank ledger records, and stored bank balances had identical before/after
  fingerprints. The aggregate baseline retains the earlier bank/source review
  cases; cash view parity is resolved. No new security advisor findings appeared.
- Concurrent expected-version rejection and full retry semantics remain gates for
  the next atomic command service. No paid financial fields are unlocked by this
  increment. The unresolved bank discrepancy and missing historical production
  origins remain outside automatic repair.

## Phase 2: shared preview/apply command — safe adapter slices

The first command path is implemented in `backend/app/services/correction_commands.py`
and exposed through authenticated `/corrections/preview` and `/corrections/apply`
routes. Supported corrections are transaction `date_echeance`, client-sale
`prix_unitaire`, and payment `notes`. For an effective cash-funded payment with
one active cash movement and no bank movement, it also accepts `date_paiement`
and `montant`; the old movement is voided and replaced in the same transaction.
Supplier purchase cost remains blocked because it changes stock valuation.
Bank-funded payments, cheques, letters of credit, inactive payments, and
inconsistent ledger links remain blocked. Transaction date, funding/account/LC
attribution, transaction identity, quantities, and stock origins remain out of
scope until their adapters are ready.

- Preview reads the current revision, returns before/after values and an impact
  summary, and writes no operation or ledger rows. Its dependency fingerprint is
  bound to the target ID, expected revision, normalized changes, parent transaction,
  sibling payments, and linked cash/bank movement snapshots. Apply requires the
  returned fingerprint and rechecks these dependencies under ordered row locks.
- Apply locks and refreshes the target, checks expected revision, rechecks for a
  concurrent operation replay after acquiring the lock, and writes one immutable
  operation record plus the target update in the same database transaction.
- The operation UUID is bound to the normalized request and authenticated actor.
  Same-request retries return the stored result; UUID reuse with a different actor
  or request is rejected. A write that changes nothing creates no operation.
- The transaction-local operation ID lets the foundation trigger attach the
  revision to the operation. The database payment guard permits date/amount
  changes only when an immutable operation matches actor, target, expected
  revision, requested values, and result snapshot. The flag alone cannot
  authorize an edit. Payment/ledger changes remain atomic.
- Tests cover preview without writes, a successful apply/replay, stale revisions,
  matching retry after a simulated lock wait, no-op suppression and rollback
  after a simulated commit failure. The local
  SQLite test uses a small test-only revision trigger; it does not prove native
  PostgreSQL concurrency or role behavior.

### Remaining Phase 2 gates

- Run the optional native PostgreSQL foundation fixture against an isolated
  PostgreSQL 17 database. The previous run was skipped because no disposable
  native server/runtime-role connection was configured; PGlite and owner-level
  staging SQL do not close that gate.
- Exercise duplicate operation UUIDs concurrently and two different operations
  against one target on PostgreSQL; verify one result replays and the stale edit
  conflicts without partial writes.
- Inject failures after each write stage on PostgreSQL and confirm operation,
  revision and entity state all roll back together.
- Add transaction date, bank, cheque/LC and stock adapters in their planned
  phases before accepting those fields through this API.
- Keep the known unreconciled bank account excluded from bank correction
  acceptance until evidence-based reconciliation or explicit exclusion.

This slice is backend infrastructure only. The existing transaction and payment
forms do not yet expose these corrections; that belongs to the owner UI phase.

### Audited cash payment correction increment

Migration `20261029162302_audited_payment_corrections.sql` was applied to
staging (Supabase version `20261029162757`) after the current identity trigger
and app-level flow were inspected.
The database test ran inside a rolled-back transaction against an existing
eligible payment: a matching operation changed date and amount, advanced its
revision, and linked the revision to that operation. Writes with no operation
ID, a stale expected revision, or a mismatched result value were rejected. The
test left no operation, payment, or history changes behind.

The app's authenticated correction service now restricts edits to cash paths it
can reconcile atomically. A purchase-price change stays unavailable pending the
stock-valuation adapter. Bank account balances remain excluded until the known
discrepancy is reconciled or explicitly excluded from acceptance.

## Manual Phase 1 acceptance follow-up

Browser verification on 29 October found the stable staging alias still serving
an older deployment. The alias was explicitly reassigned to the Phase 1 preview.
Future staging releases must verify the alias's resolved commit, not only the
new deployment's READY status.

The real application runtime successfully saved and restored a paid sale's due
date and payment notes. Both retained their full before/after snapshots and
advanced revisions. Cash/bank movement fingerprints stayed unchanged during
these metadata edits. The paid fields remained locked, and the unchanged
transaction form disabled save. A new synthetic purchase and payment each
received an insert revision. Payment cancellation retained its row, advanced its
revision, wrote its financial journal entry and removed its active cash effect.

The purchase edit -> cancellation walkthrough exposed a pre-existing stock
reversal defect: an inverse with no back-reference matched the partial unique
index for active source movements. A later inverse for that same source failed.
New inverses now receive the original movement reference at insertion and a
per-original idempotency key. Existing history and constraints are retained;
there is no schema migration or historical backfill. The fix supports earlier
one-way reversal records. Regression coverage includes repeated purchase edits
followed by cancellation with both modern and legacy reversal shapes. The
expanded backend suite passed 30 tests (one optional native fixture skipped);
staging PostgreSQL 17 accepted the corrected inverse shape under existing
constraints in a rolled-back test. The corrected build then passed the same cancellation through the browser,
reactivation with the canceled payment left canceled, and another cancellation.
The test purchase is inactive and its net cash and stock effects are zero.
Saving an unchanged payment note did not advance its revision.

Final checks retained every baseline revision, found no revision gaps and
confirmed latest meaningful snapshots match current rows. Native PostgreSQL
rejected history rewrite, audit deletion and revision truncation inside a
rolled-back check. Original cash rows, bank rows/balances and egg allocations
were unchanged; the cash screen, canonical calculation, view and snapshot agree.
The previously known bank discrepancy and legacy source cases remain for review;
no new aggregate reconciliation issue was found.

One existing multi-allocation deferred sale had its redundant single-production
and cycle pointers cleared by the existing global reservation reconciliation
when the test purchase was canceled. Its actual production allocations and
supplied quantities were unchanged, and the foundation captured that indirect
update. This is expected pointer normalization by `assign_pending_promises`,
not a historical allocation repair; retain it in the next dependency review.

Manual foundation acceptance is complete for the verified scenarios. Phase 2
still needs its own stale-preview, concurrent-apply, operation-retry and atomic
money/stock acceptance tests before editable financial fields are enabled.


## Phase 2 defect fixes — 29 October 2026

- The stored request and request hash use explicitly supplied fields only;
  omitted payment date/amount fields are absent, while explicit null remains
  available for nullable due dates and notes. Monetary request values use exact
  two-decimal serialization. Numeric equality drives no-op detection.
- Apply uses `CorrectionApplyCommand`, which requires the preview's dependency
  fingerprint. Parent, target, sibling payments and linked ledger records are
  refreshed and locked in the apply transaction before the fingerprint is
  checked. A changed dependency returns 409 without writing an operation.
- The actor and UTC modification timestamp are assigned explicitly and included
  in the immutable result. Before commit, the service refreshes the target and
  checks its full snapshot against that result. A mismatch rolls back all writes.
  Initial responses and retries return the same saved snapshot, even after later
  edits; no post-commit refresh can substitute a newer version.
- Cash financial edits require one active movement with matching amount,
  direction, exact accounting datetime, transaction link and origin fields,
  plus no active bank movement. Inconsistencies return 409 before mutation.
  Preview uses the recorded movement direction for its before value.
- The existing database guard is retained. Staging PostgreSQL accepted actual
  command payload shapes for amount-only and date-only edits in a rolled-back
  transaction, including expected revisions, actor, explicit timestamps and
  operation-linked history. Zero regression operation rows remained afterward.
- Backend suite: 83 passed, one optional native PostgreSQL fixture skipped.
  Added regressions cover single-field payloads, decimal no-ops, immutable retry
  metadata, inconsistent ledger links, changed dependencies and atomic rollback
  after ledger writes or an unexpected database-generated result.

The apply contract is stricter; no existing frontend calls these command routes.
At that checkpoint, native concurrent application/runtime-role tests and the
authenticated staging walkthrough were pending; see the follow-up below. Bank/cheque/LC, stock and owner UI
adapters retain their planned later-phase scope.

## Phase 2 locking follow-up — 29 October 2026

Single and batch payment creation, payment updates and payment cancellation now
lock and refresh their parent transaction before writing payment or ledger data.
Batches acquire parent locks in ID order. Transaction edits, cancellation and
reactivation acquire stock building/product locks before refreshing and locking
the transaction; cancellation then locks its payments in ID order. A changed
revision while acquiring stock locks returns a refresh conflict. Cached payment
and allocation collections are expired before domain checks. No migration is
required.

Focused regressions cover a cached active parent that became inactive, a cached
valid payment that was already canceled, and a cached empty payment collection
that must no longer permit financial edits. Existing cash, correction and stock
regressions are retained. SQLite tests verify refresh and mutation behavior, not
PostgreSQL lock scheduling.

Staging PostgreSQL runtime-role checks passed in rolled-back transactions:
date-only and amount-only guarded edits, linked revisions, rejected missing
operation tags, mismatched results/actors, immutable identities and revision
metadata, unique operation IDs, append-only permissions and injected rollback.
The temporary role-setting grant was rolled back; test operations/revisions were
absent afterward and the selected payment/cash movement retained their values.
The authenticated transaction screens were also checked. The correction API
still awaits the planned owner UI adapter.

For the expected 1–3 users, Phase 2 acceptance uses these focused checks and the
consistent writer locks. Simultaneous application-request races were not
reproduced with the available SQL executor; this remains an explicit test
limitation rather than a requirement for additional test infrastructure.

Final focused suite after the locking changes: 86 passed, one optional native
PostgreSQL migration fixture skipped. The runtime-role SQL checks above were
performed separately against staging.
