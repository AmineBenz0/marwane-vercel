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
authenticated staging walkthrough were pending; see the follow-up below. At
that checkpoint bank routing, cheque/LC, stock and owner UI adapters remained
later-phase scope; the Phase 3 follow-up below records bank-routing work.

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

## Phase 3 implementation — cash, bank, dates and contacts

The shared correction command now supports:

- Payment amount/date updates when the existing cash or bank movement matches
  the payment; payment method and eligible cash/bank funding-account changes
  replace ledger effects atomically, update old/new account balances, and
  refresh cash snapshots. Involved accounts must reconcile with their active
  ledger movements. Account balances and selected contacts are part of the
  preview fingerprint and are locked in stable order during apply.
- Same-side client or supplier reassignment for compatible products. The
  transaction keeps its sale/purchase direction; LC-linked payment histories
  remain blocked pending the LC adapter.
- Transaction-date changes for service records without production or stock
  allocations. Active/pending payment chronology and due-date ordering are
  checked; canceled payments retain their historical dates without blocking.
  Stock-linked dates remain blocked for Phase 4.
- Cleared cheque ledger movements use the effective encashment date. Editing
  the date of an already encashed cheque remains blocked for the advanced
  cheque-correction flow. Reconciliation now checks payment movement dates,
  routes, and bank-account attribution.

The database payment guard now authorizes method/account/source edits only when
the immutable operation request, actor, target revision, and saved result agree.
The SQL-managed migration, backend migration copy, Alembic wrapper, and fresh
bootstrap are aligned. The preview/apply command is available at the backend
API; the owner-facing editing forms are still planned for Phase 5. Purchase
valuation, sale-to-purchase conversion, stock-linked transaction dates,
cheques and letters of credit remain intentionally gated.

### Phase 3 verification before rollout

- Focused regression suite: 91 passed, one optional native PostgreSQL migration
  fixture skipped. Python compile checks passed. The skip is intentional because
  that fixture needs a disposable PostgreSQL database; staging was not used for
  its destructive schema setup.
- Staging PostgreSQL 17.11 accepted the updated payment guard and a runtime-role
  method correction in a transaction that was rolled back. The payment returned
  to cash at revision 3, and the synthetic correction operation was absent after
  rollback. This validates the guard contract, not the full authenticated API
  request path.
- Staging schema inspection confirmed the account table uses `solde_actuel`.
  The migration only replaces the existing payment identity guard; it does not
  edit business records or widen access grants.
- Owner-facing correction forms and end-to-end browser saves are not part of this
  phase. They remain a Phase 5 acceptance item.

### Phase 3 review fixes

- Editing a cleared cheque's notes, including resending its cleared status,
  preserves the stored settlement date and existing active ledger entry. The
  default business date is assigned only on the first encashment transition.
- Correction operations retain `submitted_changes` and authorize all normalized
  writes in `changes`, including an implicitly cleared bank account. Retry
  hashes still use the original command. Client bank-to-cash and supplier
  bank-to-caisse changes preserve balances, movements and replay results.
- Service transaction dates are checked against the requested final due date,
  including an explicitly cleared due date. Invalid final date pairs remain
  rejected. An explicitly null payment method returns HTTP 422 at both routes.
- Focused suite: 97 passed, one optional disposable-PostgreSQL fixture skipped.
  Staging's actual PostgreSQL payment guard accepted the normalized bank-to-cash
  authorization and captured its linked revision under the runtime role. This
  check ran in a rolled-back transaction; no test payment or operation remained.

## Phase 4 implementation — stock correction adapters

Phase 3 was closed by the owner. The shared command now accepts transaction
quantity/product/source/building/date corrections and explicit egg allocations.
Financial payments keep their IDs and amounts when a sale or purchase changes.

- General inventory is validated as a complete dated final state. Corrections
  append an inverse at the original business date and a replacement at the new
  date. A valid reduction of an already consumed purchase succeeds without the
  transient-negative-stock failure of full reversal helpers. Negative historical
  balances are rejected. Current receipt costs are recalculated; recorded
  transformation cost snapshots are retained and listed in the preview.
- Egg plans retain delivered quantities and closed remainders. Undelivered
  reservations can shrink; released stock goes to pending orders in their
  original creation order. Explicit origin plans must respect category,
  building, production date, lot and other customers' reservations. Ordinary
  sales require complete coverage. Unlinked historical sales require explicit
  origins; missing general-stock provenance requires reconciliation.
- Preview is read-only. Stock rows, production, allocations, lots, products,
  affected transactions and delivery audit state enter the dependency hash.
  Apply locks buildings, products and transactions in stable order before
  revalidation. Manual adjustment/reversal writers use the product locks too.
