# Release 1 — rollback and integrity verification (operational runbook)

**Scope:** code-only guarded correction API; the `production_correction_history_foundation`
migration is already installed. Do **not** revert that shared migration or delete
append-only history as part of this release rollback.

## Pre-deployment gate

- Record the exact intended production Git SHA and prior READY Vercel deployment.
- Verify and document a tested database restore point (provider-native backup
  or independently validated export) and recovery ownership. If unavailable,
  **NO-GO** for a writer deployment. Previous approval to run the additive
  foundation without a backup is not approval for financial writes.
- Run all CI jobs, especially `release1-correction-validation`, and run an
  authenticated browser test on isolated data.
- Reconcile source data counts, cash/bank balances and revision IDs before
  promoting the deployment. New correction writers must not change stock or
  cash/bank for any supported command.

## Immediate response if a production correction fails

1. Stop submitting new corrections through the UI; preserve the error's
   request ID, operation UUID and affected transaction ID (avoid copying any
   credential or customer-private data into logs).
2. Inspect Vercel error logs and read-only audit/operation rows. Determine
   whether a transaction committed or rolled back; a network timeout alone
   does not prove rollback. Identical operation UUID retries are idempotent.
3. If necessary, roll the Vercel application back to the recorded previous
   READY production deployment. This disables the new API and restores the
   old editing flow; it must **not** delete audit data, revisions or row-version
   columns.
4. Reconcile the affected record, grouped operation and current revision:
   last revision snapshot should equal the current persisted record. Confirm
   unchanged stock, cash, banking and payment totals.
5. If a correction was committed but business data is incorrect, use an
   explicitly reviewed follow-up correction or restore procedure. Never
   rewrite immutable historical records to hide the event.

## Read-only SQL reconciliation after release

Execute in the **verified production** Supabase project only:

```sql
SELECT
  (SELECT count(*) FROM public.transactions) AS transactions,
  (SELECT count(*) FROM public.paiements) AS paiements,
  (SELECT count(*) FROM public.caisse) AS caisse,
  (SELECT count(*) FROM public.mouvements_bancaires) AS banque,
  (SELECT count(*) FROM public.correction_operations) AS operations,
  (SELECT count(*) FROM public.entity_revisions) AS revisions;

SELECT r.entity_type, r.entity_id, max(r.revision) AS latest_history,
       CASE WHEN r.entity_type = 'transaction' THEN
         (SELECT t.row_version FROM public.transactions t WHERE t.id_transaction = r.entity_id)
       ELSE
         (SELECT p.row_version FROM public.paiements p WHERE p.id_paiement = r.entity_id)
       END AS current_version
FROM public.entity_revisions r
GROUP BY r.entity_type, r.entity_id
HAVING max(r.revision) IS DISTINCT FROM
       CASE WHEN r.entity_type = 'transaction' THEN
         (SELECT t.row_version FROM public.transactions t WHERE t.id_transaction = r.entity_id)
       ELSE
         (SELECT p.row_version FROM public.paiements p WHERE p.id_paiement = r.entity_id)
       END;

SELECT op.operation_id
FROM public.correction_operations op
WHERE NOT EXISTS (
  SELECT 1 FROM public.entity_revisions r WHERE r.operation_id = op.operation_id
);
```

The second and third queries should normally return no rows for committed
non-no-op correction operations. Alert on anomalies; do not automatically
repair them. Also compare baseline dashboard, monthly report, stock and
cash/bank figures captured before deployment.

## Roll-forward versus rollback decision

A rollback is a *code rollback*, not a database rollback, because old production
already supports `row_version` and the immutable history foundation. Restarting
the old application should preserve data. Any correction that did commit remains
as part of its legitimate immutable audit trail.

This plan requires a rehearsal before promotion; writing this file alone does
not satisfy the recovery gate.
