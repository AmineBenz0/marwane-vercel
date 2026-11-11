# Release 4 — Phase 8 validation and release gate

**Date:** 11 November 2026
**PR:** #108 (`codex/release4-deferred-close-20261111`)
**Decision:** **NO-GO** for any staging or production cancellation writes until
the documented environment blockers are addressed and all acceptance gates
pass. No Supabase migrations, flags, Vercel environment variables, production
branches or live business data were modified during this audit.

## 1. Environment inventory (verified read-only)

| Target | Evidence | Assessment |
| --- | --- | --- |
| Production Supabase `comptabilite-db` | Separate healthy project; not changed or migrated | **Protected** |
| Existing Supabase `marwane-staging` | Separate healthy project, latest listed migration `20261109095334_optional_task_date` | **Not Release 4-ready** |
| Existing staging data | 30 sales, 36 payments, 20 egg allocations on 11 Nov | **Keep intact** |
| Existing staging fulfillment | 1 allocation on an active sale is reserved but not delivered | **Divergent stock workflow** |
| Staging commercial adjustment ledger | `public.avoirs_livraison_differee` **absent** | **Blocked** |
| Staging refund guard | `refund_monetary_capacity(integer,date)` **absent** | **Blocked** |
| Existing credit guard | `credit_transaction_capacity` exists but predates new dated avoir calculation | **Requires upgrade** |
| Staging app security | `app_runtime` exists, no BYPASSRLS; `transactions` has RLS, direct anonymous/authenticated table SELECT denied | **Initial read-only check passes** |
| Release 4 Vercel PR preview | Build preflight: `DATABASE_URL must point to a managed database` | **Failed preview** |
| Vercel preview configuration | Only other branch-scoped preview envs (staging and release3) have managed DB credentials; this Release 4 branch has none | **Do not reuse staging DB blindly** |

**Reproducible fail-closed gate:** execute
`backend/scripts/release4_staging_readiness.sql` as a **read-only**
database preflight. It was executed on `marwane-staging` through the
connected Supabase SQL interface. It correctly failed with:

`R4 PRECHECK BLOCKED: immutable commercial avoir table missing;
dated net-credit/refund guard functions missing; active
reserved-but-undelivered eggs require model reconciliation`.

No SQL migration or data correction was executed on that project.

**Important:** This is not a simple `CREATE TABLE` gap. Staging preserves
the earlier *reserved vs actually delivered* stock workflow, whereas the
Release 4 cancellation contract only permits cancellation of **unallocated**
eggs when already-covered eggs are actually delivered. Before validating
cancellation on staging, reconcile the domain meaning and existing active
reservation. Do not silently convert, delete or mark the stock delivered.

## 2. Automated isolated acceptance added in Phase 8

**Native PostgreSQL.** The CI jobs create a disposable `localhost`
PostgreSQL database, apply the existing financial foundations and
Release 4 ledger/refund migrations in the documented order, and execute:

- Failed-transaction rollback, credit-note immutability, parity and
  idempotency, dated commercial adjustments and explicit refund behavior.
- The new staging readiness SQL after migrations, including app-runtime
  privileges, public-role isolation, ledger triggers, RLS and active
  reserved-but-undelivered rows.
- New `backend/tests/test_release4_authenticated_pg.py`: real local
  FastAPI login, JWT and authorization; read-only quote without writes;
  versioned cancellation, immutable commercial ledger, one cash movement
  remaining unchanged after credit issuance; same-UUID replay; one
  explicit transaction refund and no duplicated cash movement or advance.
- Guarded collection: the native tests **skip entirely** unless
  `TEST_DATABASE_URL` points to localhost `/comptabilite_db` and
  `ENVIRONMENT=testing`.

**Desktop/mobile browser.** `playwright.release4.config.ts` and
`tests-ui/release4-deferred-cancellation.spec.ts` run real React pages with
synthetic session and isolated API mocks on a disposable Vite server,
including narrow mobile and wide desktop viewports:

- Show accurate 1,500/600/900 MAD original/avoir/net values before
  confirming cancellation; no POST merely by opening a dialog.
- Successful sale update, credit panel, recorded dated audit and exit
  from active delivery queue while preserving the open detail.
