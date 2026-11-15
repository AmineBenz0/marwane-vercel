# Release 4 — Phase 7: French deferred-sale cancellation and credit UX

**State:** implementation in draft PR #108. Neither staging nor production
was modified. Both cancellation feature flags remain disabled by default.

## User journey

1. In **Livraisons à suivre** or the **transaction detail** for an active
   deferred egg sale with unallocated remainder, the user sees **Annuler les
   œufs restants**, only if `VITE_ENABLE_DEFERRED_CANCELLATION_WRITES=true`
   was explicitly used to build the frontend.
2. The dialog fetches **GET /transactions/{id}/cancel-remainder/preview**.
   The endpoint uses the same pure financial pricing contract as the writer
   and is blocked by the backend `ENABLE_DEFERRED_CANCELLATION_WRITES`
   flag until Phase 8.
3. The preview displays already covered eggs, eggs to cancel, effective
   date, original sale, *new* commercial avoir (not a refund), net sale,
   effective settled amount and either outstanding debt or customer credit.
   No free-text reasons, quantities, options, financial method or statuses
   must be entered.
4. **Confirmer l'annulation** issues **POST /{id}/cancel-remainder** with
   a fresh UUID, quoted sale revision, pending quantity, paid amount
   and business date. The backend rechecks stock and finances before
   atomically posting the stock cancellation and immutable commercial
   credit note. Original sale and payments remain unchanged.
5. If stock, version, paid amount or date changed, the dialog **refuses
   the stale quote** and presents **Actualiser la vente**, not an unsafe
   automatic retry. If a network response was lost, **Réessayer** reuses
   the identical UUID and body, so no second credit is posted.
6. After commit, the sale detail refreshes and shows the exact number
   canceled, the commercial avoir, net amount and customer credit.
   The action disappears once no remainder exists. The sale leaves the
   pending-deliveries queue, while its detail remains accessible and
   its client/product label remains visible in the open drawer.
7. A dated **Détail des avoirs** section and **Historique du stock et des
   avoirs** keep cancellation distinguishable from stock reservations
   and actual cash refunds. Credit notes do not display internal IDs.

## Reusable financial disclosure

One `DeferredSaleFinancialSummary` component is shared by the delivery
drawer and adjusted transaction detail. Ordinary sales retain the simple
**Total / Payé / Reste à encaisser** layout; sales with posted credit notes
also show **Montant initial / Avoirs commerciaux / Montant net** and the
dated adjustments. A negative remaining balance is shown as **Crédit
client**, never as a negative amount remaining to collect.

Even a rounded **0,00 MAD** credit note keeps its dated audit entry and
cancelled quantity visible. The user is told that an avoir does **not**
generate a cash/bank transfer automatically. An eligible explicit
refund remains in the existing transaction-payment workflow and is
separately gated by `ENABLE_CREDIT_REFUND_WRITES` and
`VITE_ENABLE_CREDIT_REFUND_WRITES`.

## Acceptance tests (code)

- Exact server quote and subsequent POST match the immutable avoir
  and retained stock, including negotiated pricing and paid sales.
- Read-only preview creates no operation, stock audit, payment, advance
  or cash/bank movement.
- Both frontend and backend release flags default OFF; no accidental
  cancellation action or preview on an unmigrated production schema.
- Server quote refuses unsupported reserved-but-undelivered eggs.
- Payment changes or Morocco accounting-date rollover after preview
  reject before committing the credit note.
- Stale stock/version conflicts do not submit a new operation without
  a refreshed confirmation.
- Retries after a lost network response preserve the UUID; the backend
  returns the immutable receipt without writing a second credit.
- Successful completion updates the sale, hides the cancellation button,
  shows customer credit, preserves the original client name after the
  transaction disappears from the pending queue and refreshes history.
- Original payment/refund flows and read-only histories still work with
  cancellation disabled.

## Phase 8 prerequisites — NOT applied here

- Confirm the matching production and preview database migrations,
  privileges, native triggers and accounting projection are installed
  on an isolated staging database.
- Enable **both** cancellation flags only in that validated staging
  target. Never switch only the frontend flag in an unmigrated target.
- Run authenticated desktop/mobile browser and database-role tests
  against the real staging environment, including insufficient credit,
  concurrent stock update, lost-response replay and refund routing.
- Confirm separate refund flags and instrument restrictions before
  presenting a cash-out action as available to staff.
- Obtain separate production go/no-go approval before any migration,
  merge, feature flag or production deploy.
