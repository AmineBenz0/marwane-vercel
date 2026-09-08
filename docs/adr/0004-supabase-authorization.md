## ADR 0004: Supabase authorization boundary

Status: Accepted

The application remains single-tenant for this release. Supabase public tables
are protected by RLS and authenticated read policies; anonymous access is
revoked unless an endpoint is intentionally public. The application database
credential is server-side only, and migration credentials are separate from the
runtime credential.

The Alembic environment accepts `MIGRATION_DATABASE_URL` and falls back to
`DATABASE_URL` only for local development. Production releases must provide a
dedicated migration role and keep the runtime role separate. The security
migration discovers all public tables (excluding Alembic bookkeeping),
enables RLS, revokes public/anonymous table grants, and grants only the
authenticated Supabase role baseline read privileges; writes remain behind the
server-side application role. The read-only
`backend/scripts/check_database_security.py` command inventories tables,
views, roles, grants, and active connections for the release record.

If multi-tenancy is introduced, `organization_id` must be added to the schema
and every policy before tenant-aware access is enabled. A blanket authenticated
read policy is therefore a deliberate single-tenant boundary, not a future tenant
isolation mechanism.
