# Release 1 — guarded correction preview/apply and history

## Candidate scope

This branch intentionally ports **a safe subset** of the staging correction writer
to the current production codebase. It integrates with the installed revision
foundation but is NOT a general financial/stock rewrite.

Supported, authenticated preview/apply changes:
- `date_echeance` of an active transaction; optional and never earlier than its transaction date
- `prix_unitaire` and derived `montant_total` for **client sales with no payment rows**
- `id_client` for active, unpaid, non-deferred client sales only; same side, validated active client
- `notes` on an existing payment, without changing ledger/instrument attributes

All other `CorrectionChanges` (quantity, product, origin, building, transaction
date, supplier identity, payment amounts/dates/methods, cash/bank sources, cheque
status, LC, explicit stock allocations) are rejected. Their adapters belong
to later releases and cannot be bypassed by crafting direct API requests.

## Correctness contract

- Read-only `POST /api/v1/corrections/preview` produces before/after state,
  balance impact and a dependency fingerprint.
- `POST /api/v1/corrections/apply` uses the same command plus fingerprint,
  locks the transaction first, checks database-managed `row_version`, locks
  dependent payments, revalidates business rules and dependencies, and rejects
  stale input with HTTP 409.
- Stable operation UUID plus normalized request hash provides idempotent replay.
  Reuse with different payload or actor returns HTTP 409.
- One transaction stores the operation and the corrected row. PostgreSQL
  triggers create immutable `entity_revisions` linked to the operation via a
  transaction-local setting. No operation is persisted for a no-op.
- The saved snapshot must match the expected one; otherwise rollback and HTTP
  409. No fallback to unsafe `PUT` after an audited apply fails.
- The existing transaction editor obtains a server-backed preview when *only*
  supported fields were edited, then uses the audited apply on confirmation.
  Other established editing behavior and payment forms are unchanged.
- History is displayed within the existing modification-history component,
  keeping the app design and without asking for optional correction motives.
- No new SQL is applied to live production by this PR.

## Automated checks

- Python tests for preview purity, unsupported-field rejection, chronology and
  stale version checks.
- Native PostgreSQL writer integration runs in **its own disposable PostgreSQL
  CI service**, with the reviewed production foundation installed. Checks
  actual database-triggered revisions, idempotency, stale preview after a
  payment, and note-only corrections without bank/cash movements.
- Existing backend/frontend, migration, secret scanning and unit/browser tests
  must remain green. Skipped jobs do NOT count as passing.
- PR preview deploy must have a functioning isolated target; current generic
  Vercel PR previews fail environment preflight. Do NOT change production
  credentials to fix preview.

## No-go gates before production

1. All CI jobs green, including native write validation (not merely SQLite).
2. A READY preview of the *exact PR SHA* using an isolated database with
   separate credentials; do not point mutating E2E tests to live staging/prod.
3. Authenticated UI tests: preview/cancel/apply, confirmation totals, history,
   reload, stale conflict, no-op, no duplicate payments, and safe failures.
4. Financial/stock regression tests and reconciliation against snapshot;
   no unexpected modification of historical movements.
5. A documented rollback/restore rehearsal and owner acceptance of the exact
   scope/build. Approval to run the previous foundation without backups does
   not approve risk for this writer.

**Current status:** candidate implementation under review; not deployed.
