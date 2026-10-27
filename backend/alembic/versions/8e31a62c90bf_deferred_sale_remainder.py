"""Track the canceled portion of a deferred sale without changing its financial total."""
from alembic import op
import sqlalchemy as sa

revision = "8e31a62c90bf"
down_revision = "4f9c2b7a1d30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("transactions")}
    if "quantite_annulee" not in columns:
        op.add_column("transactions", sa.Column(
            "quantite_annulee", sa.Integer(), nullable=False, server_default="0"
        ))
    constraints = {constraint["name"] for constraint in inspector.get_check_constraints("transactions")}
    if "check_quantite_annulee_bounded" not in constraints:
        op.create_check_constraint(
            "check_quantite_annulee_bounded", "transactions",
            "quantite_annulee >= 0 AND quantite_annulee <= quantite",
        )
    allocation_columns = {column["name"] for column in inspector.get_columns("egg_sale_allocations")}
    if "quantite_livree" not in allocation_columns:
        op.add_column("egg_sale_allocations", sa.Column(
            "quantite_livree", sa.Integer(), nullable=False, server_default="0"
        ))
        # Before this version, an allocation meant the quantity was covered by
        # the original sale. Later reservations are created with zero delivered.
        op.execute("UPDATE egg_sale_allocations SET quantite_livree = quantite")
    allocation_constraints = {constraint["name"] for constraint in inspector.get_check_constraints("egg_sale_allocations")}
    if "egg_allocation_delivered_bounded" not in allocation_constraints:
        op.create_check_constraint(
            "egg_allocation_delivered_bounded", "egg_sale_allocations",
            "quantite_livree >= 0 AND quantite_livree <= quantite",
        )


def downgrade() -> None:
    op.drop_constraint("egg_allocation_delivered_bounded", "egg_sale_allocations", type_="check")
    op.drop_column("egg_sale_allocations", "quantite_livree")
    op.drop_constraint("check_quantite_annulee_bounded", "transactions", type_="check")
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("transactions")}
    if "quantite_annulee" in columns:
        op.drop_column("transactions", "quantite_annulee")
