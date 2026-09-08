"""Supabase API security baseline.

The application talks to PostgreSQL server-side. These policies protect any
tables accidentally exposed through the Supabase REST surface as well.
Tenant isolation is intentionally not asserted because this release is
single-tenant; a future organization_id migration must precede tenant RLS.
"""

from alembic import op


revision = "enterprise_security"
down_revision = "enterprise_foundation"
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Discover tables at migration time so newly introduced public tables do
    # not silently bypass the security baseline. Alembic's bookkeeping table
    # is intentionally excluded because it is not an API resource.
    op.execute("""
        DO $$
        DECLARE
            table_name text;
        BEGIN
            FOR table_name IN
                SELECT tablename
                FROM pg_catalog.pg_tables
                WHERE schemaname = 'public'
                  AND tablename <> 'alembic_version'
            LOOP
                EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
                EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM authenticated', table_name);
                    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', table_name);
                    EXECUTE format('DROP POLICY IF EXISTS app_authenticated_access ON public.%I', table_name);
                    EXECUTE format('DROP POLICY IF EXISTS app_authenticated_read ON public.%I', table_name);
                    EXECUTE format(
                        'CREATE POLICY app_authenticated_read ON public.%I FOR SELECT TO authenticated USING (true)',
                        table_name
                    );
                END IF;
            END LOOP;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('public.vue_solde_caisse') IS NOT NULL THEN
                BEGIN
                    REVOKE ALL ON TABLE public.vue_solde_caisse FROM PUBLIC;
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                        REVOKE ALL ON TABLE public.vue_solde_caisse FROM anon;
                    END IF;
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                        GRANT SELECT ON TABLE public.vue_solde_caisse TO authenticated;
                    END IF;
                    ALTER VIEW public.vue_solde_caisse SET (security_invoker = true);
                EXCEPTION WHEN undefined_object OR feature_not_supported THEN
                    NULL;
                END;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        DO $$
        DECLARE
            table_name text;
        BEGIN
            FOR table_name IN
                SELECT tablename
                FROM pg_catalog.pg_tables
                WHERE schemaname = 'public'
                  AND tablename <> 'alembic_version'
            LOOP
                EXECUTE format('DROP POLICY IF EXISTS app_authenticated_access ON public.%I', table_name);
                EXECUTE format('DROP POLICY IF EXISTS app_authenticated_read ON public.%I', table_name);
                EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', table_name);
            END LOOP;
        END $$;
    """)
