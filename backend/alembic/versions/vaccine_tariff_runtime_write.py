"""Allow the application to update future vaccine catalogue prices.

Revision ID: vaccine_tariff_runtime_write
Revises: daily_vaccine_expenses
"""
from alembic import op


revision: str = "vaccine_tariff_runtime_write"
down_revision: str = "daily_vaccine_expenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("GRANT UPDATE (prix_defaut) ON public.vaccins TO app_runtime")
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'vaccins'
                  AND policyname = 'app_runtime_update_vaccine_price'
            ) THEN
                CREATE POLICY app_runtime_update_vaccine_price
                    ON public.vaccins FOR UPDATE TO app_runtime
                    USING (true) WITH CHECK (true);
            END IF;
        END
        $$
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS app_runtime_update_vaccine_price ON public.vaccins")
    op.execute("REVOKE UPDATE (prix_defaut) ON public.vaccins FROM app_runtime")
