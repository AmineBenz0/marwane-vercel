# Production correction foundation — controlled first database step

This script contains the **tested staging correction history foundation** with
a production-only precondition guard. It has not been written to production by
the commit itself; execute it only through a versioned Supabase migration
against confirmed project `pudpijigevertmjmbtmc`.

The guard aborts if financial rows appeared since the verified baseline,
required schema objects are missing, or the foundation is partly present.
The original stage SQL installs append-only revision history, `row_version`
columns, triggers, RLS/grants, and a `security_invoker` cash view.

**Scope:** transaction/payment metadata only. It does not release the audited
correction API, refunds, credits, advance payments, cheque/LC changes, or
stock correction migrations. It should not rewrite the 14 existing production
records, 3 lots, or 3 cycles.

**Warning:** the owner requested proceeding without backup. This means no
verified restore point exists; schema rollback can be more complicated than
rolling back the application. Before executing, verify the exact target,
transactional DDL, roles/permissions, and migration script content; do not
repeat if partially applied. Use read-only checks after application to verify
tables, revision columns, triggers, views, RLS and financial/production counts.

This must not be confused with Phase 8 approval for the full correction engine.
