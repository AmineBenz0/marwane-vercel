# Release 4 — Phase 6: reports and financial exports

**Delivery state:** code-only candidate in draft PR #108. No staging/production
migration or deployment, no feature flag enabled. Full end-to-end acceptance
remains Phase 8.

## Accounting contract

A commercial **avoir** is a distinct immutable event on its **date_effet**;
it is not a negative payment and it never creates a refund or bank/cash
movement on its own.

- **Monthly sales booked**: gross amount of *active* sales whose
  `date_transaction` lies within the selected calendar month.
- **Commercial avoirs issued**: sum of adjustment amounts whose
  `date_effet` lies within that month, regardless of the original sale's
  date. Multiple credit notes are grouped separately from payments to
  avoid multiplication by installment count.
- **Monthly net sales**: gross booked sales minus those issued avoirs.
  A month without sales but with a later credit note may correctly show
  negative monthly net activity. It does **not** retroactively rewrite
  the prior month's original-sale figure.
- **Customer refunds**: effective explicit
  `Paiement(nature='remboursement')` recorded on the refund date,
  displayed as a separate informational amount, **already included**
  in that period's cash/bank outgoing movements. Never subtract it
  from net sales again.
- **Receivables, customer credit and payments**: continue using
  `financial_position_as_of` and the shared signed effective-payment
  and dated-net-sale financial projections.

The existing monthly API field `ventes` retains its original meaning
(gross sales) for compatibility. Additive fields are
`avoirs_commerciaux`, `ventes_nettes` and
`remboursements_clients`. The PDF and screen primary activity metric
is labeled **Ventes nettes**.

## Exports

**Monthly PDF and Excel**

- Primary figure: net sales.
- Breakdown: original sales and commercial credit notes posted in month.
- Refund information is explicitly labeled as already included in
  cash/bank outflows.
- Historical month-end vs current balance columns stay separate,
  including clear projection dates.

**Transactions register PDF and Excel**

- The headline total and main PDF register show **net transaction value**.
  Original sale total and cumulative avoirs remain auditable.
- Excel has distinct **Montant initial**, **Avoirs commerciaux**,
  **Montant net**, **Payé**, **Reste**, and dated **Détail des avoirs**.
  Active-only totals reconcile each column rather than summing a
  transaction's initial sale as though no credit was issued.
- PDF has a separate **Avoirs commerciaux** annex with effective date,
  partner, product, canceled quantity, amount and net amount after each
  adjustment, and a separate **Règlement** annex for payments/refunds.
  It never exposes database IDs.
- Deferred delivery inventory annex distinguishes canceled quantity
  from pending unallocated eggs.
- Refunds in payment detail are labeled explicitly and preserve
  cents instead of rounding them to whole dirhams.

**Customer reports**

- Lifetime sales, average sales and product spending are net of all
  posted commercial adjustments. Product quantities exclude
  undelivered canceled units.
- Monthly customer chart groups original sales by transaction date
  and commercial credit notes by their issue dates using **two
  aggregate queries** for 6–12 months.
- Financial insights and overdue amounts use net active sales and
  effective signed payments, including explicit refunds.
- Client Excel and transaction table include original value, credit,
  net amount and dated credit note details.

## Regression cases

1. October 1,500 MAD sale, October 150 MAD avoir, November
   450 MAD avoir, multiple installments and November 600 MAD refund:
   October original sales remain 1,500 and October net 1,350;
   November net activity is −450 when no new sale occurred.
2. A second customer with an unaffected October sale of 100 MAD
   gives October monthly original 1,600, avoir 150, net 1,450.
   Customer/product rankings reconcile with the adjusted amounts.
3. Refund does not reduce November net sales **again**, and is
   not silently duplicated in cash/bank totals.
4. Customer product quantity and average unit price reflect
   1,000 ordered, 400 canceled, 600 non-canceled units at
   900 MAD net/600 = 1.50 MAD each.
5. Transaction API emits both individual credit note dates and
   amounts; PDF and Excel retain their separate audit trail and
   no internal database IDs.
6. Unadjusted sales, purchases, suppliers and historic
   PDF pagination retain previous layout and amounts.
7. Native PostgreSQL migrations, Release 1/3 financial
   integrations, backend/frontend suites and secret scanning
   must pass before marking Phase 6 complete.

## Remaining work

Phase 7 reconnects the French user journey for cancellation confirmation,
credit/refund awareness and audited delivery history without adding
unnecessary statuses or optional fields. Phase 8 applies migrations
and performs authenticated real-browser + database security validation
on isolated staging, followed by a separate production go/no-go.