- `stock_revision` makes allocation-only changes advance the parent revision;
  affected orders receive linked revision and allocation audit records. The
  operation stores before/after stock plans. SQL migration, Alembic wrapper,
  model and fresh bootstrap include the additive marker.
- Staging migration `20261029220023_stock_correction_revisions` was applied.
  The runtime role passed revision/history and dated stock replacement checks
  inside a rolled-back transaction. The broader suite passed 211 tests, with
  one optional disposable PostgreSQL fixture skipped before deployment.

This is the backend adapter release for review, not Phase 4 closure or the owner
UI release. Delivered-stock reductions, explicit physical returns, changes to
recorded delivery dates, direct edits of used production rows and historical
transformation revaluation remain protected. Owner forms are Phase 5; advanced
resolution flows and indirect-view acceptance remain in their planned phases.

### Phase 4 review fixes

- Explicit egg origin lists remain exact, while their unallocated remainder
  reserves available eggs at the order's original creation priority. Only the
  excess can be allocated to newer orders; delivered quantities stay intact.
- A shared eligibility check validates building, category, production date and
  lot schedule for selected origins, including automatic allocations for related
  orders and virtual reservations for the explicit target's pending quantity.
- Planned general-stock costs are rounded to four decimals with PostgreSQL's
  numeric tie behavior before preview, history storage and movement creation.
  Apply rereads persisted movements, reversals, affected product balances and
  egg allocations after flush. A mismatch rolls back the entire correction.
- Added 21 regression cases covering priority, related-order lot validation,
  recurring/tie costs, retry history and database-trigger mismatch rollback.
  Focused correction suites: 75 passed. Full available backend suite: 233 passed,
  11 skipped; these skips require external database fixtures. A read-only staging
  query confirmed `numeric(15,4)` cost rounding. No schema changes are required.

### Final-state explicit allocation validation

The explicit source guard now validates the proposed allocation against the
corrected creation-order queue. It keeps saved allocations fixed, preserves
the target's retained sources, releases replaced sources and reserves stock
for earlier pending orders before checking the target's additional sources.
Younger virtual reservations are recalculated from the corrected quantity.
Both priority validation and automatic planning use the same FIFO source
reservation helper and eligibility checks; preview remains read-only.

Five regression cases cover automatic/explicit parity with and without excess
stock, saved allocations on another order, earlier pending priority and a source
swap that releases stock to another order. Preview, saved outcomes and retries
agree. Focused correction suites passed 80 tests; the full available backend
suite passed 238 tests, with 11 external PostgreSQL fixture tests skipped.
No schema migration is needed.

## Phase 4 closed — 31 October 2026

The owner approved closure after review of staging `9418925`. The final review
passed 80 focused correction tests and 36 additional allocation scenarios. The
stock adapters preserve delivered/closed quantities, creation-order priority,
recorded cost snapshots, dated stock conservation and atomic retry behavior.
PostgreSQL concurrency, full owner walkthroughs and release recovery remain
Phase 8 acceptance gates; this closure does not authorize production release.

## Phase 5 implementation — owner editing workflow

- All transaction edit entry points now use the same correction editor, including
  unpaid records. Supported dates, quantity, price, compatible contact/product,
  building and explicit egg sources use preview followed by one atomic apply.
  Transaction edits no longer create or update payments in a second request.
- Ordinary payment corrections support amount/date/method and explicit cash/bank
  funding/account choices. Saved supplier funding is preserved independently of
  payment method, including legacy bank-funded transfers. Cheques and credit
  letters retain note editing; their financial adapters remain Phase 6 work.
- A shared confirmation shows changed values, the authoritative debt/credit,
  stock allocations and other affected orders, plus cash/bank consequences. The
  server calculates the preview balance from current effective payments.
- Drafts retain their opening revision during background refreshes. Stale data
  requires a new preview; ambiguous apply failures retry the same operation UUID
  and fingerprint. Saving cannot silently repeat a committed financial effect.
- Authenticated, paginated `/corrections/history` groups transaction/payment and
  related-stock revisions. History shows actor, timestamp, before/after values
  and allocations, including readable inactive-contact/source labels. Reusing
  previous values opens a newly validated correction; unknown historical stock
  origins are not invented or restored by clearing a production pointer.
- Transaction list/detail/payment views refresh after corrections and across
  tabs. Wider report/export/alert refresh and advanced settlements remain in
  their planned later phases. Existing navigation, styling and creation flows
  are retained. This release adds no schema migration or privilege grants.

Phase 5 remains open for review and owner acceptance. Automated checks and
staging deployment are recorded in the delivery report; manual staging
walkthroughs must be reported separately from unit/integration checks.
