"""add production cycles

Revision ID: 9a8b7c6d5e4f
Revises: 6c4f3a1d9b2e, 7f3e9a2b1c4d
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa


revision = "9a8b7c6d5e4f"
down_revision = ("6c4f3a1d9b2e", "7f3e9a2b1c4d")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cycles_production",
        sa.Column("id_cycle", sa.Integer(), nullable=False),
        sa.Column("id_batiment", sa.Integer(), nullable=False),
        sa.Column("nom_cycle", sa.String(length=100), nullable=False),
        sa.Column("souche", sa.String(length=100), nullable=True),
        sa.Column("date_debut", sa.Date(), nullable=False),
        sa.Column("age_depart_semaines", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("effectif_initial", sa.Integer(), nullable=True),
        sa.Column("duree_semaines", sa.Integer(), nullable=False, server_default="80"),
        sa.Column("date_fin_prevue", sa.Date(), nullable=False),
        sa.Column("date_fin_reelle", sa.Date(), nullable=True),
        sa.Column("statut", sa.String(length=30), nullable=False, server_default="actif"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("date_creation", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("date_modification", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id_utilisateur_creation", sa.Integer(), nullable=True),
        sa.Column("id_utilisateur_modification", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["id_batiment"], ["batiments.id_batiment"]),
        sa.ForeignKeyConstraint(["id_utilisateur_creation"], ["utilisateurs.id_utilisateur"]),
        sa.ForeignKeyConstraint(["id_utilisateur_modification"], ["utilisateurs.id_utilisateur"]),
        sa.PrimaryKeyConstraint("id_cycle"),
    )
    op.create_index(op.f("ix_cycles_production_id_cycle"), "cycles_production", ["id_cycle"], unique=False)
    op.create_index(op.f("ix_cycles_production_id_batiment"), "cycles_production", ["id_batiment"], unique=False)
    op.create_index(op.f("ix_cycles_production_date_debut"), "cycles_production", ["date_debut"], unique=False)
    op.create_index(op.f("ix_cycles_production_date_fin_prevue"), "cycles_production", ["date_fin_prevue"], unique=False)
    op.create_index(op.f("ix_cycles_production_date_fin_reelle"), "cycles_production", ["date_fin_reelle"], unique=False)
    op.create_index(op.f("ix_cycles_production_statut"), "cycles_production", ["statut"], unique=False)

    op.add_column("productions", sa.Column("id_cycle", sa.Integer(), nullable=True))
    op.add_column("productions", sa.Column("reforme", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_productions_id_cycle"), "productions", ["id_cycle"], unique=False)
    op.create_foreign_key("fk_productions_cycle", "productions", "cycles_production", ["id_cycle"], ["id_cycle"])

    op.add_column("transactions", sa.Column("id_cycle", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_transactions_id_cycle"), "transactions", ["id_cycle"], unique=False)
    op.create_foreign_key("fk_transactions_cycle", "transactions", "cycles_production", ["id_cycle"], ["id_cycle"])

    op.execute(
        """
        INSERT INTO cycles_production (
            id_batiment,
            nom_cycle,
            date_debut,
            age_depart_semaines,
            effectif_initial,
            duree_semaines,
            date_fin_prevue,
            date_fin_reelle,
            statut,
            notes
        )
        SELECT
            p.id_batiment,
            'Historique avant cycles',
            MIN(p.date_production),
            0,
            NULL,
            80,
            MAX(p.date_production),
            MAX(p.date_production),
            'termine',
            'Cycle cree automatiquement pour conserver les anciennes saisies.'
        FROM productions p
        GROUP BY p.id_batiment
        """
    )

    op.execute(
        """
        UPDATE productions p
        SET id_cycle = c.id_cycle
        FROM cycles_production c
        WHERE c.id_batiment = p.id_batiment
          AND c.nom_cycle = 'Historique avant cycles'
          AND p.date_production BETWEEN c.date_debut AND c.date_fin_prevue
        """
    )

    op.execute(
        """
        UPDATE transactions t
        SET id_cycle = c.id_cycle
        FROM cycles_production c
        WHERE t.id_batiment = c.id_batiment
          AND c.nom_cycle = 'Historique avant cycles'
          AND t.date_transaction BETWEEN c.date_debut AND c.date_fin_prevue
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_transactions_cycle", "transactions", type_="foreignkey")
    op.drop_index(op.f("ix_transactions_id_cycle"), table_name="transactions")
    op.drop_column("transactions", "id_cycle")

    op.drop_constraint("fk_productions_cycle", "productions", type_="foreignkey")
    op.drop_index(op.f("ix_productions_id_cycle"), table_name="productions")
    op.drop_column("productions", "reforme")
    op.drop_column("productions", "id_cycle")

    op.drop_index(op.f("ix_cycles_production_statut"), table_name="cycles_production")
    op.drop_index(op.f("ix_cycles_production_date_fin_reelle"), table_name="cycles_production")
    op.drop_index(op.f("ix_cycles_production_date_fin_prevue"), table_name="cycles_production")
    op.drop_index(op.f("ix_cycles_production_date_debut"), table_name="cycles_production")
    op.drop_index(op.f("ix_cycles_production_id_batiment"), table_name="cycles_production")
    op.drop_index(op.f("ix_cycles_production_id_cycle"), table_name="cycles_production")
    op.drop_table("cycles_production")
