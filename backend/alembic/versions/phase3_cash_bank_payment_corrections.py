"""Extend audited payment corrections to bank routing."""
from pathlib import Path

from alembic import op

revision = "phase3_cash_bank_payment_corrections"
down_revision = "audited_payment_corrections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    source = Path(__file__).resolve().parents[2] / "migrations" / "20261029210000_phase3_cash_bank_payment_corrections.sql"
    op.get_bind().exec_driver_sql(source.read_text())


def downgrade() -> None:
    raise RuntimeError("Payment correction trigger changes require a forward-only rollback")
