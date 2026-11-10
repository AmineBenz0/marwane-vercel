# Release 1 — audited transaction corrections (controlled rollout)

## Current branch scope

This branch begins the production port of staging's Phase 5 correction workflow,
without enabling unsafe writes. It:

- Adds the already-migrated, database-managed `row_version` column to the
  transaction and payment ORM models and API read schemas.
- Ports the existing staging correction-operation and entity-revision models,
  correction schemas, and correction history reader.
- Exposes only authenticated `GET /api/v1/corrections/history` with the same
  paginated response shape as staging.
- Does **not** mount `POST /corrections/preview`, `POST /corrections/apply`,
  or any refund, advance, stock-correction, cheque or LC writer.
- Does not change or migrate production data or financial behavior.

## Why the staged writer cannot be copied directly

Staging's `correction_commands` imports stock, financial movement, cheque,
credit and instrument adapters and relies on additional staging-only migrations.
Copying that writer or the entire `staging` branch into production at this
point could break the payment and stock contracts.

## Release 1 acceptance, still outstanding

1. Verify read-side ORM compatibility on a disposable Postgres database
   **with the correction-history foundation applied**.
2. Port a deliberately scoped preview/apply command, test stale versions,
   optimistic concurrency, operation UUID retries and rollback.
3. Wire the existing transaction edit review to the server-backed preview
   with clear UI feedback, preserving the current design.
4. Test with valid/invalid transaction edits and metadata-only payment changes.
5. Run the authenticated staging browser walkthrough (no production test writes).
6. Validate migrations, runtime permissions and a tested recovery/restore path
   before approving the full correction writer for production.

This is an incremental *draft PR*, not authorization to deploy Release 1.
