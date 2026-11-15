# Release 4 — Phase 1 cancellation business contract

**Status:** Phase 1 specification and pure-function contract tests. No DB migration,
no finance mutation, no UI action, no live route. Staging/browser validation remains
deferred until final qualification. This contract is for the **production Release 3
automatic-allocation model**, not the divergent staging reservation model.

## 1. Terms and eligibility

- Original sale: an active customer egg sale with `est_promesse=true`,
  `allocation_automatique=true`, known building/product, agreed `quantite`,
  `montant_total` and versioned history. Reject unsupported purchases, inactive
  sales and missing stock origins at the Phase 4 authenticated API.
- Covered/delivered: `quantite_couverte` counts stock allocations; existing
  production automatic allocations are immediately delivered. Cancel only if all
  existing allocations are fulfilled (`quantite_completee == quantite_couverte`).
  Reserved but not delivered allocations require a separate adjustment workflow;
  never silently release them or pretend they are fulfilled.
- Already canceled: the cumulative `quantite_annulee`, not already delivered.
- Currently unfulfilled and unallocated:
  `pending = original_quantity - covered_quantity - previously_canceled`.
- A requested positive cancellation must be at most `pending`. Previously
  fulfilled eggs are immutable through this operation. A partially canceled sale
  can retain a positive pending quantity and be canceled further later.
- The client supplies an expected row version and expected pending quantity;
  both must match a locked current snapshot. The Phase 4 API must also require
  an idempotency operation ID; retries of the **same ID and same payload** must
  return the original result, but reuse with different payload must conflict.

## 2. Financial effect, using the original negotiated amount

**Policy default:** every canceled, undelivered egg removes its proportionate
original commercial charge, with no penalty. The original invoice/sale total and
historical payment rows remain intact. Any cancellation penalty requires a
separately authorized design outside this workflow.

If `Q` is original sale quantity, `M` is the persisted original total (MAD),
and `C` is cumulative canceled eggs, calculate:

```text
cumulative_avoir(C) = round_half_up_to_cent(M * C / Q)
avoir_for_this_operation = cumulative_avoir(C_after) - cumulative_avoir(C_before)
net_sale = M - cumulative_avoir(C_after)
net_paid = sum(effective signed payments, including actual refunds)
remaining_customer_balance = net_sale - net_paid
amount_due = max(remaining_customer_balance, 0)
customer_credit = max(-remaining_customer_balance, 0)
```

This uses the **persisted custom/discounted total**, never `Q × prix_unitaire`
when these differ. Cumulative rounding avoids a 0.01 MAD drift across split
cancellations, never credits more than the original total, and makes a full
cancellation exactly zero net value.

A credit note is a **commercial balance adjustment**, not an actual cash/bank
refund, not a payment row, and not yet a spendable `avance`. Do not auto-create
cash movements, convert the negative transaction balance into a second advance,
or let the same credit be consumed/refunded twice. Phase 5 must reconcile any
existing advances, offsets and signed refund payments before offering settlement.

## 3. Dated accounting and historical integrity

- The commercial adjustment has its own effective business date (not earlier
  than the original sale), creator, UTC creation timestamp, unique operation ID,
  original transaction ID and immutable signed money/quantity values.
- A sale from October adjusted in November retains its **October original sale**
  history. The commercial adjustment posts in November. A snapshot as of a
  date before the adjustment excludes the adjustment, even if the user looks at
  the sale today. The original sale must not be rewritten or deleted.
- Settlement dates follow existing finance semantics, including an effective
  cheque date after encashment and refund payments as negative net settlement.
- A reversal is a new dated, audited **linked compensating entry**, only when
  valid stock/customer-credit dependencies permit it; never edit/delete a
  posted adjustment. Restoring pending stock is not always possible after newer
  production, credit use or refunds.
- Net sale values and payment statuses must be derived consistently in Python,
  SQL collection queries, customer balances and exports (Phases 3, 5, 6).
  Existing sales without adjustments must be unchanged.

## 4. Accepted scenario matrix

All currency in MAD; baseline `Q=1000`, `M=1500.00`, `covered=600`, `cancel=400`.

| Case | Stock after | Avoir | Net sale | Net paid | Balance | Expected |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Unpaid | 600 delivered, 400 canceled | 600.00 | 900.00 | 0.00 | +900.00 | 900.00 due |
| Partially paid | same | 600.00 | 900.00 | 750.00 | +150.00 | 150.00 due |
| Fully paid | same | 600.00 | 900.00 | 1500.00 | -600.00 | 600.00 customer credit |
| Refunded 600 later | same | 600.00 | 900.00 | 900.00 | 0.00 | Credit settled; separate refund |
| Cancel first 100 | 600 delivered, 100 canceled, 300 pending | 150.00 | 1350.00 | 0.00 | +1350.00 | Additional 300 may later cancel |
| Cancel final 300 | 600 delivered, 400 canceled | +450.00 | 900.00 | 0.00 | +900.00 | Cumulative avoir 600.00 |
| Entirely undelivered | 0 delivered, 1000 canceled | 1500.00 | 0.00 | 1500.00 | -1500.00 | Original sale preserved |
| Custom negotiated total 1200 | 600 delivered, 400 canceled | 480.00 | 720.00 | 0.00 | +720.00 | Ignore displayed unit price |
| Three units totaling 0.05 | Cancel one at a time | +0.02, +0.01, +0.02 | 0.00 | 0.00 | 0.00 | No rounding remainder |
| Duplicate/reordered request | No second mutation | No second avoir | Unchanged | Unchanged | Unchanged | Replay same ID safely; stale/new ID rejected |
| Allocations not delivered | Unchanged | None | Unchanged | Unchanged | Unchanged | Reject until dedicated workflow |
| Adjustment next month | October original unchanged | November entry | As-of dated | As-of dated | As-of dated | Historical reports respect cutoff |

The pure quote and its tests cover the arithmetic, stale versions, pending
quantities and prohibited stock states. They **do not yet prove** database
idempotency, transaction locking, concurrency, immutable ledger permissions,
refund correctness, or as-of SQL reporting. Those are mandatory tests for
Phases 2–6 and cannot be marked green early.

## 5. Phase-by-phase implementation gates

1. **Phase 1 (this phase):** review the model's quantity/financial semantics,
   document this business contract and pass `backend/tests/test_release4_cancellation_contract.py`.
   The quote is read-only and not connected to any write API.
2. **Phase 2:** create an append-only ledger with SQL constraints/privileges,
   operation identity, immutable audit and migration/replay tests.
3. **Phase 3:** integrate dated commercial adjustments in Python/SQL financial
   projections and test agreement across collection filters and reports.
4. **Phase 4:** atomically commit quantity closure and matching ledger credit
   note under transaction/stock locks; test duplicate operations and rollbacks.
   Only then replace and re-enable the currently disabled endpoint.
5. **Phase 5:** integrate genuine client credit, refunds, advance offsets and
   cheque/LC settlement guardrails without double spending.
6. **Phases 6–8:** reconcile exports, client history, approachable UI,
   authenticated staging E2E and release checks.

**No new optional notes or reason fields**, no wholesale staging merge, no
Suivi global in Release 4.

## 6. Business assumption

The default is **no penalty for canceled, undelivered eggs**. If the client
explicitly charges a cancellation fee, pause the Phase 2 financial design and
get the fee rules approved first. Whether a commercial avoir also requires a
specific tax-compliant invoice/document form depends on the client's accounting
process and is not established by these technical tests.
