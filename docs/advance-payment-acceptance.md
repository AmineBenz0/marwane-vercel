# Advance and payment workflow acceptance — 2 November 2026

Scope: shared client/supplier balances and advance history, editable oldest-first allocation, combined advance plus cash/bank payment, and advance-funded transaction creation. Production is unchanged. No database migration was needed.

## Automated verification

- Backend full suite: 335 passed, 11 skipped. Final settlement and atomic-creation checks: 14 passed after the last backend changes.
- Frontend full run: 303 passed out of 306. One new assertion needed its expected complement normalized from `4` to `4.00`; an existing LC test timed out under parallel load and left its following test with a pending rejection. The complete two-dialog rerun passed all 10 checks. These were not left as unresolved failures.
- The creation form's uncertain-response test exposed a missing effective field lock. Inputs and controls now freeze while the original confirmation can be retried with its original UUID and payload. The creation tests cover full advance funding, partial funding, and ambiguous-response retry.
- A live check found the initial sales-products request could overwrite purchase products when opening from a supplier profile. Reference loading now ignores superseded requests; switching type uses the same effect rather than launching an extra unguarded request. Added delayed-response and type-switch regressions.
- Production frontend build passed. Targeted lint has no errors; three existing hook-dependency warnings remain in the profile/detail pages.

## Authenticated staging walkthrough

Initial feature deployment: `dpl_7XvynvpKtEt4mWCNfYT4mfUNo4az`, commit `f646c3a61ad58fbeb887ef64df17acc2bb7be622`. Staging alias was explicitly assigned after its commit, project and READY state were verified.

- Client 7: recorded marked 0.50 MAD cash advance `93e50be6-547b-4eb1-a5f1-182f87ab0193`, producing cash movement 68 immediately without choosing a sale.
- Sale 27: payment form suggested that advance plus a complement. Changed the complement to 0.10 MAD, reviewed 0.90 MAD remaining, then confirmed once. Allocation `7fd056cd-4c23-59c8-8b31-63be81c436d3` created compensation payment 56, and ordinary payment 57 created cash movement 69. SQL found exactly the original 0.50 MAD entry and the new 0.10 MAD entry, with no ledger movement for compensation.
- Canceled the allocation, which restored 0.50 MAD available; canceled ordinary payment 57 and the unused advance. Sale 27 returned to 1.50 MAD unpaid, with retained canceled history.
- Supplier 6: recorded marked 0.30 MAD bank advance `42b53260-2a32-407f-9a20-6ecf5f46748d` in reconciled test account 3. The bulk shortcut proposed purchase 14 first; adjusted 0.30 to 0.20 MAD and confirmed. Allocation `99f55fa8-4bf5-5a9c-8fb7-ab060d699b9d` left 0.10 MAD available, displayed under its originating advance. Bank balance remained -0.30 MAD with exactly one active bank movement (31).
- Returned the remaining 0.10 MAD. Return `e445c25b-dd7d-4109-9655-b575b7d596d3` created incoming bank movement 32 and changed account 3 to -0.20 MAD. Canceled that return, the allocation, and the original advance through the preview/confirmation UI.
- Read-only SQL after cleanup confirmed zero active marked advances, allocations or new payment effects; cash movements 68/69 and bank movements 31/32 canceled; account 3 restored to zero. Supplier 6 returned to 2,000 MAD net outstanding. No console errors were captured on the walkthrough tab.

Screenshots show the [client layout](qa/advance-client-profile.png), [combined confirmation](qa/advance-combined-preview.png), and [supplier advance with grouped usage](qa/advance-supplier-grouped.png). Screenshots containing active entries were captured during verification, before cleanup.

## Release limits

Staging checks use marked test contacts and small synthetic amounts. Local tests verify rollback and idempotency; broader live PostgreSQL concurrency/load and recovery drills remain separate release gates. This feature does not close Phase 6D owner acceptance or Phase 6E restoration/conversion work.
