"""Split shared parents into one building lot while retaining migration evidence."""
from pathlib import Path
import re

from alembic import op


revision = "independent_lots_per_building"
down_revision = "shared_production_lots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    path = Path(__file__).resolve().parents[3] / "supabase_migrations/0006_independent_lots_per_building.sql"
    sql = re.sub(r"(?m)^(BEGIN|COMMIT);\s*$", "", path.read_text(encoding="utf-8"))
    op.execute(sql)


def downgrade() -> None:
    raise RuntimeError(
        "Independent-lot migration preserves historical IDs and audit mappings; "
        "restore a reviewed backup instead of downgrading."
    )

