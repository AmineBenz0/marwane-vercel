# Phase 6D — cheque and LC corrections

Status: implementation prepared for review; staging migration and acceptance pending.

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

## Deployment blocker and next checks

The staging Supabase migration confirmation expired twice. The migration was not applied; this was confirmed by reading migration history. No Phase 6D application deployment or manual staging acceptance is claimed.

The migration is prepared in `backend/migrations/instrument_corrections.sql`, with its Alembic wrapper and bootstrap copy. Once Supabase confirms application, record the generated migration version and add the matching Supabase SQL mirror.

Run `backend/tests/phase6d_postgres_checks.sql` on staging after the migration; it rolls back its synthetic records and checks audited value authorization, clearing-date capacity, downstream cancellation guards and immutable transfer history. This script has not yet run against staging.

Then deploy the reviewed source to staging and verify through the authenticated UI: cleared cheque date/status changes and restoration, cash/bank balances, LC payment correction, deposit date/account correction, transfer recipient/date replacement, usage cancellation, historical balances, correction history and cross-tab conflicts. Restore test effects and verify cleanup with read-only SQL.

Phase 6D remains open. Production release, live PostgreSQL concurrency/recovery checks and Phase 6E restoration/conversion remain separate gates.
