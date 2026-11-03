"""Separate LC origin, receipt and outgoing usage while retaining old ledgers."""
from pathlib import Path

from alembic import op

revision = "lc_lifecycle_model"
down_revision = "instrument_corrections"
branch_labels = None
depends_on = None


def upgrade():
    source = Path(__file__).resolve().parents[2] / "migrations" / "lc_lifecycle.sql"
    op.get_bind().exec_driver_sql(source.read_text())


def downgrade():
    raise RuntimeError("LC usage and payment history is retained; roll back application code, not lifecycle records.")
