# Phase 8 — Final staging acceptance and production release gate

Date opened: 7 November 2026
Scope: release readiness for owner correction, stock, LC and reporting flows.
**Current release decision: NO-GO.** Production is unchanged.

## Entry evidence

- Phase 7 closed on staging at `ce86ebdc0dae46ee414b83760c13718cd4ffd435`.
- Standard CI green:
  https://github.com/AmineBenz0/marwane-vercel/actions/runs/42414492269
  (backend, frontend, deterministic desktop/mobile checks, migration checks,
  secret scan).
- Owner inspected live staging exports: 30 transactions (17 active),
  active gross 29,160.90 MAD, paid 6,755.00 MAD, remaining 22,405.90 MAD;
  monthly PDF/XLSX reconciled. Deferred delivery and payment details verified.
- Stage database migrations are recorded through
  `20261103162336_lc_lifecycle_runtime_access` (Supabase).
  This alone does not establish production parity.

## Acceptance gates

| Gate | Status on 7 November | Exit evidence required |
| --- | --- | --- |
| G1. Staging source, deployment and CI | **Passed for entry** | Branch HEAD, READY preview, staging alias and successful checks match exactly |
| G2. Authenticated browser E2E | **Open** | Set `RUN_E2E=true` and secure `E2E_BASE_URL`, `E2E_EMAIL`, `E2E_PASSWORD`; execute read-only transaction/monthly exports and desktop/mobile journeys; keep credentials in GitHub secrets |
| G3. Safe mutation E2E | **Open** | Use disposable staging database/clone with `E2E_MUTATION_TESTS=true`; finance, LC, deferred-stock, lot, payment, credit and correction flow evidence; reconcile and clean test effects without rewriting audit history |
| G4. Native PostgreSQL concurrency/rollback | **Open** | Parallel correction/replay/stale-preview, stock reservation priority, LC/cheque reuse, bank/cash and crash/partial-commit rollback checks; immutable journal matches canonical ledgers |
| G5. Security and dependency review | **Open** | Run conditional database-security workflow and current dependency scans; fix or formally risk-accept advisor notices, recheck grants/RLS/runtime roles, and test schema migrations |
| G6. Backup/PITR and recovery drill | **Open** | Confirm backups and retention, restore to disposable target, run health/integrity/security/reconciliation and reversible payment smoke; record actual RPO/RTO and recovery steps |
| G7. Production schema/config parity | **Open** | Non-destructive prod↔stage migrations, triggers, indexes, privileges, env/CORS/auth/health and baseline reconciliation; production preflight and documented rollback/forward-recovery procedure |
| G8. Owner acceptance and release | **Open** | Reconfirm blocked advanced functionality scope, perform final client walkthrough, approve the exact build and maintenance window; migrate safely, deploy and verify production post-release |

## Current evidence and caveats

- The authenticated `e2e` job is skipped by `.github/workflows/ci.yml`
  unless the repository variable `RUN_E2E` is true. Test discovery in normal
  CI is not execution. The database-security job is separately
  `workflow_dispatch`-gated by `RUN_DATABASE_SECURITY=true`.
- Read-only staging Supabase security advisors on 7 November list:
  **2 information** notices for policyless, intentionally internal
  RLS-protected tables (`alembic_version`,
  `independent_lot_migration_map`),
  **3 warnings** for functions with role-mutable `search_path`, and
  **2 warnings** for `pg_trgm`/`unaccent` installed in `public`.
  Confirm actual exploitability and safe remediation; do not disable RLS
  or move extensions blindly.
  References:
  https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
  https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
  https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- Performance advisors also show unindexed foreign keys (45 on the
  inspection date). Treat as profiling/prioritization items, not automatic
  evidence of a bug or authorization for 45 new indexes.
- `docs/backup-restore-runbook.md` documents the procedure but a completed
  **actual restore drill with comparison evidence was not found**.
- Earlier Phase 6E acceptance conditionally accepted limited
  restoration/service/general-stock conversion; egg-source/deferred-sale
  conversion remains blocked. Confirm allowed production scope, rather than
  treating this work as completed merely because Phase 7 closed.
- The database and security findings are read-only audit evidence, not
  approval to mutate production or staging schema.

## Recommended execution order

1. **G2** authenticated read-only staging E2E, then **G3** disposable mutation
   suites. Repair any regressions before release freeze.
2. **G4–G5** native concurrency and security fixes with verified migrations and
   role-sensitive tests. Keep optional advanced converters blocked.
3. **G6–G7** backup/PITR restoration on an isolated target, production parity
   inventory, rollback and deployment preflight.
4. **G8** owner's explicit go/no-go, migration-first release, smoke/reconcile
   and post-deployment monitoring. No production changes before approval.

## Safety boundaries

Do not invent historical stock allocations or distribute common costs without
a defined policy. Preserve financial history and cancelled/converted originals;
use corrective-forward migrations and audited reversal records instead of
destructive rollback. Use a disposable target for mutating E2E and restore drills.
The client-facing forms should remain simple: do not add mandatory notes,
IDs, motives or verification tags in pursuit of test coverage.


