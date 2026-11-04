"""Merge existing heads and install the additive correction-history foundation."""
from pathlib import Path
from alembic import op

revision = "correction_history_foundation"
down_revision = ("8e31a62c90bf", "caisse_cession_trace", "daily_vaccine_expenses")
branch_labels = None
depends_on = None


def upgrade() -> None:
    source = Path(__file__).resolve().parents[2] / "migrations" / "correction_history_foundation.sql"
    # psycopg2 interprets PL/pgSQL format markers like %I as DBAPI binds.
    # Escape driver-level percents, not the stored migration source itself.
    bind = op.get_bind()
    sql = source.read_text()
    if bind.dialect.paramstyle in {"format", "pyformat"}:
        sql = sql.replace("%", "%%")
    bind.exec_driver_sql(sql)


def downgrade() -> None:
    raise RuntimeError("Correction history is retained. Roll back application code, not audit data.")
