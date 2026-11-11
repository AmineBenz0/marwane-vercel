# Release 4 — Phase 5 credit/refund reconciliation

**Status:** code-only draft, staging and production intentionally unchanged.
This phase reconciles commercial credit notes with the existing payment,
advance, noncash credit-allocation and explicit-refund infrastructure.
The cancellation API remains gated OFF; there is no new UI or automatic
money movement.

## 1. Three distinct concepts (never merge these ledgers)

| Object | Origin | Changes amount owed? | Actual cash/bank movement? |
| --- | --- | --- | --- |
| Commercial **avoir** | Cancellation of undelivered eggs | **Yes**, reduces the original sale to net sale | **No** |
| Overpayment / customer credit | Effective signed settlements exceeding net sale | Represents a negative net customer balance | **No new movement** beyond existing payment |
| Separate **avance** | Explicit money paid in advance outside a transaction | Accounted at contact level | **Yes**, once, as advance |
| Actual **remboursement** | Explicit return of a verified overpayment | Reduces signed payments and the credit owed | **Yes**, exactly once |
| Existing noncash allocation | Paired `credit_transfere` and `credit_recu` transaction payments | Moves credit between two sales; conserves contact balance | **No** |

Never turn an avoir into an `Avance` row or a `Paiement` automatically.
The original sale total, previous receipts, bank/cash ledger and LC identities
remain intact after an avoir. Existing new-allocation UI/APIs remain
retired; Phase 5 only makes the supported legacy service safe where used.

## 2. Correct availability across accounting dates

For effective date D:

- `net_sale(D) = original_sale - sum(avoirs effective on/before D)`.
- `balance(D) = net_sale(D) - signed_effective_payments(D)`.
- Available *transaction credit* is nonnegative only if `balance(D) < 0`
  and remains nonnegative at **every later payment/credit date**, including
  the current state.
- Available *debt capacity* follows the inverse rule and cannot consume a
  future cancellation's already-corrected amount.
- The chronological projection considers both positive/negative payment
  events and positive commercial avoir events. A later avoir cannot finance
  an earlier refund or credit allocation.
- Refunds also require enough **settled monetary provenance** on that
  transaction: effective cash, bank transfer or encashed cheque receipts
  net of prior real refunds. Noncash LC holdings, compensation transfers
  and separate party advances are excluded from this monetary pool.
  Mixed payment methods can refund up to the lesser of the transaction's
  net credit and its settled monetary receipts, never the gross avoir alone.

This deliberately conservative monetary rule prevents creating cash from
an unmatched letter of credit or a synthetic credit allocation. Exceptional
LC/noncash cases require a separate finance reconciliation outside this
workflow; there is no automatic conversion to bank or cash.

## 3. Existing explicit refund service

The endpoint pair `/remboursements/preview` and `/remboursements/apply`
remains the only transaction-credit cash-return writer. The existing
`ENABLE_CREDIT_REFUND_WRITES` deployment gate continues to apply.

- Preview recalculates the corrected dated and monetary capacity, including
  payment/cheque status, and displays original sale, cumulative avoirs, net
  sale, amount available and credit remaining after the proposed return.
- Apply locks the parent sale, rechecks its fingerprint including posted
  avoir entries, validates the same capacity, then creates **one signed
  `Paiement(nature='remboursement')`** and its linked cash/bank movement.
- Same UUID/same body replay reads the original immutable operation;
  changed payload, stale preview or insufficient credit returns 409.
- A 600 MAD refund after a 600 MAD overpayment leaves the original
  1,500 MAD sale and 600 MAD avoir unchanged; effective payments fall
  from 1,500 to 900 MAD, giving 0 MAD customer balance.
- No new optional note/reason is added to the cancellation workflow.
  The existing refund command's reason remains mandatory as before.

## 4. Customer and advance summaries

`/credits/party` retains its original `balance`, `debt_total`,
`advances`, `allocations`, and `available` fields. `available`
continues to mean **unallocated cash advances only**, not an avoir.
New additive read-only fields distinguish:

- `avoirs_commerciaux`: each adjusted sale's original, adjustment,
  net and current overpayment figures;
- `montant_avoirs_commerciaux`: total commercial adjustments;
- `trop_percu_transactions`: still-unreturned surplus on transactions.

The gross avoir is not necessarily refundable cash. These fields must not
be summed indiscriminately with `balance` or `available`, as that
would count the same customer credit more than once.

## 5. Required acceptance evidence

- Test a 1,000-egg, 1,500 MAD fully paid deferred sale with 400
  undelivered eggs canceled: gross 1,500, avoir 600, net 900,
  effective payment 1,500, credit 600; **no automatic movement**.
- Explicitly refund 600 MAD: one outgoing cash/bank movement, credit
  becomes 0, original receipt unchanged, no new advance.
- Retry same refund UUID: no second payment/movement; different UUID
  after credit exhausted must fail.
- Partially allocate an existing historic source credit, then refund
  only the remaining balance; a second allocation/refund must fail.
- Separate advance remains an advance even when the sale has an avoir.
- Historical refund before an avoir's effective date must fail.
- Reject LC-only/compensation-only credit as cash-backed; accept
  mixed LC and real cash up to the monetary limit; unencashed
  cheques do not count until actual settlement.
- Stale dependency fingerprints reject changed payment or ledger
  snapshots; failure at database commit rolls everything back.
- Native PostgreSQL integration must verify actual migrated
  cancellation -> commercial ledger -> cash refund -> replay.
- Full backend, frontend, Release 1/3 and migration CI remains mandatory.

## 6. Remaining gates

Phase 6 integrates dated avoir entries into monthly and transaction
PDF/Excel reports; Phase 7 updates the French UI and returns a safe
cancel-remainder confirmation; Phase 8 tests an isolated staging
deployment, migration, authenticated permissions, real browser flows and
production release review.

**Never enable the cancellation flag or deploy Release 4 early.**
