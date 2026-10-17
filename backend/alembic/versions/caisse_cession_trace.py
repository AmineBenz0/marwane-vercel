"""Track LC supplier payments in the cash movement history."""

from alembic import op
import sqlalchemy as sa


revision = "caisse_cession_trace"
down_revision = "lc_usage_reuse"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("caisse", sa.Column("id_cession", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_caisse_cession", "caisse", "cessions_lc", ["id_cession"], ["id_cession"], ondelete="SET NULL"
    )
    op.create_index("ix_caisse_id_cession", "caisse", ["id_cession"])
    # Production and staging schemas used different names for the previous
    # origin check. Drop either name before allowing LC-linked cash rows.
    op.execute("ALTER TABLE caisse DROP CONSTRAINT IF EXISTS check_caisse_mutual_exclusion")
    op.execute("ALTER TABLE caisse DROP CONSTRAINT IF EXISTS check_caisse_origine")
    op.create_check_constraint(
        "check_caisse_mutual_exclusion",
        "caisse",
        "(id_charge IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL AND id_cession IS NULL) OR "
        "(id_cession IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL AND id_charge IS NULL) OR "
        "(id_charge IS NULL AND id_cession IS NULL AND (id_transaction IS NOT NULL OR id_paiement IS NOT NULL))",
    )


def downgrade() -> None:
    op.execute("ALTER TABLE caisse DROP CONSTRAINT IF EXISTS check_caisse_mutual_exclusion")
    op.execute("ALTER TABLE caisse DROP CONSTRAINT IF EXISTS check_caisse_origine")
    op.create_check_constraint(
        "check_caisse_origine",
        "caisse",
        "(id_transaction IS NOT NULL) OR (id_charge IS NOT NULL)",
    )
    op.drop_index("ix_caisse_id_cession", table_name="caisse")
    op.drop_constraint("fk_caisse_cession", "caisse", type_="foreignkey")
    op.drop_column("caisse", "id_cession")
