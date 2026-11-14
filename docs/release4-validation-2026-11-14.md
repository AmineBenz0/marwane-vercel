# Release 4 validation — 14 November 2026

Candidate reviewed: PR #108, commit `94db477` before the local reconciliation
fix in this checkout. The production release remains unapproved and has not
been deployed as part of this validation.

## Verified staging evidence

- The Release 4 ledger and refund migrations are present on `marwane-staging`.
  The candidate's read-only readiness SQL passed before and after the test.
- On the authenticated candidate preview, test transaction #44 recorded a
  10 MAD cash sale for ten deferred eggs. Its cancellation quote and final
  credit were 10 MAD. Before refund, the database showed one credit note, one
  payment and one active cash movement. A separate 10 MAD refund then produced
  one receipt and one refund, and equal cash inflow/outflow. The detail page
  showed zero net sale and zero outstanding balance. The monthly report showed
  the adjustment and refund. A 390-pixel mobile view showed the closed sale
  and credit details; it was a visual/read-only check, not full mobile E2E.
- Read-only security checks found RLS enabled on public tables, no direct
  PUBLIC/anon/authenticated table grants, no public security-definer functions,
  and no forbidden delete/truncate runtime grants on checked ledgers. The
  policy-less migration-map table had no non-owner access in the checks.
  This does not replace the skipped live database-security CI job.
- The 8,200 MAD apparent cash discrepancy consists of two legacy non-cash LC
  cessions. Snapshot creation excludes these, but the integrity checker did
  not. A local fix aligns the checker with snapshot creation and recognises
  cession links as sources; it requires CI on the updated candidate.
- A demo bank account has a stored 30,250 MAD balance and 5,250 MAD of active
  movements, with no recorded opening entry. The 25,000 MAD difference is not
  resolved; do not invent an opening movement without provenance.
- On the first transaction detail load, two requests returned 503 after their
  database SSL connections closed unexpectedly. Later reads succeeded. The
  underlying cause remains unverified; monitor and investigate recurrence.

## Remaining production gates

- Run all applicable checks on the new candidate including the local fix;
  PR #108 CI results for `94db477` do not cover that fix. The authenticated
  E2E and live database-security jobs were skipped on that run.
- The user confirmed that `comptabilite-db` is the intended production
  database; it returned zero transactions and payments during inspection.
  Verify that the production deployment's configured connection targets this
  project before cutover.
- Apply the two reviewed Release 4 database migrations only during the approved
  production cutover, then run production readiness and security checks.
- Complete the remaining real-environment test cases, financial reconciliation,
  and release/rollback review. The user waived the backup drill.

