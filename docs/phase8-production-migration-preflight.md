# Phase 8 — Production migration rehearsal / no-go preflight

Status: **not approved for production deployment**, 7 November 2026.
This is a non-destructive release plan and database inventory, **not**
evidence that the production migration or restore has been rehearsed.

## Identity and trust boundary (must be completed before production change)

The Supabase project named `comptabilite-db` was inventoried as the
**candidate production database**. The Vercel project's production
`DATABASE_URL` is stored as a sensitive setting, so its actual host/project
reference could not be independently verified through the available
redacted environment metadata. Verify the bound project reference using
the approved runtime/migration preflight **without printing credentials**.
Abort if the bound database is not the expected production project.

Do not point release validation at staging merely to get a passing result.

## Baseline, read-only, at inspection

| Item | Candidate production | Staging |
| --- | ---: | ---: |
| Public tables | 31 | 37 |
| Custom enabled triggers | 16 | 40 |
| Public indexes | 127 | 219 |
| Recorded Supabase migrations | 9 | 23 |
| Transactions | 0 | 30 |
| Production rows | 14 | 21 |
| Buildings | 3 | not included in this comparison |
| Lots | 0 | 6 |
| Cycles | 0 | 6 |

All 14 candidate-production production rows are active, dated 1–3 October
2026, have **no cycle assigned**, and have a valid building. Preserve them;
do not invent a parent lot/cycle or automatically reassign source provenance.
A restore rehearsal must demonstrate that these legacy production rows
survive and remain visible without invalid manufactured allocations.

Schema inventory identifies six stage-only tables:
`affectations_credit`, `alembic_version`, `avances`,
`correction_operations`, `entity_revisions`, and
`utilisations_lettre_credit`. There are **13 stage-only columns on shared
tables**, including `transactions.row_version`, `stock_revision`,
`paiements.row_version`, and LC lifecycle fields. A name-only comparison
shows 24 stage trigger identities absent in production and 105 stage
index identities absent in production. These names/counts are a planning
inventory, **not** an instruction to create 105 indexes blindly.

Staging contains synthetic acceptance data and is **not** a source for copying
business records into production. Record a fresh production baseline at
deployment time.

## The only safe sequence

1. **Confirm environment identity** for the actual production deployment and
   migration role. Confirm preview and production are separate.
2. **Backup evidence:** record latest successful backup/PITR point, retention,
   verified recovery permissions, recovery operator, and actual restore target.
   Never treat the existence of a runbook as proof of restorable backups.
3. **Disposable rehearsal:** use an approved restore/clone of production,
   not the live database, and capture record counts, source integrity,
   constraints, financial ledgers, RLS/grants, and schema revisions before
   migration. In this project, no such clone existed at the audit time.
4. **Reconcile migration tracking:** production has Supabase migration entries
   but no `alembic_version` public table in the read-only inventory. Some
   migration names differ despite potentially equivalent effects. Validate
   every already-applied effect before initializing Alembic or choosing
   which additive SQL files to execute. **Do not run
   `alembic upgrade heads` directly against live production.**
5. **Ordered additive upgrades on clone:** validate deferred-sale remainder,
   source quantities and index/trigger prerequisites, then apply the missing
   correction-history foundation, audited payment revisions, bank routing,
   stock revisions, refunds, advances/credit allocation, cheque and LC
   corrections, LC usage lifecycle/access, and independent-lot search-path
   hardening **only after reviewing their exact preconditions**. This list
   is a dependency outline, not a ready-to-execute command sequence.
6. **Check each migration:** verify installation and no conflicting triggers,
   unknown legacy allocations, incorrect role grants, or broken snapshots.
   Use `scripts/check_database_schema.py`, the integrity/baseline checks,
   database security inventory and the PostgreSQL concurrency suites.
7. **Rehearse compatible app + migration-first deployment:** run read-only
   and authenticated smoke flows against the isolated clone, including
   client/supplier settlement, outstanding credit, LC, stock and exports.
   Verify exact prior source rows and monetary totals are still present.
8. **Forward recovery:** document how to revert to an app version compatible
   with additive schema and perform audited correction-forward fixes.
   Never drop revision history or financial rows as rollback.
9. **Explicit owner GO** after complete G2–G7 evidence. During the real
   window: backup preflight → approved schema changes → schema/security
   preflight → Vercel promotion → authenticated smoke → reconciliation →
   monitoring. Halt on any mismatch; never silently retry a failed
   financial migration.

## Release gating checklist

- [ ] Confirm actual Vercel production DB target and migration credential
- [ ] Verify backup/PITR retention and successful timestamp
- [ ] Complete isolated restore drill with measured RPO/RTO
- [ ] Reconcile Alembic/Supabase migration history on the clone
- [ ] Preserve 14 historical unlinked production rows on the clone
- [ ] Complete G2 authenticated read-only browser test (GitHub secrets)
- [ ] Complete G3 isolated mutating workflow test
- [ ] Complete G4 stock, cheque, LC, idempotency and rollback concurrency
- [ ] Review G5 security advisories, runtime permissions and dependencies
- [ ] Complete post-migration baseline, health and export reconciliation
- [ ] Obtain explicit production deployment approval

## What is permitted now

Continue disposable PostgreSQL testing, public-code changes on
`staging`, and read-only database inventories. No production SQL writes,
no restore into a live environment, no credential logging, no purchase of a
billable Supabase branch without a quoted cost and user approval.
