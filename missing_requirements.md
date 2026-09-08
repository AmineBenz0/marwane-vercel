# Requirements status

This file is now a release-gap register. Historical claims that contradicted
the codebase were removed; open items are tracked as release gates below.

## Implemented in the remediation branch

- Cash/bank charge allocation with retained void history.
- Multi-payment transactions, including payment status projections.
- Explicit product types: `matiere_premiere`, `produit_fini`, `service`.
- Reusable versioned BOMs and atomic transformation execution.
- General stock movement ledger, weighted cost, stock validation, and reversal.
- Receivables and payables endpoints and UI pages.
- Persistent duplicate-safe overdue alerts and protected scheduled job.
- Unified search endpoint and backend-calculated monthly report.
- Frontend and backend dependency gates pass without high or critical
  advisories.

## Release gates still required

- Apply and validate the Alembic migrations against a staging Supabase clone.
- Review Supabase Security Advisor after RLS migration and explicitly accept no findings.
- Backfill legacy stock movements and reconcile balances before enabling strict sales stock checks globally.
- Validate real production totals against the reconciliation script.
- Complete authenticated desktop/mobile Playwright flows and payment/BOM test data.
- Only moderate transitive frontend advisories remain and are documented for a
  later compatible major upgrade.
- Complete backup restoration drill and controlled Vercel promotion.

## Explicit product decisions

- The application remains single-tenant in this release.
- Overdue notifications are in-app only.
- Financial corrections are void/reversal records, never hard deletes.
- Report totals are calculated by the backend; existing frontend Excel/PDF utilities remain the export layer.
