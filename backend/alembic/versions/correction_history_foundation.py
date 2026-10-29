"""Merge existing heads and install the additive correction-history foundation."""
from pathlib import Path
from alembic import op

revision = "correction_history_foundation"
down_revision = ("8e31a62c90bf", "caisse_cession_trace", "daily_vaccine_expenses")
branch_labels = None
depends_on = None


def upgrade() -> None:
    source = Path(__file__).resolve().parents[2] / "migrations" / "correction_history_foundation.sql"
    op.get_bind().exec_driver_sql(source.read_text())


def downgrade() -> None:
    raise RuntimeError("Correction history is retained. Roll back application code, not audit data.")
