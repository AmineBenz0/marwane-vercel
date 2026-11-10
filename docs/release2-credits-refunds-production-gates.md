# Release 2 — Advances, credits and refunds: production gate

## Status as of 2026-11-10

- Draft PR #106; no release-2 SQL has been applied to production.
- Head SHA from 2026-11-10 CI: `58faf9e594aa9dde623fc99679ba6fec3138489e`
- GitHub Actions run 42848757220: backend, frontend, secrets, migration-validation and native PostgreSQL all passed.
- E2E and database-security jobs were **skipped**; they must not be represented as passing.
- Native PostgreSQL exercises 40 credit/refund tests and the existing integrated correction suite.
- Candidate production SQL: `backend/migrations/production_party_credits_refunds_atomic.sql`.
- Both new write flags must remain disabled until the migration and acceptance checks are completed.
- Production project: `pudpijigevertmjmbtmc`; staging project: `aqosvbpcxfpntcejebma`.
- Read-only checks on 2026-11-10 show production has Release 1's `check_paiement_nature_release1`, existing correction foundation, and no `avances` or `affectations_credit` tables. Production has 0 transactions/payments/cash/bank movement rows **at that moment**, but live production and stock/lot data exist. These numbers can change.

## Hard stop: verified backup and recovery

No production DB snapshot and restore procedure has been established through the available connected tools. A green CI run on a disposable PostgreSQL database is **not** proof that production can be recovered.

Do **not** apply SQL, enable the feature, or merge PR until an operator has:
1. Obtained an independently stored, restorable backup or snapshot of the entire production PostgreSQL database (schema and data, including lot, production, stock and finance tables).
2. Verified that the artifact was captured at the right database/project, and the restore instructions and access are operational. Prefer a rehearsal in an isolated instance.
3. Recorded a post-backup production row-count/schema snapshot and an exact rollback/recovery decision owner.

Neither a Vercel rollback nor re-applying the prior Git revision undoes a database migration.

## Preview environment

Automatic PR previews are failing the environment preflight because a managed `DATABASE_URL` is not configured for the preview deployment (Vercel deployment `dpl_5P6ziQPsAEMbkSturfyWmrZH5Nyq`). Do not copy production credentials into a public or untrusted PR preview. Configure a private, least-privilege test DB/preview environment matching the staging schema, or perform the authenticated smoke test through the approved staging deployment.

## Approved sequence once the blockers are resolved

1. Freeze/review the release diff and confirm the deployed production SHA and production migration history remain compatible with this branch.
2. Verify complete isolated backup + restore capability, and capture fresh preflight schema and record counts.
3. Validate full CI on the **final** commit including native PostgreSQL, and complete manual authenticated credit/refund E2E on a nonproduction environment.
4. Apply **one atomic** versioned Supabase migration from `production_party_credits_refunds_atomic.sql`; do not execute pieces individually. It intentionally removes the Release 1 payment-nature restriction in the same transaction as it adds credit/refund guards.
5. Verify migration metadata, `avances`/`affectations_credit` RLS and privileges, paired payment/refund constraints, ledger origin columns/triggers, and existing stock/lot data. Compare read-only production invariants before/after.
6. Merge the validated PR only after SQL compatibility is established. The backend must remain **write-disabled** with `ENABLE_CREDIT_REFUND_WRITES=false` during rollout; frontend `VITE_ENABLE_CREDIT_REFUND_WRITES=false` until enabling the UI.
7. Deploy the production application and verify core production pages, existing corrections, reports and finance summaries with feature disabled. Enable both flags only after full authenticated smoke testing and monitoring.
8. If anything fails **before** enabling writes, disable flags and roll back the application. For a database rollback, use the verified restore plan; do not drop tables with financial history or attempt an improvised reverse DDL.
9. Once enabled, test one controlled small transaction in an approved account, confirm idempotent replay and linked cash/bank movements, and review warnings, audit logs and balance reconciliation without changing client real-money data.

## Functional acceptance

- Advance received from client and paid to supplier in cash/bank
- Return/void advance with full immutable audit trail and exact balance reversal
- No newly created transaction-to-transaction credit allocations (retired staging workflow); historical allocations remain readable/cancellable
- Refund only against proven available credit, with preview/fingerprint/idempotency and correct bank/cash sign
- Correct paid/remaining/net refunded projections in transaction and contact views
- No credits/refunds against active cheque/LC flows until their dedicated release
- Old payment corrections, deposits, promises, lot and stock functions unaffected
- No unexpected `anon`/`authenticated` grants to credit tables; RLS on
- No regression of French labels and card/menu navigation
- Suivi global stays out of this release

## Out-of-scope security notices

Supabase advisory on 2026-11-10 reports older unrelated function mutable search_path, extensions in `public` and leaked-password protection notices. Log them separately; do not expand this finance release without assessment.
