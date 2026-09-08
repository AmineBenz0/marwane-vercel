"""Persist outcomes for scheduled job invocations."""

from alembic import op
import sqlalchemy as sa


revision = "job_execution_audit"
down_revision = "append_only_runtime_grants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_executions",
        sa.Column("id_execution", sa.Integer(), primary_key=True),
        sa.Column("job_name", sa.String(length=100), nullable=False),
        sa.Column("statut", sa.String(length=20), nullable=False, server_default="running"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failure_type", sa.String(length=100), nullable=True),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "statut IN ('running', 'succeeded', 'failed')",
            name="check_job_execution_status",
        ),
        sa.CheckConstraint("created_count >= 0", name="check_job_execution_count"),
    )
    op.create_index("ix_job_executions_job_name", "job_executions", ["job_name"], unique=False)
    op.create_index("ix_job_executions_statut", "job_executions", ["statut"], unique=False)
    op.execute(
        """
        DO $$
        BEGIN
            ALTER TABLE public.job_executions ENABLE ROW LEVEL SECURITY;
            REVOKE ALL ON TABLE public.job_executions FROM PUBLIC;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL ON TABLE public.job_executions FROM anon;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL ON TABLE public.job_executions FROM authenticated;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
                GRANT SELECT, INSERT, UPDATE ON TABLE public.job_executions TO app_runtime;
                CREATE POLICY app_runtime_access ON public.job_executions
                    FOR ALL TO app_runtime USING (true) WITH CHECK (true);
                GRANT USAGE, SELECT ON SEQUENCE public.job_executions_id_execution_seq TO app_runtime;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS app_runtime_access ON public.job_executions")
    op.drop_index("ix_job_executions_statut", table_name="job_executions")
    op.drop_index("ix_job_executions_job_name", table_name="job_executions")
    op.drop_table("job_executions")
