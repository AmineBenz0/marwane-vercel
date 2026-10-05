"""Add audited LC cession reversals."""

from alembic import op
import sqlalchemy as sa


revision = "lc_cession_cancellation"
down_revision = "20260911_search_performance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cessions_lc",
        sa.Column("statut", sa.String(length=20), server_default="active", nullable=False),
    )
    op.add_column("cessions_lc", sa.Column("id_cession_inverse", sa.Integer(), nullable=True))
    op.add_column("cessions_lc", sa.Column("motif_annulation", sa.Text(), nullable=True))
    op.add_column(
        "cessions_lc",
        sa.Column("date_annulation", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "cessions_lc",
        sa.Column("id_utilisateur_annulation", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "check_cessions_lc_statut_valide",
        "cessions_lc",
        "statut IN ('active', 'annulee')",
    )
    op.create_foreign_key(
        "fk_cessions_lc_inverse",
        "cessions_lc",
        "cessions_lc",
        ["id_cession_inverse"],
        ["id_cession"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_cessions_lc_utilisateur_annulation",
        "cessions_lc",
        "utilisateurs",
        ["id_utilisateur_annulation"],
        ["id_utilisateur"],
    )
    op.create_index(
        "ix_cessions_lc_id_cession_inverse",
        "cessions_lc",
        ["id_cession_inverse"],
        unique=False,
    )
    op.create_index(
        "ix_cessions_lc_date_annulation",
        "cessions_lc",
        ["date_annulation"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_cessions_lc_date_annulation", table_name="cessions_lc")
    op.drop_index("ix_cessions_lc_id_cession_inverse", table_name="cessions_lc")
    op.drop_constraint("fk_cessions_lc_utilisateur_annulation", "cessions_lc", type_="foreignkey")
    op.drop_constraint("fk_cessions_lc_inverse", "cessions_lc", type_="foreignkey")
    op.drop_constraint("check_cessions_lc_statut_valide", "cessions_lc", type_="check")
    op.drop_column("cessions_lc", "id_utilisateur_annulation")
    op.drop_column("cessions_lc", "date_annulation")
    op.drop_column("cessions_lc", "motif_annulation")
    op.drop_column("cessions_lc", "id_cession_inverse")
    op.drop_column("cessions_lc", "statut")