- 409 stale revision/quantity conflict blocks re-submit.
- Lost response reuses the original UUID rather than creating two credits.
- Reserved-but-undelivered quotation 409 blocks the action.
- No unexpected financial writes outside the cancellation API.

These browser checks prove the UI interaction, **not** a real deployed
Vercel/Supabase network integration. Treat them as supporting evidence only.

**CI:** The enterprise workflow runs the preflight and native
authentication in disposable PostgreSQL, and the additional browser
suite. Obsolete draft branch runs are canceled automatically so that
current-head verification is not buried behind older commits. Main
branch runs are not subject to this cancellation.

## 3. Supabase security review

Read-only Supabase security advisors reported:

- **2 INFO:** `alembic_version` and `independent_lot_migration_map`
  have RLS enabled without a public policy. For private migration metadata
  that is consistent with keeping them inaccessible to browser roles;
  verify owner/runtime access if any migration tool needs it.
- **2 WARN:** `pg_trgm` and `unaccent` are installed in the
  `public` schema. Review separately; moving existing extensions
  blindly could break schema dependencies. See
  https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

These are existing staging advisories and are not evidence of new
Release 4 exposure. This review does **not** substitute for Phase 8
authenticated and database-role E2E testing on a migrated staging target.

## 4. Required final staging sequence

1. **Isolate:** provision a disposable Supabase branch/project or other
   truly isolated PostgreSQL instance. Do not use production or the
   existing shared staging schema for destructive tests. Confirm explicit
   ownership, DB role and no shared production connection.
2. **Reconcile model:** determine how to handle staging's reserved
   but undelivered eggs without losing stock, source chronology or
   transaction history. Production's automatic FIFO contract must
   remain unchanged.
3. **Migrate atomically:** apply audited migrations to the isolated
   target in repository order:
   `production_correction_history_foundation.sql`,
   `production_integrated_corrections_atomic.sql`,
   `production_party_credits_refunds_atomic.sql`,
   `production_cheque_lc_lifecycle_atomic.sql`,
   `production_deferred_avoirs_atomic.sql`, then
   `production_deferred_refund_guards_atomic.sql`. Check Alembic baseline
   and preserve prior migrations; **do not replay already-installed
   migrations on the existing staging project without a compatibility diff**.
4. **Preflight:** the read-only Release 4 readiness script must
   exit 0, and its runtime permission checks must pass. Verify
   `anon`/`authenticated` cannot write the ledger or execute
   sensitive guard functions, and `app_runtime` can use only
   intended table permissions.
5. **Preview target:** provide the PR branch a least-privilege,
   branch-scoped preview database connection for the isolated
   target, with validated auth, CORS and CRON settings. Do not copy
   production secret values or publish environment files.
6. **Enable only there:** when migrations and auth pass, explicitly
   enable `ENABLE_DEFERRED_CANCELLATION_WRITES` and
   `VITE_ENABLE_DEFERRED_CANCELLATION_WRITES` in isolated staging
   and redeploy the preview at the same reviewed commit. Keep
   production flags OFF. Check the independent refund gate separately.
7. **Real-browser acceptance:** authenticate to the deployed preview,
   create a test deferred egg sale, confirm exact quote and safe
   cancellation, verify stock, commercial credit, historical cutoff
   reports and PDF/Excel exports, retry the same UUID, try stale
   revisions and a later effective payment/refund, and verify that
   financial movements occur only after explicit refund approval.
   Check desktop/mobile layouts with a real account and DB.
8. **Release decision:** all CI, database-security, ledger and
   authenticated browser tests must pass. Review deployment logs
   and isolate any changes or warnings. **Only then request an
   explicit separate production release approval.**

**Do not merge this draft PR, enable flags on the shared staging/production
targets, migrate production, or promote any Vercel preview now.**

## 5. Evidence links

- [Draft PR #108](https://github.com/AmineBenz0/marwane-vercel/pull/108)
- [PR Actions](https://github.com/AmineBenz0/marwane-vercel/actions)
- [Vercel Release 4 preview preflight failure](https://vercel.com/airzets-projects/marwane-vercel/Hn7yf1UGDFoERwsBejSxzWzg3gjb)
- [Supabase environment management](https://supabase.com/docs/guides/deployment/managing-environments)
