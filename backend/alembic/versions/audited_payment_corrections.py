"""Allow audited payment date and amount corrections."""
from pathlib import Path
from alembic import op

revision = "audited_payment_corrections"
down_revision = "correction_history_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    source = Path(__file__).resolve().parents[2] / "migrations" / "audited_payment_corrections.sql"
    op.get_bind().exec_driver_sql(source.read_text())


def downgrade() -> None:
    raise RuntimeError("Payment correction audit guarantees are retained; roll back application code, not database guards.")
