# Advances and payment workflow

Advances retain the existing accounting model: recording money received from a client or paid to a supplier immediately creates its cash or bank movement. Applying that advance to a sale or purchase creates compensation payments and no second money movement.

## User workflow

- Client and supplier summaries show two primary cards: total activity and the net outstanding balance. An available advance adds a discreet link beneath the balance. The shared “Autres actions” menu opens “Avances et crédits” from every profile tab, including when no advance exists.
- The responsive advance drawer contains the available amount, recording and settlement actions, active advance cards, and collapsed history. Uses and returns remain grouped under their originating advance through the existing ExpandableDetails component.
- PartyCreditPanel owns the single balance/history request and the summary; PartyCreditDrawer owns the detailed view and its existing operation dialogs; PartyCreditMenu provides the shared header entry point. Refreshing balances keeps an open operation mounted. The drawer cannot be dismissed while an operation dialog is open.
- Recording an advance does not require selecting a sale or purchase.
- A transaction payment can combine existing advances with a new cash or bank complement. The preview distinguishes compensation from actual new money and shows the resulting debt and available advance.
- The profile shortcut proposes the oldest unpaid transactions first and allows editing amounts before confirmation. A specific advance can also be selected from its card.
- New sales and purchases can use available advances while recording any complement in the same batch. Existing cheque, LC, and manual credit paths remain available.

## Persistence and safety

`/credits/settlements/options` and `/preview` calculate date-sensitive capacity. `/apply` locks the relevant records, rejects a changed dependency fingerprint, and commits advance allocations, the optional complement, and their operation journal together. Native credit allocation operations remain the source of compensation effects and their cancellation behavior.

`/transactions/batch-with-payments` accepts a stable operation UUID and per-line advance amount/date. Transaction creation, stock allocation, compensation, payments, and ledgers share one commit. Repeating a confirmation returns its saved response. Reusing an operation UUID for different data is rejected. The creation form freezes an uncertain submission and retries its original payload.

Cancellation of an allocation restores the available advance. Cancellation of an unused advance reverses its original ledger entry. A restitution creates the opposite money movement. History is retained. No database migration is required for this change.

## Validation

Backend integration tests cover mixed payments, oldest-first allocation, editable destinations, stale previews, replay, supplier bank funding, rollback after partial work, ineligible advances, and transaction creation with exhausted credit or uncertain retries. UI tests cover grouped history, combined confirmation, edited bulk allocations, frozen retries, and fully or partly advance-funded sale creation.

See `advance-payment-acceptance.md` for release checks and staging walkthrough evidence. Production release and broader concurrency/recovery drills remain separate gates.
