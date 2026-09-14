"""create tasks table

Revision ID: b1c2d3e4f5a6
Revises: 9a8b7c6d5e4f
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa


revision = "b1c2d3e4f5a6"
down_revision = "9a8b7c6d5e4f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "taches",
        sa.Column("id_tache", sa.Integer(), nullable=False),
        sa.Column("titre", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("date_debut", sa.DateTime(timezone=True), nullable=False),
        sa.Column("date_fin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("est_toute_la_journee", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("statut", sa.String(length=20), nullable=False, server_default="en_attente"),
        sa.Column("priorite", sa.String(length=20), nullable=False, server_default="moyenne"),
        sa.Column("categorie", sa.String(length=50), nullable=True),
        sa.Column("id_utilisateur", sa.Integer(), nullable=False),
        sa.Column("date_creation", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("date_modification", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "statut IN ('en_attente', 'en_cours', 'complete', 'annule')",
            name="check_statut_tache_valide",
        ),
        sa.CheckConstraint(
            "priorite IN ('basse', 'moyenne', 'haute')",
            name="check_priorite_tache_valide",
        ),
        sa.ForeignKeyConstraint(["id_utilisateur"], ["utilisateurs.id_utilisateur"]),
        sa.PrimaryKeyConstraint("id_tache"),
    )
    op.create_index(op.f("ix_taches_id_tache"), "taches", ["id_tache"], unique=False)
    op.create_index(op.f("ix_taches_date_debut"), "taches", ["date_debut"], unique=False)
    op.create_index(op.f("ix_taches_date_fin"), "taches", ["date_fin"], unique=False)
    op.create_index(op.f("ix_taches_id_utilisateur"), "taches", ["id_utilisateur"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_taches_id_utilisateur"), table_name="taches")
    op.drop_index(op.f("ix_taches_date_fin"), table_name="taches")
    op.drop_index(op.f("ix_taches_date_debut"), table_name="taches")
    op.drop_index(op.f("ix_taches_id_tache"), table_name="taches")
    op.drop_table("taches")
