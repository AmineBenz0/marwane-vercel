"""Allow tasks without a planned date."""

import sqlalchemy as sa
from alembic import op

revision = "optional_task_date"
down_revision = "phase8_lot_function_search_path"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("taches", "date_debut", existing_type=sa.DateTime(timezone=True), nullable=True)


def downgrade() -> None:
    op.alter_column("taches", "date_debut", existing_type=sa.DateTime(timezone=True), nullable=False)
