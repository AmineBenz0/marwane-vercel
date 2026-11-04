# Phase 6E-B — explicit sale / purchase conversion

**Status:** Initial implementation on staging. Not accepted or approved for production.

## Workflow

From transaction detail, Convertir en achat / Convertir en vente opens one form
for an opposite-side contact, compatible product, quantity and unit price.
The preview displays the new unpaid transaction, source stock reversal,
replacement stock effect and any existing cash/bank payments that will be voided.
Only a payment cancellation confirmation is requested when it is necessary;
no user-supplied motif, comment or optional notes are added.

Apply creates the opposite-side transaction with a new identity, retains and
deactivates the original, appends stock reversal on the original business date,
voids the original active payments in their ledger, and saves two immutable
correction events linking old and new IDs. The new transaction starts unpaid.
Neither existing cheques/LCs nor payments are silently transferred to it.

A frozen preview checks target version, payment/ledger state, contact/product and
the full stock dependency state. The operation UUID binds the request, user and
retry; reused IDs with changed payloads fail, while identical retries return
the already created replacement. Both detail pages link to the counterpart.
A converted source cannot be reactivated.

## Supported

- General-stock and service transactions, with reconciled original stock effects.
- Cash/bank payments of the ordinary cash/virement types, with explicit consent.
- Consistent dated stock balances after the source reversal and new effect.

## Deliberately excluded until dedicated dependencies are implemented

- Poultry egg-source and deferred-delivery transactions: lot, delivery evidence,
  FIFO allocation and reservations require a distinct conversion adapter.
- Cheques, letters of credit, refund or credit allocation history, unsupported
  legacy methods or inconsistent payment/stock links.
- Untraceable historical stock and any change leaving a negative stock balance.

## Remaining acceptance

Automated native PostgreSQL atomicity/concurrency, rollback, retry, cash/bank and
stock chronology checks, plus authenticated staging UI walkthrough.
Existing LC lifecycle integration and Alembic migration replay CI issues are
separate release blockers. No production promotion is authorized by this phase.
