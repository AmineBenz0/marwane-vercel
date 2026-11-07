"""Pin the search path on independent-lot trigger functions.

The functions are SECURITY INVOKER and reference public relations explicitly.
This is metadata-only hardening; no record, lot, or trigger rewrite.
"""
from pathlib import Path
from alembic import op

revision = "phase8_lot_function_search_path"
down_revision = "lc_lifecycle_runtime_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    file = Path(__file__).resolve().parents[2] / "migrations" / "phase8_lot_function_search_path.sql"
    op.get_bind().exec_driver_sql(file.read_text(encoding="utf-8"))


def downgrade() -> None:
    raise RuntimeError("Do not re-enable a caller-controlled function search_path.")
