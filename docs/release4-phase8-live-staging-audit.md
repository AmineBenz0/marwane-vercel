# Release 4 — Phase 8 staging acceptance: live environment audit (2026-11-11)

**Decision (original audit): BLOCKED until legacy compatibility tests and migrations pass.**
Subsequent read-only investigation isolated two different, nonfinancial
historical cases described below. This remains a go/no-go record,
not a deployed release.

## Scope and verified assets

- Draft PR: #108, branch `codex/release4-deferred-close-20261111`.
- Separate Supabase staging project: `marwane-staging`; production project:
  `comptabilite-db`. Read-only staging metadata and SQL were inspected.
- Vercel Git-linked project: `marwane-vercel`; preview deployment build
  status and failure logs inspected. No Vercel configuration changed.
- Both frontend `VITE_ENABLE_DEFERRED_CANCELLATION_WRITES` and backend
  `ENABLE_DEFERRED_CANCELLATION_WRITES` remain **disabled by default**.
- No real customer data, refund, stock, schema or deployment was changed.


## Updated compatibility findings (read-only verification, 2026-11-11)

The previous global reserved-stock blocker was too broad:

- The **one active reserved-but-not-delivered allocation** is for an
  **ordinary sale**, `est_promesse=false`, with exactly 1 egg reserved,
  0 delivered. Release 4 cancels only **automatically allocated deferred
  customer sales**. There are **zero** such active deferred sales with
  reserved-but-not-delivered allocations. This ordinary reservation
  must not be deleted, delivered, or otherwise altered.
- There is **one separate historical test sale**, inactive, with a
  recorded cancellation of all 6 remaining eggs, 0 allocations and
  **no payment**. Its `transactions_audit` history records both the
  original cancellation and subsequent deactivation as a manually
  tested staging sale. It predates the commercial-credit ledger.
- **Do not invent an old 9.00 MAD credit note** for this inactive sale.
  A new candidate migration now captures an immutable snapshot
  `legacy_deferred_cancellations` ONLY when an older cancellation
  is provably inactive, unpaid and audited. Anything with payments,
  active status or missing cancellation audit still fails preflight.
  Both the baseline and historical transaction are protected against
  mutation, including reactivation, and cannot receive a new avoir.
- The normal new cancellation ledger and dated refund guards remain
  unchanged and apply **only** to newly posted, atomic commercial
  adjustments. A new read-only readiness check protects the historic
  snapshot and only blocks reserved-but-undelivered **eligible deferred
  promises**. Ordinary-sale reservations remain intact.

**Testing:** The CI migration-validation job now seeds a synthetic
historical 6-egg cancellation on a disposable PostgreSQL database
before installing the ledger, then verifies its immutable baseline,
the absence of a fictitious avoir/payment, and rejection of edits.
No actual staging rows or secrets are used in that test.

**Migration policy:** Wait for green exact-head CI and an atomic migration
preflight. The production/staging database schema and flags must not
be changed until the migration succeeds with this compatibility case
and live role/security checks have been reviewed. Shared staging
remains unmodified at the time of this note.

## Hard blockers identified by live, read-only staging SQL

1. `public.avoirs_livraison_differee` **does not exist** on staging. The
   immutable commercial ledger, insert-only grants, RLS and parity triggers
   therefore cannot yet be validated there.
2. `public.refund_monetary_capacity(integer,date)` **does not exist** on
   staging. Phase 5 cannot safely refund a canceled sale on this schema.
3. `correction_operations`, `credit_transaction_capacity`, an
   `app_runtime` role, `transactions.quantite_annulee` and
   `transactions.row_version` are present. Their presence **does not**
   mean the overall Release 4 schema is compatible.
4. Staging contains **one active reservation on one sale with
   `egg_sale_allocations.quantite > quantite_livree`**. The Release 4
   production-model cancellation currently requires already-covered eggs
   to equal delivered eggs; this existing reservation must not be silently
   treated as delivered or automatically canceled. Reconcile the legacy
   reserved/delivered allocation semantics before applying candidate
   migrations or running real cancellation tests.
