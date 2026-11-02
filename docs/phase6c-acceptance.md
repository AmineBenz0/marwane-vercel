# Phase 6C — advances and credit allocation

## Delivered scope

- Real client/supplier advances in cash or bank; explicit returns of unused advances.
- Same-contact, same-side surplus transfers and advance allocations, with no extra cash/bank movement.
- Whole-allocation cancellation, immutable financial values, retained history and safe retries.
- Owner preview/confirm forms on contact profiles and transaction details.
- Net contact balances, historical financial position, supplier monthly balances, ledger labels, exports and refresh events.

## Automated verification

- 158 distinct backend checks passed across credits, refunds, retained surplus, correction contract/history, contact balances, financial position and stock corrections. Two query-count assertions were updated for the additional grouped advance query and rerun successfully; the count stays constant as contact page size increases.
- 36 frontend checks passed across correction forms, profiles, transaction refresh, registers, cash display and balance presentation, including preview confirmation, frozen retries, stale conflicts and refresh without unmounting an open advance form.
- Frontend build passed; targeted lint has no errors (eight existing warnings in older components).
- Migration `20261102000432_party_advances_credit_allocation` applied to staging project `aqosvbpcxfpntcejebma`; backend SQL, Supabase mirror, bootstrap and Alembic wrapper are included.
- `backend/tests/phase6c_postgres_checks.sql` passed on staging and rolled back every synthetic record. It exercises cash advances, bank returns, journal completeness, paired-save completeness, immutable origins, financial immutability, no invented allocation money, linked withdrawal, return/refund bounds and whole-pair cancellation.
- SQL checks ran through the database administration connector. That connection cannot assume `app_runtime`; privilege inspection confirms insert/cancellation access and rejects financial-column updates. Authenticated staging writes and cancellations also passed in the walkthrough below.
- Security advisor introduces no new finding. Pre-existing findings concern independent-lot functions, extensions in public and internal tables.

## Deployment and owner walkthrough

Authenticated staging walkthrough passed on 2026-11-02, using the owner UI and read-only SQL verification.

- Client 7: a 0.50 MAD cash advance reduced net receivables from 206.50 to 206.00 MAD. Allocating 0.20 MAD to sale 27 left 0.30 MAD available and 1.30 MAD due on that sale; the contact net stayed 206.00 MAD. SQL confirmed exactly one cash entry for the advance and no cash/bank entry for its allocation.
- Canceling that allocation restored sale 27 to 1.50 MAD due. A 0.10 MAD cash return reduced available advance to 0.40 MAD and increased contact net to 206.10 MAD. Canceling the return and then the original advance restored the baseline.
- A 0.50 MAD client bank advance increased test account 3 from zero to 0.50 MAD. A full bank return brought it back to zero. A competing preview in a second tab was rejected with “Le montant dépasse l’avance encore disponible.” SQL confirmed zero records for the rejected request. Both successful bank records were subsequently canceled through the UI.
- Supplier 6: a 0.50 MAD cash advance correctly recorded SORTIE. Allocating 0.20 MAD to purchase 14 left 1,999.80 MAD due on that purchase and 0.30 MAD available; supplier net stayed 1,999.50 MAD. Allocation and advance cancellation restored the 2,000.00 MAD baseline.
- Surplus transfer: a temporary 1.50 MAD payment on sale 27, followed by a price correction to 1.00 MAD, produced 0.50 MAD credit. Applying 0.20 MAD to sale 23 reduced its balance from 10.00 to 9.80 MAD. SQL confirmed paired credit_recu/credit_transfere entries, no cash/bank movements for allocations, and the original 1.50 MAD payment unchanged.
- Canceling the transfer restored both sides. Sale 27 was restored to one egg at 1.50 MAD, and its temporary payment was canceled.
- Fresh automated rerun: 45 backend checks (credits, refunds, correction history) and 15 frontend checks (credit dialog, party panel, transaction refresh, supplier profile) passed. These overlap the earlier totals; they are not additional distinct test cases.
- No browser console errors were captured on the primary walkthrough tab.

Final read-only SQL cleanup check: five test advance/return records canceled; zero active test allocations, zero active test cash/bank movements; account 3 balance zero; sale 27 total 1.50 MAD with no active payments; sale 23's original 5.00 MAD payment retained. Canceled records remain in history.

Evidence: [supplier allocation](qa/phase6c-supplier-allocation.png), [transaction surplus transfer](qa/phase6c-credit-transfer.png).

Phase 6C's tested acceptance flows passed, with no blocker found. This walkthrough does not establish live concurrent database stress or recovery behavior; those remain final-release gates.

## Remaining scope

Full Phase 6 is open. Cheque/LC dependency adapters, restoration/conversion and their complete chain/concurrency walkthroughs remain separate increments. New advances use cash or bank transfer only. A transaction with an active cheque or LC is gated from credit allocation until the instrument adapter exists.
