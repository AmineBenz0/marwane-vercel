# Phase 6D — cheque and LC corrections

Status: deployed to staging; native PostgreSQL guards and the authenticated walkthrough passed. Ready for owner review; Phase 6D remains open pending acceptance.

## Implemented scope

- Shared payment correction editor supports cheque issue date, effective clearing date and lifecycle status. Amount, instrument identity and saved funding stay unchanged. Effective clearing changes replace or void cash/bank effects append-only and recalculate net settlement.
- A dedicated LC preview/apply command corrects amount, emission/availability dates, linked usage date, deposit account and compatible holder/transfer recipient. Current payment, transfer or bank deposit effects are reconciled and saved together. Incompatible holder changes require explicit usage cancellation first.
- LC usage cancellation retains the payment, transfer and movement history, restores the originating holder and releases the LC. Transfers are reversed and replaced, never rewritten. The former cancellation path finds deposits even after subsequent correction versions.
- Operation IDs, payload/actor binding, dependency fingerprints, ordered locks, frozen frontend retries and pre-commit result checks protect the new flows. LC history is visible on its detail page and linked payment changes appear in transaction correction history.
- Reconciled cleared cheques and LC payments can fund explicit refunds or credit allocations. Cheque capacity uses its clearing date in Python and SQL. Changing/canceling an instrument with active downstream settlement dependencies requires handling those records first.
- Generic LC financial edits redirect to preview/confirm; used LC history cannot be deleted. Cash/bank fractional precision and saved original payments are retained. Long bank notes are shortened to their column limit while the full correction reason remains in the immutable journal.

## Local verification

- Full backend run: 311 passed, 11 external PostgreSQL checks skipped. A subsequent 68-test focused run passed after the final long-reason, transfer-history and numeric-normalization follow-ups, including all 23 instrument tests. Counts overlap.
- Full frontend rerun: 289 passed across 59 files. The initial run found two pre-existing retained-credit assertions expecting wording replaced during Phase 6C; those assertions were aligned with the unchanged screen text. The 12 focused instrument/credit-form checks also passed.
- Frontend build passed; targeted ESLint reported zero errors and one existing dependency warning in LCFormPage.
- New coverage exercises clearing dates/statuses, supplier bank cheques, refund chronology/dependencies, LC payment/deposit/transfer correction and cancellation, stale previews, same-operation retries, rollback after an injected replacement failure and long reasons.

## Deployment and database verification

### Review follow-up — LC metadata and canceled-cheque notes

The two regressions found during owner review are corrected. Issuing bank, serial number and reference are editable through LC preview/confirm and retained in correction history. Optional issuer/serial values can be cleared; references remain required and unique. A deposited LC reference correction voids and replaces its linked bank movement with the same amount, date and account, so the balance remains unchanged. Issuer/serial corrections do not replace money movements and metadata-only changes remain allowed after a linked refund.

Notes-only cheque corrections are again allowed on canceled payments and inactive transactions. Financial date/status corrections remain blocked on those records, and tests verify that annotation does not restore the payment or change movements. These fixes reuse the applied schema and require no new migration.

The staging migration confirmation succeeded on retry. Migration `20261102125600_instrument_corrections` is applied to staging project `aqosvbpcxfpntcejebma`, and migration history confirms it. The authenticated staging walkthrough below subsequently passed.

The migration is prepared in `backend/migrations/instrument_corrections.sql`, with its Alembic wrapper and bootstrap copy. Its identical Supabase mirror is `supabase_migrations/20261102125600_instrument_corrections.sql`.

`backend/tests/phase6d_postgres_checks.sql` ran on staging after the migration; it rolls back its synthetic records and checks audited value authorization, clearing-date capacity, downstream cancellation guards and immutable transfer history. The script passed against staging and rolled back all synthetic records. The security advisor reports no new findings.

Staging alias serves READY deployment `dpl_82dQah8qcrBN2YZVHVg6CcuGQD4T`, source commit `66d578fdc414ed5462c4ee5ba1a55b2f33a4c759` (preview environment, cdg1). The alias was explicitly assigned and its resolved commit verified. Production was not changed.

## Authenticated staging walkthrough — 2 November 2026

- Cheque payment 54, 1.50 MAD on the marked test sale: pending → cleared on 2 November, clearing date corrected to 1 November, then rejected. Each preview agreed with the saved debt and active cash effect. SQL confirmed the old movement was retained canceled and only the corrected movement was active before rejection. The test payment was then canceled.
- LC `TEST-PH6D-0211` (id 5), payment 55: corrected from 1.50 to 1.60 MAD and usage date from 2 to 1 November. SQL confirmed both LC and payment amounts/dates changed together and payment revision advanced. Explicit cancellation removed the payment effect and made the LC available again.
- The same LC was deposited in reconciled test account 3. Its amount/date correction changed the active deposit from 1.60 MAD on 2 November to 1.70 MAD on 1 November, preserving the old movement. Cancellation returned the account to zero.
- Two tabs previewed competing LC operations. After the first canceled the deposit, the second save was rejected with “La lettre de crédit a changé. Actualisez son aperçu.” Confirmation was disabled and SQL found zero operations for its marked reason.
- Supplier transfer: original transfer to supplier 6 was corrected to supplier 5 and dated 1 November. The original remained canceled, a compensating transfer and replacement were retained, and the LC holder matched the replacement. Cancellation restored client 7 and voided its active transfer movement.
- Manual verification found and resolved three display issues: LC credit was presented as negative debt; payment/deposit usage was absent from the cession-only table; and the bank picker used nonexistent `nom_compte` instead of `nom_banque`. Follow-up frontend regressions (10 checks, then 7 label/detail checks, overlapping) passed, all 23 instrument backend tests passed again, build passed and targeted lint had zero errors. The final deployed commit contains these fixes.
- No console errors were captured on the primary walkthrough tab. Screenshots show [cheque rejection preview](qa/phase6d-cheque-preview.png), [stale LC preview](qa/phase6d-stale-preview.png) and [retained transfer history before cleanup](qa/phase6d-transfer-history.png).

## Cleanup and verification limits

Read-only SQL confirmed test payments 54 and 55 canceled; zero active test cash, deposit or transfer movements; account 3 at zero; sale 27 unchanged at 1.50 MAD and with no active payments. All financial and transfer history remains retained.

The synthetic LC cannot be deleted after acquiring history. Its original client was restored, notes explicitly identify it as archived test data, and its availability was set to **31 December 2099** through the correction UI. It remains an active-but-unavailable test record, contributing **zero to current balances**, rather than being falsely described as a canceled or deleted LC. No existing demo instruments or unreconciled bank balances were repaired.

Destination-bank changes and supplier-funded cheque reversal passed local integration checks; the recorded live walkthrough used the reconciled test bank account rather than moving a deposit between two accounts. Live PostgreSQL concurrency/load and recovery/rollback drills remain final-release gates.

Phase 6D remains open. Production release, live PostgreSQL concurrency/recovery checks and Phase 6E restoration/conversion remain separate gates.
