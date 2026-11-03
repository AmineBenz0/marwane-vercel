# Contact-level advances and payments

Advances belong to a client or supplier account. Recording money received from a client or paid to a supplier creates one cash or bank movement and adjusts the contact's net balance. New advances are not assigned to individual sales or purchases.

## User workflow

- Client and supplier profiles show total activity and the net outstanding balance, including advances. The discreet `Avances au compte` link and `Autres actions → Avances et crédits` open the shared drawer.
- The drawer records advances and restitutions and retains their cancellation and history. No transaction selection or `Utiliser` action is offered.
- A transaction's remaining amount and payment status reflect its own recorded settlements. Account advances affect the contact's net balance, without marking a particular transaction paid. The transaction detail and financial register identify this distinction.
- New transactions and payments record only new money. Payment methods are Espèces, Chèque, Virement and Lettre de crédit. Compensation, Carte bancaire and Autre are absent from new payment and correction choices; an existing record can still display its historical method.
- Manual bank movements offer Virement, Chèque and Lettre de crédit. New movements with source Autre are rejected; existing movements remain readable and exact idempotent retries remain supported.

Example: an unpaid 1,000 MAD sale and a 300 MAD advance give a 700 MAD contact balance. The sale still has 1,000 MAD without an assigned settlement. Recording a subsequent 700 MAD payment against that sale leaves 300 MAD on the sale and 300 MAD as an advance at account level, giving a zero contact balance. The advance is not silently consumed or reassigned.

## Persistence and compatibility

The shared contact and financial-position calculations deduct active advances after restitutions and historical allocations. Recording or returning an advance retains preview, dependency checks, atomic application and idempotent retry. Comments remain optional with an automatic audit description.

New `allocate` commands and advance-settlement previews/applications return HTTP 410 at the public API boundary. Transaction creation rejects positive advance-allocation amounts before writing any transaction. New payments with Compensation, Carte bancaire or Autre are rejected in direct, batch and transaction-creation workflows; corrections cannot switch to a retired method. Historical methods remain readable and can be retained when correcting their existing record.

Historical allocations, their paired compensation payments, ledger records and audit entries are preserved. Read access and cancellation remain available. Exact retries of already journaled allocations, settlements and transaction creations still return their saved result after checking payload identity and actor. The retired backend implementation remains for compatibility and internal historical-data tests; the production UI no longer imports its allocation dialogs.

No schema migration or historical rewrite is required. New behavior is deployed to staging; production release remains separate.

## Verification

Tests cover contact-level advance and return accounting without transaction settlement, rejection of new allocation and compensation commands, historical reads/cancellation/retry, transaction creation without consuming advances, and frozen payment retries. See `advance-payment-acceptance.md` for results and staging evidence.
