# Phase 6D — LC integration regression follow-up (5 November 2026)

**Integration test failures:** resolved on `staging`. **Phase 6D production release:** still not approved.

## Root causes and fixes

- LC client receipt and supplier utilisation are separate lifecycle roles. Incoming receipt and outgoing instrument transfer must not manufacture an unrelated cash/bank movement. Corrections now reconcile the non-cash instrument and its explicit outgoing utilisation link.
- The former LC correction validator expected one active cash movement for every LC payment, contradicting the current non-cash accounting model. It now rejects unexpected cash/bank movements, keeps financial correction audit, updates the outgoing use date and cancels its active usage link when appropriate.
- Canceling an outgoing LC correction now restores original ownership and the held lifecycle state. Outgoing usage stays canceled and immutable in history.
- Supplier cession tests previously expected a cash movement and reversed the transfer to a client; the current business-held instrument transfers to the supplier and the compensation returns it to the business before making the original client holder available again.
- Older payment and atomic-batch fixtures omitted LC origin and receipt date. They now model a verified receipt, outgoing use and recorded payment direction correctly.
- First bank deposit worked with missing LC provenance but could not be reused after cancellation. Direct bank deposit and supplier-transfer endpoints now reject absent or future receipt provenance; transfer dates cannot precede receipt or availability. On valid receipt, deposit -> cancel -> redeposit remains supported with new idempotency keys and preserved history.

## Verification evidence

- Full backend suite from CI run 42128924968: **725 passed, 0 failed, 33 skipped**.
- Native PostgreSQL migration validation from CI run 42129507279: schema and LC replay, lot constraints, financial checks, Phase 6E regression tests and **7 LC API/atomic-flow tests passed**.
- High-severity JavaScript advisory was mitigated by updating only the locked `follow-redirects` package from 1.16.1 to 1.16.2. The isolated npm install/audit workflow passed. Moderate advisories remain subject to separate dependency review.
- Additional negative tests on receipt provenance and invalid transfer dates were committed on top of those successful runs; their final end-to-end CI outcome should be checked at the latest `staging` head before any release.

## Release controls

No production deployment and no live Supabase mutation for this correction. These changes do not authorize a Phase 6D production promotion. Authenticated staging owner walkthrough, remaining domain edge cases and concurrency/recovery release checks remain separate.
