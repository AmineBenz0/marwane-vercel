# Phase 6E acceptance register — 5 November 2026

## Decision

- **Staging engineering scope: conditionally accepted to continue development.**
- **Production release: NO-GO.** No merge/promotion, owner signoff, or real-data
  mutation is authorized by this record.
- **Phase completion: not closed.** This covers only 6E-A restoration and
  6E-B ordinary service/general-inventory conversion; egg-source/deferred-sale
  conversion remains intentionally blocked.

## Verified evidence

- Native PostgreSQL migration replay and database integrity checks passed;
  CI run 42122977131 confirms **12/12 Phase 6E API/financial tests passed**
  against a freshly migrated PostgreSQL database (conversion 10, restoration 2).
- Phase 6E conversion tests check read-only preview, source/replacement linkage,
  exact-operation replay, stale dependency rejection, payment void and rollback
  after forced failure, dated inventory nonnegative balance, active credit-link
  blocking and legacy edit rejection.
- Transaction detail API now returns both original and replacement links.
  Earlier link omission was fixed; UI egg product exclusion now handles
  accented spelling using the shared category parser.
- 326 frontend unit tests and 16 contact/flock Playwright browser tests
  passed in CI run 42120920258. Backend full CI on prior commit reported
  717 passing tests and six failures in legacy LC/instrument workflows.
- Vercel staging preview for commit
  9783af883b363815d2431d5060354017cb540f9e was READY.
- Read-only staging database evidence: zero conversion operations among
  existing transactions; no synthetic write was executed against live staging.

## Outstanding conditions before production

1. Six LC/instrument regressions remain unresolved. Their historical tests
   mix receipt with outgoing utilisation and some lack documented LC origin
   or receipt date. Review actual lifecycle writers and tests together;
   never weaken provenance validation to obtain a green test suite.
2. The npm security gate reports one high-severity follow-redirects advisory,
   plus moderate advisories. Upgrade reviewed dependencies and lockfile,
   rerun dependency audit, lint, build, frontend and browser tests.
3. Authenticated staging owner walkthrough and full end-to-end tests are
   pending; the dedicated E2E CI job was skipped by configuration.
4. Native concurrency/parallel commit tests and recovery validation for 6E,
   especially stock-racing operations, should be completed before release.
5. Deferred-sale/egg-source conversion remains separate future domain work.

## Scope protection

No production changes. Previously canceled payments stay canceled on
restoration; conversion never carries old money into the new opposite-side
transaction. History and reversal records are retained. No optional
comment/reason field or user-facing verification tag was introduced.
