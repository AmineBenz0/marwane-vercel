"""Extend audited payment corrections to bank routing."""
from pathlib import Path

from alembic import op

revision = "phase3_cash_bank_payment_corrections"
down_revision = "audited_payment_corrections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    source = Path(__file__).resolve().parents[2] / "migrations" / "20261029210000_phase3_cash_bank_payment_corrections.sql"
    # A PL/pgSQL RAISE string contains a literal %. Escape it for psycopg2.
    bind = op.get_bind()
    sql = source.read_text()
    if bind.dialect.paramstyle in {"format", "pyformat"}:
        sql = sql.replace("%", "%%")
    bind.exec_driver_sql(sql)


def downgrade() -> None:
    raise RuntimeError("Payment correction trigger changes require a forward-only rollback")
