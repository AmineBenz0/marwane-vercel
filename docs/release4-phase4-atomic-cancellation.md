# Release 4 — Phase 4: atomic closure of undelivered eggs + commercial avoir

**Status:** draft branch implementation, gated OFF by default. Do not enable
`ENABLE_DEFERRED_CANCELLATION_WRITES` on staging or production until Phase 5–8
are completed, the ledger migration is installed in an isolated Release 4
staging database, and the full workflow is approved. The frontend
cancellation button remains hidden.

## Public API contract (internal until final acceptance)

`POST /api/v1/transactions/{id}/cancel-remainder`

```json
{
  "operation_id": "a83a355e-0e9d-41d1-b62e-e4679101c11f",
  "expected_version": 3,
  "quantite_en_attente_attendue": 400
}
```

The future UI generates one random UUID per user confirmation, then keeps
**the same UUID and body across retries**. No optional notes, no manually
entered cancellation reason, no price override, and no refund instruction.

The operation cancels **the entire unallocated remainder**, not already
allocated eggs. Any future partial cancellation API would need its own
explicitly approved user interaction and version tests.

On success, the receipt identifies the immutable avoir and reports the
operation and cumulative canceled quantities, original sale amount,
commercial adjustment, net sale, effective payments, remaining balance,
customer credit and business date. A replay with the identical operation ID,
actor and request returns the original persisted receipt with
`rejoue=true`; reusing the ID with another request or actor returns 409.

### Critical invariants

1. Require an active authenticated user and feature flag. Reject non-egg,
   inactive, supplier, manually allocated and non-promise sales.
2. Lock the building, then product, then sale row, matching the stock writer.
   Refresh allocations and payments after acquiring the locks; compare the
   original row version and expected pending count to the fresh snapshot.
3. Disallow closure when any allocation is not yet delivered. No physical
   stock is removed or reallocated; already delivered sources are unchanged.
4. Calculate the proportional credit on the **original negotiated total**
   with cumulative cent rounding as defined in Phase 1.
5. Insert the existing immutable `correction_operations` journal record,
   update `transactions.quantite_annulee`, append the commercial adjustment
   and transaction audit in **one SQL transaction**. The session-local
   `app.correction_operation_id` tags the database revision audit.
6. PostgreSQL's deferred parity trigger verifies **stock canceled = sum of
   commercial credits** at COMMIT. The API returns success only after commit;
   any DB error rolls all writes back.
7. A committed avoir reduces the *sale's net value*, **not** the original
   invoice total or payment rows. It creates no cash, bank, refund, customer
   advance or reusable credit allocation.

### Acceptance tests

- SQLite/HTTP: default-disabled gate; authenticated operation; correct
  paid-sale values and persisted history; same-ID replay; mismatch, stale
  version, pending mismatch, unfulfilled allocation and no-actor rejections;
  simulated commit failure must leave stock/avoir/history unchanged.
- PostgreSQL 16: native append-only ledger migration and parity; unique
  idempotency journal, immutable audit revision; posted avoir and original
  terms; two concurrent same-ID requests (one new, one replay); two
  concurrent different-ID requests (one accepted, one 409); rollback
  preserves zero stock and financial effects.
- Existing Release 1/3 migration, frontend and backend CI remain mandatory.
- Authenticated deployment-browser E2E and role-based DB security on the
  isolated staging deployment remain Phase 8.

### Intentional limitation

Phase 4 is a **write-path foundation**, not release authorization.
Existing credit-transfer/refund capacity checks must be reconciled with
commercial credits in Phase 5. Dated PDF/Excel reporting is Phase 6, the
human-facing confirmation and button are Phase 7, and actual staging-to-prod
release gates are Phase 8.

Do not merge the draft PR or activate the write flag early.
