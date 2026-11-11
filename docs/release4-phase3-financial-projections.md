# Release 4 — Phase 3 financial projection acceptance

**Scope:** financial reads and dated balances over the append-only Phase 2
commercial ledger. This is a draft Release 4 change, not a production release.
Cancellation remains disabled; no database migration is applied remotely here.

## Canonical rules

An original sale is never rewritten by a credit note (`avoir`):

```text
montant_total = original persisted negotiated sale total
montant_avoir = sum(posted commercial adjustments for this sale)
montant_net = montant_total - montant_avoir
montant_paye = sum(effective signed settlement amounts, including actual refunds)
montant_restant = montant_net - montant_paye

if montant_restant < 0, there is a credit owed to the customer;
it is NOT automatically a cash refund or reusable party advance.
```

Payments, including cheque settlement rules and signed refunds, retain their
existing canonical effectiveness rules. Rejected or uncleared payments do not
increase `montant_paye`. Existing transactions without commercial credit
notes yield `montant_avoir=0`, so their balances are unchanged.

### Historical as-of rules

For cutoff `D`, include an avoir only when `date_effet <= D`, and include
only effective settlements posted through `D`. The transaction date must be
included in the reporting query cutoff. A November adjustment must not alter
the reconstructed receivable as of October 31.

The same SQL credit-note aggregate is left-joined to the transaction **after
being grouped by transaction ID**, independently of payment totals. This
prevents a multiplicative join when a sale has multiple payments and multiple
credit notes. SQL filtering, sorting by outstanding balance, overdue counts,
page summaries and per-contact balances use one net-sale expression.

## Current read contracts

- `Transaction.montant_total` and existing `montant_total` API field remain
  the **gross original value**.
- `TransactionRead`, payment-summary and financial collection items now also
  expose `montant_avoir` and `montant_net`. Payment status, amount due and
  remaining balance use **net** value.
- `/transactions/creances` and `/transactions/dettes` `summary.total`
  represents **net** value, with `summary.total_brut` and
  `summary.total_avoirs` explicitly separating gross and credit notes.
- Customer balances (`include_balance`) and the as-of global financial
  position use the same grouped net expression without N+1 contact queries.
- The original client/supplier, payment records, transaction identity and
  business dates remain unchanged.

### Worked example

Original sale: 1,000 eggs, **1,500.00 MAD**. First 100 undelivered eggs
cancelled October 20, second 300 cancelled November 10.
Avoirs are 150.00 and 450.00 MAD, respectively. Payments: 750 MAD October
15, another 750 November 4; a separate actual refund of 600 November 12.

| Cutoff | Net sale | Effective signed payments | Customer balance |
| --- | ---: | ---: | ---: |
| October 19 | 1,500 | 750 | +750 due |
| October 31 | 1,350 | 750 | +600 due |
| November 8 | 1,350 | 1,500 | −150 credit |
| November 11 | 900 | 1,500 | −600 credit |
| November 12 | 900 | 900 | 0 settled |

The October sale remains originally **1,500 MAD**, even after November.

## Verification

- `backend/tests/test_release4_financial_projection.py`: historical cutoff
  scenarios, refunds/overpayments, current SQL/Python aggregate parity, API
  gross/avoir/net contracts, statuses, overdue filters, multi-payment/
  multi-avoir aggregation and supplier isolation.
- `backend/tests/test_release4_ledger_pg.py`: native PostgreSQL migrated
  schema also verifies current and historical financial reads using actual
  ledger entries.
- CI must pass the full existing backend/frontend suites, Release 1/3 native
  tests, schema migrations, native Release 4 tests and secrets checks.

## Deliberate remaining gates

1. **Phase 4:** enable one idempotent, locked API transaction that writes stock
   cancellation **and** matching credit note atomically; until then Phase 3
   projections are read-only.
2. **Phase 5:** reconcile existing credit allocation and refund capacity guards
   with newly negative net balances; do not expose spending or refund of
   commercial credits until these guards use consistent net values.
3. **Phase 6:** update monthly reports, PDF/Excel exports and period movement
   categorization. Historical monthly sales must preserve the original
   October sale and post the later commercial adjustment in November.
4. **Phase 7:** present gross/avoir/net coherently in the interface, restore
   the safe cancellation action and show explicit credit vs refund.
5. **Phase 8:** staging-specific DB migration, authenticated browser E2E and
   final approval before any production changes.

**No customer action, cancellation, payment, refund or database write is
introduced by Phase 3.** No Suivi global redesign belongs in this phase.