5. Supabase staging migration history has the older
   `deferred_sale_remainder`, `explicit_transaction_refunds`, and
   `party_advances_credit_allocation` migrations, but no Release 4
   commercial-ledger or dated refund-guard migration.

**Action:** First prepare an explicit, individually tested staging schema
compatibility migration/plan that preserves the existing reservation.
Test that plan on a separate **disposable** copy or isolated Postgres
instance. Only after a passing staged parity/security read-only check
may a candidate Release 4 migration be applied to `marwane-staging`.
Never import the older staging reservations into a production FIFO
write model by changing the meaning of `quantite_livree`.

## Frontend CI and preview findings

- Run #1684 on earlier branch head `651761c`: backend, Release 1/3/4
  native PostgreSQL tests, migrations and secret scan **passed**.
- That run's standard desktop/mobile suite: **23 passed, one failed**.
  The failing test still searched for `Montant total` in a transaction
  Excel register where Phase 6 correctly renamed it `Montant initial`
  and introduced a separate `Montant net`. The test also assumed its
  total label immediately preceded the amount, which no longer held
  after adding new commercial columns.
- The browser test was updated (commit `b026354`) to assert
  `Montant initial`, `Montant net` and the corrected total-label
  location; the exact-head GitHub Actions check must pass before closing
  that defect.
- Existing Git-linked preview deployments reported **ERROR**.
  Vercel build logs identify its fail-closed preview environment
  preflight: dedicated managed `DATABASE_URL`/app_runtime role,
  non-default `SECRET_KEY`, non-default `CRON_SECRET`, and an explicit
  HTTPS origin in `CORS_ORIGINS` were missing or invalid. No
  credentials were read, output, requested or changed here.
  Do not disable the security preflight to make builds green.

## Existing disposable CI acceptance

The PR already includes a fail-closed readiness script at
`backend/scripts/release4_staging_readiness.sql`, migrated native
Postgres ledger tests, and mock-backed Release 4 browser journeys at
`frontend/tests-ui/release4-deferred-cancellation.spec.ts` with
`frontend/playwright.release4.config.ts`. Mock-backed browser tests
verify React/UI behavior but **do not prove** real authenticated
staging, migration role permissions, trigger atomicity, or refund
conservation.

The authenticated real-environment E2E and live database-security
jobs are currently skipped by GitHub variables. Their absence is a
release blocker, **not** a green result.

## Remaining ordered gates

1. Green exact-head CI: lint/unit/build, browser tests, Release 1/3/4
   PostgreSQL, migrations and security scans.
2. Reconcile the existing staging reserved-versus-delivered rows and
   explicitly prove the candidate migration preserves those stock
   reservations and each relevant payment/credit history.
3. Provision a correct *preview-only* Vercel environment using
   dedicated staging database credentials and configured HTTPS origin,
   through secret management. Never copy production credentials to
   preview or print secrets in logs.
4. Apply the verified migration atomically **only to isolated staging**
   after the previous schema/stock compatibility tests pass. Inspect
   actual RLS, grants, append-only triggers, and due-date projections.
5. Enable frontend and backend cancellation gates **only on staging**,
   exercise authenticated desktop/mobile realistic flows:
   confirmed cancellation, no automatic cash, separate refund,
   disputed/insufficient/cheque/LC credit restrictions, stale stock,
   lost-response UUID replay, closed sale history, and PDF/Excel dates.
6. Re-run live least-privilege role tests, backup/recovery assessment
   and cash/bank balance reconciliation. Record exact staging
   deployment ID/commit and test evidence.
7. Request a **separate explicit production approval** and only then
   perform production migration/deployment/release procedures.

**Do not enable flags, merge PR #108 or deploy Release 4 to production
based on this audit alone.**
