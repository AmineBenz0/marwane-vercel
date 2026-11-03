"""Grant the runtime scoped access to LC usage history."""
from pathlib import Path

from alembic import op

revision = "lc_lifecycle_runtime_access"
down_revision = "lc_lifecycle_model"
branch_labels = None
depends_on = None


def upgrade():
    source = Path(__file__).resolve().parents[2] / "migrations" / "lc_lifecycle_runtime_access.sql"
    op.get_bind().exec_driver_sql(source.read_text())


def downgrade():
    raise RuntimeError("LC usage history access is part of the retained lifecycle model.")
