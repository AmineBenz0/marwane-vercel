# Advance and payment workflow acceptance — 2 November 2026

Scope: shared client/supplier balances and advance history, editable oldest-first allocation, combined advance plus cash/bank payment, and advance-funded transaction creation. Production is unchanged. No database migration was needed.

## Automated verification

- Backend full suite: 335 passed, 11 skipped. Final settlement and atomic-creation checks: 14 passed after the last backend changes.
- Frontend full suite: 308 passed across 63 files. The final creation checks passed all 3 targeted cases after the cent-rounding and transaction-type freeze adjustments. The 24 focused creation/reference/dialog checks also passed; earlier timeout and formatting-assertion failures were resolved.
- The creation form's uncertain-response test exposed a missing effective field lock. Inputs and controls now freeze while the original confirmation can be retried with its original UUID and payload. The creation tests cover full advance funding, partial funding, and ambiguous-response retry.
- A live check found the initial sales-products request could overwrite purchase products when opening from a supplier profile. Reference loading now ignores superseded requests; switching type uses the same effect rather than launching an extra unguarded request. Added delayed-response and type-switch regressions.
- Production frontend build passed. Targeted lint has no errors; three existing hook-dependency warnings remain in the profile/detail pages.

## Authenticated staging walkthrough

Final verified code deployment: `dpl_69ctNbvA8RdQyZRaTDqiWLVGLp8U`, commit `37922e61ee5cadbd53f2765a9d95987fa609109b`. The staging alias resolves to this READY deployment. Follow-up commits fixed purchase reference loading, cent-rounded complements, and disabling the transaction-type switch during an uncertain confirmation.

Initial feature deployment: `dpl_7XvynvpKtEt4mWCNfYT4mfUNo4az`, commit `f646c3a61ad58fbeb887ef64df17acc2bb7be622`. Staging alias was explicitly assigned after its commit, project and READY state were verified.

- Client 7: recorded marked 0.50 MAD cash advance `93e50be6-547b-4eb1-a5f1-182f87ab0193`, producing cash movement 68 immediately without choosing a sale.
- Sale 27: payment form suggested that advance plus a complement. Changed the complement to 0.10 MAD, reviewed 0.90 MAD remaining, then confirmed once. Allocation `7fd056cd-4c23-59c8-8b31-63be81c436d3` created compensation payment 56, and ordinary payment 57 created cash movement 69. SQL found exactly the original 0.50 MAD entry and the new 0.10 MAD entry, with no ledger movement for compensation.
- Canceled the allocation, which restored 0.50 MAD available; canceled ordinary payment 57 and the unused advance. Sale 27 returned to 1.50 MAD unpaid, with retained canceled history.
- Supplier 6: recorded marked 0.30 MAD bank advance `42b53260-2a32-407f-9a20-6ecf5f46748d` in reconciled test account 3. The bulk shortcut proposed purchase 14 first; adjusted 0.30 to 0.20 MAD and confirmed. Allocation `99f55fa8-4bf5-5a9c-8fb7-ab060d699b9d` left 0.10 MAD available, displayed under its originating advance. Bank balance remained -0.30 MAD with exactly one active bank movement (31).
- Returned the remaining 0.10 MAD. Return `e445c25b-dd7d-4109-9655-b575b7d596d3` created incoming bank movement 32 and changed account 3 to -0.20 MAD. Canceled that return, the allocation, and the original advance through the preview/confirmation UI.
- Read-only SQL after cleanup confirmed zero active marked advances, allocations or new payment effects; cash movements 68/69 and bank movements 31/32 canceled; account 3 restored to zero. Supplier 6 returned to 2,000 MAD net outstanding. No console errors were captured on the walkthrough tab.

- New purchase creation from supplier 6: after correcting the reference-loading race, the selector showed only purchase products. Recorded test purchase 41 (one unit, 0.30 MAD) with advance `bdbd29df-aae0-4aca-8359-1c9fd74c7417` for 0.20 MAD and an automatically suggested complement of exactly 0.10 MAD. SQL confirmed compensation payment 59, ordinary payment 60, cash advance movement 72 and complement movement 73, with no cash movement for compensation. The form closed successfully and the profile refreshed to fully settled purchase totals.
- Final cleanup canceled allocation `5cb3e406-8bcd-5a03-9f2a-60da8ceca879`, payment 60, purchase 41 and its unused advance. SQL confirmed all marked advances and allocations canceled, payments 56–60 inactive, no active test cash/bank movements, account 3 at zero, purchase 41 inactive, sale 27 with no active payments, and product 6 stock restored to its baseline of 200. Retained journals and canceled history remain available.

Screenshots show the [client layout](qa/advance-client-profile.png), [combined confirmation](qa/advance-combined-preview.png), and [supplier advance with grouped usage](qa/advance-supplier-grouped.png). Screenshots containing active entries were captured during verification, before cleanup. The [final verified supplier profile](qa/advance-final-verified.png) shows the restored balance after cleanup.

## Release limits

Staging checks use marked test contacts and small synthetic amounts. Local tests verify rollback and idempotency; broader live PostgreSQL concurrency/load and recovery drills remain separate release gates. This feature does not close Phase 6D owner acceptance or Phase 6E restoration/conversion work.

## Shared disclosure components

Follow-up code commit `cf3e8e75618b3ae810c4078f978343a5111a0cc4` replaces both native disclosure controls with the existing `ExpandableDetails` component. History stays collapsed initially; archived usage remains expanded when history is opened. Its five focused tests passed, targeted lint had no errors, and the frontend build passed. READY deployment `dpl_7efyGPdSnRViMN5Rs5wsJK5W1pZi` was verified and assigned to staging. The browser check confirmed the history default and Space/Enter toggling of a nested usage section. See the [shared disclosure controls](qa/advance-shared-disclosures.png). No financial records were created for this UI check.
