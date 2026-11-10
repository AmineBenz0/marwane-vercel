# Production corrections release — clean integration plan

Status: **draft / integration needed / not deployed**

## Baselines

- New release branch: `codex/prod-correction-group-clean-20261110`, from production `main` at commit `42af9bc4cad24b5d7feb6bc6250b4f9a5f10ae1f`.
- Source of validated functionality: `staging`; merge selective files/hunks, **never merge staging wholesale** (250 commits ahead, 27 behind).
- Superseded experiment: PR #104 was closed **unmerged**. The old branch is preserved as a historical reference, not a release base.
- The production correction-history database foundation (row versions, correction operations, immutable revisions) already exists and must not be replayed.

## One dependency-consistent release

Bring over the matching, staged and tested:
1. **Correction API/engine**: `backend/app/services/correction_commands.py`, `correction_contract.py`, `correction_history.py`, `routers/corrections.py`, `schemas/correction.py`.
2. **Ordinary payment/financial ledger adapter**: `cheque_corrections.py` (guard), audited cash/bank synchronization, append-only `ledger.py` linkage and associated payment identity checks.
3. **Stock/egg allocation adapter**: `stock_corrections.py`, source reservation/stock helpers, transaction stock revision and delivered-allocation data model.
4. **Existing UI**: adapt the staging workflow to the current production transaction/payment editor. Preserve the existing French design and review/confirmation UI.
5. **Database migration effects**: audited-payment financial guard, cash/bank correction guard, transaction stock revision, `egg_sale_allocations.quantite_livree` and `transactions.quantite_annulee` (with staged historical-delivered backfill), plus an explicitly reviewed ordinary-payment settlement representation `nature`.

## Do not import unrelated staging modules

Refunds, advances, credit allocations, advanced cheque/LC lifecycle, deferred-delivery rescheduling/cancellation, transaction reactivation/conversion and **Suivi global** remain outside this release. The shared engine must explicitly reject unsupported operations rather than allowing the missing adapters to become implicit dependencies.

## Critical compatibility checks

- Staging code expects `paiements.nature`, `transactions.stock_revision`, `transactions.quantite_annulee` and `egg_sale_allocations.quantite_livree`, all missing in production before this release.
- The staged `paiements.id_affectation` references credit-allocation tables absent in production; do **not** port that field or credit features blindly.
- Staged cheque/LC code references advanced instrument lifecycle tables absent in production; keep guarded until their separate release.
- Production already has newer form, payment and lot changes. Selectively reconcile; do not overwrite main's newer code with staging.
- The historical delivered-egg backfill is **not** equivalent to adding an empty column with `DEFAULT 0`; preserve existing allocated deliveries.

## Clean promotion gate

1. Review exact code dependency closure and produce the minimal migration patch against verified live schema (no replay of installed foundation).
2. Run corrections tests from staging against the integrated branch on disposable PostgreSQL, with CI migration/security and stock/financial reconciliation.
3. Run authenticated UI acceptance for the exact integrated build with isolated test data. Existing staged testing alone doesn't validate this new combination.
4. Verify runtime production database target and a real recovery procedure; do not treat documentation as a restore rehearsal.
5. Obtain GO, apply only approved additive migration effects, deploy the matching app, and perform read-only financial/stock reconciliation and smoke tests.

No production writes, environment changes or activation should be performed until these checks pass.

## Migration execution (10 November 2026 update)

The single release migration is now **`backend/migrations/production_integrated_corrections_atomic.sql`**. It combines the four candidate SQL effects in one transaction, requires the existing history foundation, refuses unexpected financial data, and validates the resulting payment identity guard. Do **not** run four SQL files individually or replay the correction-history foundation. CI exercises an intentionally interrupted migration first to prove rollback.

The operational preflight, backup/recovery and postflight steps are in `docs/prod-corrections-database-migration-runbook.md`. **Database migration remains unexecuted in production:** complete disposable PostgreSQL CI and a verified full production dump/restore before the live migration. The correction writers must remain disabled throughout the DB-only phase.
