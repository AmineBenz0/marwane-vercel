# Phase 6E — restoration and conversion

Status: **6E-A implemented for staging review; 6E is not closed**.

## 6E-A — explicit restoration

The owner opens an inactive transaction, chooses Reactivate, and reviews the
concrete stock entry/exit and preserved canceled-payment count before confirming.
For stock-bearing transactions, explicit stock confirmation is required. The
transaction resumes its original type and identity; canceled payment rows,
LC instruments and former cash/bank movements **never revive automatically**.
Previously canceled records retain their IDs and full history. Existing
append-only stock writers restore stock movements where applicable.

The server now offers a read-only reactivation preview and requires
`expected_version`, dependency fingerprint, `restore_stock=true` and
`restore_cancelled_payments=false` at apply. Apply validates stock/contact
sources under locks and rejects stale previews or lost allocations, without
partially restoring money or stock. A legacy egg sale without attributable
origins and a historical general-stock sale without ledger provenance are
blocked rather than assigned invented sources.

## Remaining acceptance

- Full frontend/backend tests and CI must pass, including new stale-preview,
  general-stock chronology, egg reservation and authenticated UI checks.
- Native PostgreSQL concurrency and rollback tests should cover two competing
  restores, another sale taking reserved stock, and a concurrent payment change.
- Existing Phase 6D LC lifecycle integration and migration replay regressions
  remain separate blockers; do not release this feature to production until
  those gates and owner walkthrough pass.
- **6E-B — conversion remains unimplemented.** Sale↔purchase conversion must
  be an explicit linked replacement, with separately selected financial and
  inventory effects, valid contact and lot/source constraints, immutable old
  payment/LC/cheque history, and single atomic commit. Do not simply change
  `id_client` into `id_fournisseur` on a settled transaction.
