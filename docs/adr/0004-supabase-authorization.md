## ADR 0004: Supabase authorization boundary

Status: Accepted

The application remains single-tenant for this release. Supabase public tables
are protected by RLS and deny-by-default grants; anonymous and direct
`authenticated` Supabase REST access are revoked because the browser talks to
the FastAPI application, not directly to Supabase. The application database
credential is server-side only, and migration credentials are separate from the
runtime credential.

The Alembic environment accepts `MIGRATION_DATABASE_URL` and falls back to
`DATABASE_URL` only for local development. The Vercel runtime does not require
or receive the migration-only credential. Production migration jobs must
provide the dedicated `app_migrator` role and use the separate `app_runtime`
role for the API. The security
migration discovers all public tables (excluding Alembic bookkeeping),
enables RLS, revokes public/anonymous/authenticated table grants, and grants
access only to the dedicated server-side application role. The read-only
`backend/scripts/check_database_security.py` command inventories tables,
views, roles, grants, and active connections for the release record.

If multi-tenancy is introduced, `organization_id` must be added to the schema
and every policy before tenant-aware access is enabled. Direct Supabase REST
access must then be introduced through explicit, least-privilege policies;
this release does not rely on a blanket authenticated read policy.