## Phase 8 execution log — 7 November 2026, first release-hardening increment

- Inspected a signed-in staging tab in **read-only** browser mode: transactions
  render and the 30-row list is present. This is not an authenticated click/
  download E2E run; GitHub secrets and the configured `RUN_E2E` gate remain
  required for G2.
- Compared staging with production Supabase inventories using SELECT and
  migration listing only. Stage: 37 public tables, 40 enabled custom triggers,
  219 public indexes, 22 Supabase migrations. Production: 31 / 16 / 127 / 9.
  The **six stage-only tables** are `affectations_credit`, `alembic_version`,
  `avances`, `correction_operations`, `entity_revisions` and
  `utilisations_lettre_credit`. There are also 24 stage trigger identities
  not installed in production and 105 stage index identities missing in prod
  (not a count of automatically required new indexes).
  **No production migration was applied.**
- Added disposable-only native PostgreSQL test coverage for two simultaneous
  edits to one version, simultaneous identical operation retries, and forced
  late-transaction rollback. The test refuses remote database hosts and is
  explicitly activated only in the ephemeral PostgreSQL GitHub job.
  This is *partial* G4 coverage: LC, cheque, stock-order races and restore
  recovery still need separate validation. Results must be recorded after CI.


## Phase 8 scoped security hardening — candidate

Three `SECURITY INVOKER` functions used by the independent-lot triggers
reference their application relations as `public.*` but inherited an
uncontrolled search path. Prepared a metadata-only migration that pins each
function to an empty `search_path`, as recommended by Supabase advisors.
The disposable PostgreSQL migration test and independent-lot lifecycle tests
must pass before applying this change to staging. The two internal policyless
tables and two public-schema extensions are explicitly **not** modified in
this change. No production SQL is authorized.


## Phase 8 execution results — 7 November 2026, 22:06 UTC

### Verified G1/G4/G5 increments

- **Disposable PostgreSQL concurrency checks passed** in CI run
  https://github.com/AmineBenz0/marwane-vercel/actions/runs/42416157643 :
  concurrent distinct edits to one version, identical operation-ID replay,
  and an injected late failure with no persisted transaction/operation/revision
  side effects. These are only the first G4 tests; stock-order/LC/cheque races
  remain to cover.
- **Scoped function-search-path hardening passed all standard CI gates**
  https://github.com/AmineBenz0/marwane-vercel/actions/runs/42416638852
  and migration `phase8_lot_function_search_path` was applied to staging
  Supabase (recorded version `20261107214147`). Advisors no longer list the
  three `function_search_path_mutable` warnings. The remaining staging
  security advisors are two internal policyless RLS tables (INFO) and two
  public-schema extensions (WARN). No extension relocation or RLS-policy
  mutation was performed.
- **Post-migration read-only staging baseline**: 30 transactions, 17 active,
  29,160.90 MAD active total, six lots and six cycles, three pinned trigger
  functions; no financial/lot count changes detected.
- **Stable staging alias verification**: the Vercel READY deployment
  `dpl_H1kZC1zCrpz2VtNghiKRaWnhSXKj` at commit
  `b5c9f8c7feab7aa825beb4ff56cefebe11ea6451` is the current target of
  `marwane-vercel-git-staging-airzets-projects.vercel.app`. The matching
  standard CI run passed. Production was not deployed.

### Production parity — read-only inventory

- Stage: 37 public tables / 40 active custom triggers / 219 indexes /
  22 Supabase migrations **before** this hardening migration, 23 afterward.
- Production: 31 public tables / 16 active custom triggers / 127 indexes /
  9 recorded Supabase migrations.
- Six stage-only tables: `affectations_credit`, `alembic_version`,
  `avances`, `correction_operations`, `entity_revisions`,
  `utilisations_lettre_credit`. A direct inventory comparison also found
  24 staging-only trigger identities, 105 staging-only index identities,
  and 13 staging-only columns on tables common to both environments.
- No migrations, schema changes, or financial records were written to
  production. This is a **migration-planning blocker**, not authorization
  to replay every staging migration blindly. Version naming differs;
  review historical migration effects, preconditions, role grants,
  existing data, and backfill semantics before preparing a production
  migration sequence.

### Still open for final release acceptance

1. G2: authenticated GitHub E2E remains skipped (requires repository
   variable `RUN_E2E=true` and GitHub secrets for staging URL/login).
   Read-only connected browser context is not executable end-to-end UI testing.
2. G3: mutating browser workflows must run against a disposable clone, not
   live staging or production; the currently connected Supabase organization
   shows no existing staging development branch.
3. G4: stock-reservation/LC/cheque races and crash recovery still need
   target-specific concurrency acceptance.
4. G5: both extension-in-public warnings require separate dependency impact
   analysis; do not move extensions merely to clear advisors. Database
   security workflow remains opt-in/skipped in normal CI.
5. G6: backup/PITR availability, restore point, actual isolated restore
   drill and RPO/RTO evidence remain unverified.
6. G7/G8: production parity and migration rehearsal, exact release
   candidate approval, maintenance/rollback plan, and post-deploy
   reconciliation all remain open. **Production NO-GO**.
