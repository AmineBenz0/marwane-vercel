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
- SQL checks ran through the database administration connector. That connection cannot assume `app_runtime`; privilege inspection confirms insert/cancellation access and rejects financial-column updates. Actual application-role behavior must also pass the authenticated staging walkthrough.
- Security advisor introduces no new finding. Pre-existing findings concern independent-lot functions, extensions in public and internal tables.

## Deployment and owner walkthrough

Pending the staging deployment and authenticated walkthrough. The connected local browser timed out during preparation; no manual acceptance is claimed yet.

## Remaining scope

Full Phase 6 is open. Cheque/LC dependency adapters, restoration/conversion and their complete chain/concurrency walkthroughs remain separate increments. New advances use cash or bank transfer only. A transaction with an active cheque or LC is gated from credit allocation until the instrument adapter exists.
