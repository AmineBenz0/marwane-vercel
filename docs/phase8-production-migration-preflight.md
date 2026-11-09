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

## Fresh no-go inspection — 9 November 2026 (read-only)

This is a **new inventory**, not proof of backup or recovery. It supersedes
the 7 November *data counts*, not the safety requirements above.

### Connected environment identification

- Supabase project `pudpijigevertmjmbtmc`, named `comptabilite-db`,
  is the **candidate production database**; Supabase reports
  `ACTIVE_HEALTHY`, Postgres 17.6, region `eu-west-3`.
- Supabase project `aqosvbpcxfpntcejebma`, named `marwane-staging`,
  is the **staging database**; Supabase reports `ACTIVE_HEALTHY`,
  Postgres 17.11, region `eu-west-3`.
- The Vercel production project's `DB_SUPABASE_URL`,
  `DB_POSTGRES_HOST` and `DB_POSTGRES_URL_NON_POOLING` references point
  to the candidate project, not staging. **The actual production
  `DATABASE_URL` remains sensitive/redacted**: its runtime binding and
  migration credential must still be independently validated before DDL.
  No credentials or secret values were copied into this report.
- Supabase organization `airzet's projects` is on **Free**. The Supabase
  backup documentation states scheduled daily backups are provided for
  Pro/Team/Enterprise and explicitly recommends an off-site
  `supabase db dump` on Free. No automatic backup or PITR point
  has been verified. Neither connected project currently has a
  Supabase development branch.

### Fresh baseline

| Quantity | Candidate production | Staging |
| --- | ---: | ---: |
| Public tables | 31 | 37 |
| Enabled custom triggers | 16 | 40 |
| Public indexes | 127 | 219 |
| Supabase migration entries | 10 | 25 |
| Transactions (active) | 0 (0) | 30 (17) |
| Payments | 0 | 36 |
| Production records | 14 | 21 |
| Production records without cycle | **0** | 3 |
| Cycles | **3** | 6 |
| Lots | **3** | 6 |

The older 7 November baseline identified 14 production records with
no cycle or lot. **This has changed in the candidate production database**.
A new reconciliation must preserve today's 14 production records and their
now-existing 3 cycles and 3 lots, and check both source attribution and
lot/cycle continuity. Do not overwrite with the earlier source assumptions.
The staging transaction/payment rows are acceptance fixtures and **must not**
be imported into production.

Public tables still missing from candidate production:
`affectations_credit`, `alembic_version`, `avances`,
`correction_operations`, `entity_revisions`,
`utilisations_lettre_credit`. Targeted column checks also show
missing `transactions.row_version`, `transactions.stock_revision`,
`transactions.quantite_annulee`, `paiements.row_version`,
`paiements.nature`, `paiements.id_affectation`,
`paiements.role_lc`, `productions.reforme` and three LC lifecycle
columns; these are **not** a complete schema diff. Differences in
Supabase migration history also include renamed or alternative stock
migration scripts, so migration ID comparison is insufficient to
identify which database effects are already applied.

### Security advisories, read-only

Production Supabase advisors still flag mutable `search_path` on
`guard_independent_cycle_snapshot`,
`sync_independent_lot_to_cycle` and
`assert_independent_lot_has_cycle`; staging's corresponding
hardening was already applied. Production also reports two
`extension_in_public` warnings (`pg_trgm`, `unaccent`), one
policyless internal RLS table notice, and a disabled leaked-password
protection warning. The extension warnings need impact analysis,
not automatic relocation. Source:
https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

### Concrete backup and isolated rehearsal plan

1. Establish a production-safe maintenance or consistent-snapshot procedure.
   On an approved operator workstation with Docker and Supabase CLI,
   supply the database connection URL from a secure credential store,
   not source code, shell history, GitHub comments or this document.
   The Supabase docs describe three exports:
   `supabase db dump --db-url "$SOURCE_DATABASE_URL" -f roles.sql --role-only`;
   `supabase db dump --db-url "$SOURCE_DATABASE_URL" -f schema.sql`;
   `supabase db dump --db-url "$SOURCE_DATABASE_URL" -f data.sql --use-copy --data-only`.
   Sequential exports are not inherently one transactionally consistent
   snapshot if concurrent writes occur. Coordinate quiescence or verify
   a snapshot method, and encrypt/store off-site with restricted access.
2. Provision an **isolated** PostgreSQL restore target under explicit
   cost/ownership approval (or local Docker, if available). Neither
   staging nor production is a disposable clone. Record the exact
   restore command, source snapshot/UTC timestamp, restore completion,
   integrity checks and RPO/RTO. Do not execute correction tests against
   live production or the shared staging database.
3. Match the restored baseline above. Inventory current table and
   column definitions, grants/RLS, enabled triggers, indexes, foreign-key
   integrity, and both Supabase and Alembic migration history. Verify
   runtime role and `DATABASE_URL` target without exposing credentials.
4. Review *exact* migration effects and apply to the **clone only** in
   dependency order, with an explicit compatible app version:
   `deferred_sale_remainder` prerequisites; then
   `correction_history_foundation`, audited payment guards,
   bank/cash correction guards, `stock_correction_revisions`,
   refunds, party credit/advances, cheque/instrument correction,
   LC lifecycle/access and independent-lot search-path hardening as
   applicable. Do not replay a renamed or previously-effective
   migration merely because its version name differs.
5. Verify baseline revision snapshots for transactions and payments,
   actor and operation IDs, stale-revision rejection, append-only
   protection, stock FIFO and deferred commitments, bank/cash and LC
   reconciliation, and restart/retry/idempotency behavior. Test
   authenticated read-only and disposable mutating E2E, including
   a repeatable failing-transaction rollback.
6. **Only if** a verified backup and restore, security checks, migration
   rehearsal, and owner GO exist may a separately approved production
   window apply DDL and promote a matching tested build. Never
   `alembic upgrade heads` against the live database as the first test.

Supabase references:
https://supabase.com/docs/guides/platform/backups
and https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore.

**Decision on 9 November: PRODUCTION NO-GO for advanced corrections.**
No live SQL writes, migration applications, backup restores or billable
branches were executed during this inspection. The last live application
release remains #101, which is a UI review step rather than the advanced
correction writer.
