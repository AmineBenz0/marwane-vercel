"""Introduce shared arrival lots without changing production history."""
from pathlib import Path
import re

from alembic import op

revision = "shared_production_lots"
down_revision = "lc_usage_reuse"
branch_labels = None
depends_on = None


def upgrade():
    # Keep both supported migration paths identical, including replay/backfill.
    path = Path(__file__).resolve().parents[3] / "supabase_migrations/0005_shared_production_lots.sql"
    sql = re.sub(r"(?m)^(BEGIN|COMMIT);\s*$", "", path.read_text(encoding="utf-8"))
    op.execute(sql)


def downgrade():
    # Compatibility snapshots retain per-building history after removing parents.
    op.drop_index("uq_cycle_lot_batiment", table_name="cycles_production")
    op.drop_index("ix_cycles_production_id_lot", table_name="cycles_production")
    op.drop_constraint("fk_cycles_production_lot", "cycles_production", type_="foreignkey")
    op.drop_column("cycles_production", "id_lot")
    op.drop_table("lots_production")
