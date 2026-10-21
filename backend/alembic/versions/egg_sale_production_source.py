"""Link egg sales to their daily production without rewriting historical sales."""
from alembic import op
import sqlalchemy as sa

revision = "egg_sale_production_source"
down_revision = "independent_lots_per_building"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("transactions", sa.Column("id_production", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_transaction_production", "transactions", "productions",
                          ["id_production"], ["id_production"], ondelete="RESTRICT")
    op.create_index("ix_transactions_id_production", "transactions", ["id_production"])


def downgrade():
    op.drop_index("ix_transactions_id_production", table_name="transactions")
    op.drop_constraint("fk_transaction_production", "transactions", type_="foreignkey")
    op.drop_column("transactions", "id_production")
