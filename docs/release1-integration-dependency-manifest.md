# Release 1 — Integrated correction dependency manifest

Status: **DRAFT / NO-GO for production**. This manifest maps the already tested
staging correction feature onto the current production baseline. It is not a
migration authorization or a claim of staging/production parity.

## Baselines and limits

- Production `main` reviewed at `42af9bc4cad24b5d7feb6bc6250b4f9a5f10ae1f`.
- `staging` is **250 commits ahead / 27 behind** `main`; no branch-wide merge.
- The correction-history foundation is already installed in production:
  `transactions.row_version`, `paiements.row_version`,
  `correction_operations`, `entity_revisions`, and the audit triggers.
  **Do not replay** `correction_history_foundation.sql` or install duplicate
  revision-capture triggers.
- This PR currently contains a narrow correction writer created from
  production code. It must **not** be represented as the complete staging
  correction engine. The goal is to replace it with compatible, tested staging
  components and remove duplicated behavior before declaring Release 1 ready.

## Functional dependency groups

| Group | Source from staging | Production prerequisites | Release decision |
|---|---|---|---|
| Shared preview/apply, locking, history | `app/services/correction_commands.py`, `correction_contract.py`, `correction_history.py`, `app/routers/corrections.py`, `app/schemas/correction.py` | Foundation already applied; reconcile differences to newer production routes | **Include** |
| Transaction corrections | Same command; `app/models/transaction.py` | Maintain paid-transaction protections; preserve current sale source and deferred booking rules | **Include supported stage cases** |
| Payment cash/bank corrections | `app/services/financial_ledger.py`, `cheque_corrections.py`; correction command | `audited_payment_corrections.sql`, `20261029210000_phase3_cash_bank_payment_corrections.sql`, movement audit/role grants; production ledger contract | **Include ordinary cash/bank only, behind guard** |
| Stock and egg source corrections | `app/services/stock_corrections.py`, `inventory.py`, `egg_sales.py`, `app/models/transaction.py`, `egg_allocation.py` | `stock_correction_revisions.sql` and deferred remainder allocation schema + correct historical delivered-quantity backfill | **Include with stock/reconciliation adapter** |
| Settlement representation | Staging payment `nature`, `montant_net`, `est_affectation`, `ledger_direction` | Production payment table lacks `nature`; staged command references those fields even for ordinary payment operations | **Compatibility contract required; do not silently enable refunds/credits** |
| Cheques and LC | `cheque_corrections.py`, `lc_corrections.py`, `instrument_corrections.sql`, `lc_lifecycle.sql` | LC usage table, cheque/LC protections, refund and credit constraints | **Exclude advanced operations; explicitly reject until their release** |
| Refunds and advances | `refunds.py`, `credits.py`, `explicit_transaction_refunds.sql`, `party_advances_credit_allocation.sql` | `paiements.nature`, `id_affectation`, `avances`, `affectations_credit` | **Not enabled by Release 1** |
| Deferred delivery lifecycle | `8e31a62c90bf_deferred_sale_remainder.py`, deferred sale source helpers | `egg_sale_allocations.quantite_livree` and `transactions.quantite_annulee` are required for stock-correction correctness | **Include schema/compatibility only; lifecycle UI remains later** |

### Critical schema facts (verified read-only on 10 November 2026)

- **Present in production:** `row_version` on transactions/payments,
  history tables and audit infrastructure.
- **Absent from production, present in staging:** `transactions.stock_revision`,
  `transactions.quantite_annulee`,
  `egg_sale_allocations.quantite_livree`,
  `paiements.nature`, `paiements.id_affectation`, `paiements.role_lc`,
  `avances`, `affectations_credit`, `utilisations_lettre_credit`.
- The deferred-delivery schema backfills **existing** allocations as delivered:
  `UPDATE egg_sale_allocations SET quantite_livree = quantite` when first
  introducing the column. Do **not** replace that migration with a naive
  `DEFAULT 0` for historical allocation rows.
- Staging uses Alembic and separately recorded Supabase migrations; production
  does not have an equivalent applied Alembic chain. Reconcile migration
  *effects* in a disposable clone; never `alembic upgrade heads` on production.

## Files that must be considered together

Staging services:
- `backend/app/services/correction_commands.py` — full engine (not partial rewrite)
- `backend/app/services/correction_contract.py` — already ported
- `backend/app/services/correction_history.py` — already ported
- `backend/app/services/stock_corrections.py` — stock and allocation adapter
- `backend/app/services/cheque_corrections.py` — instrument eligibility guard
- `backend/app/services/financial_ledger.py` — append-only ledger movement synchronization
- `backend/app/services/inventory.py`, `egg_sales.py` — stock calculation and source parity

Shared models and schemas:
- `backend/app/models/transaction.py`, `paiement.py`,
  `egg_allocation.py`, `financial_correction.py`
- `backend/app/schemas/correction.py`
- `backend/app/routers/corrections.py`

Database candidates, **not** an execute-as-written migration sequence:
- Already applied: `production_correction_history_foundation.sql`
- New audited payment guard: `audited_payment_corrections.sql`
- Cash/bank payment correction guard:
  `20261029210000_phase3_cash_bank_payment_corrections.sql`
- Stock revision: `stock_correction_revisions.sql`
- Delivered/remaining egg schema and historically correct backfill:
  `8e31a62c90bf_deferred_sale_remainder.py`
- Payment settlement compatibility (`nature`) requires an explicitly reviewed,
  narrow migration or an approved staged settlement migration; **do not assume**
  the refund/credit constraints can be imported without their tables.

## Required acceptance evidence

1. Compare code and **exact** migration guards against the production baseline,
   including existing payment and inventory protections. Preserve all newer
   production-side corrections, not just staging code.
2. Apply the candidate migration chain to an **isolated PostgreSQL clone**, and
   verify row counts, account balances, stock quantities, active reservations,
   original delivered allocations, RLS/grants and no double triggers.
3. Port stage regression suites `test_correction_contract.py`,
   `test_stock_corrections.py`, `test_correction_history.py` and the
   payment/ledger tests. Verify stale preview, retries, races, failed-write
   rollback, cash-to-bank-to-cash, multi-source eggs and paid/refund constraints.
4. Verify the newer production transaction form, payments, deferred-sale
   screens and export paths with the exact integrated backend. Keep one
   review/confirmation workflow, using existing French labels and design.
5. Pass CI and authenticated UI acceptance. Existing skipped E2E and
   database-security jobs are **not passes**.
6. Document a **verified** recovery point and restore rehearsal for financial
   writes, verify the production DB target, then seek explicit approval for the
   exact deployment and migrations.
7. Promote database changes first, then the verified app build; run read-only
   reconciliation and manual smoke tests; revert code without erasing audit
   history if a post-release gate fails.

## Exit condition

**NO-GO** while the production ORM, migrations, staged command and adapters
have unresolved schema dependencies or the preview/restore gates are open.
The current narrow writer in PR #104 is not the integrated feature.
