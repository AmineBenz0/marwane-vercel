"""Remove physical-delete privileges from the application runtime role."""

from alembic import op


revision = "append_only_runtime_grants"
down_revision = "tx_cancellation_metadata"
branch_labels = None
depends_on = None


APPEND_ONLY_TABLES = (
    "transactions",
    "paiements",
    "charges",
    "caisse",
    "mouvements_bancaires",
    "mouvements_stock",
    "corrections_financieres",
)


def upgrade() -> None:
    tables_sql = ", ".join(f"'public.{table_name}'::regclass" for table_name in APPEND_ONLY_TABLES)
    op.execute(
        f"""
        DO $$
        DECLARE table_ref regclass;
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
                FOREACH table_ref IN ARRAY ARRAY[{tables_sql}]
                LOOP
                    EXECUTE format(
                        'REVOKE DELETE, TRUNCATE ON TABLE %s FROM app_runtime',
                        table_ref
                    );
                END LOOP;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    tables_sql = ", ".join(f"'public.{table_name}'::regclass" for table_name in APPEND_ONLY_TABLES)
    op.execute(
        f"""
        DO $$
        DECLARE table_ref regclass;
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
                FOREACH table_ref IN ARRAY ARRAY[{tables_sql}]
                LOOP
                    EXECUTE format(
                        'GRANT DELETE ON TABLE %s TO app_runtime',
                        table_ref
                    );
                END LOOP;
            END IF;
        END $$;
        """
    )
