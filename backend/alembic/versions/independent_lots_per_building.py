"""Enforce one independent parent lot per building cycle."""
from pathlib import Path
import re

from alembic import op


revision = "independent_lots_per_building"
down_revision = "shared_production_lots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep the managed SQL migration and Alembic migration paths identical.
    path = Path(__file__).resolve().parents[3] / "supabase_migrations/0006_independent_lots_per_building.sql"
    sql = re.sub(r"(?m)^(BEGIN|COMMIT);\s*$", "", path.read_text(encoding="utf-8"))
    op.execute(sql)


def downgrade() -> None:
    raise RuntimeError(
        "This migration is not safely reversible. Restore a reviewed backup instead."
    )
