"""Add replay protection and creation ownership to bank movements."""

from alembic import op
import sqlalchemy as sa


revision = "enterprise_bank_idempotency"
down_revision = "enterprise_integrity_followups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mouvements_bancaires",
        sa.Column("cle_idempotence", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "mouvements_bancaires",
        sa.Column("id_utilisateur_creation", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_mouvements_bancaires_cle_idempotence",
        "mouvements_bancaires",
        ["cle_idempotence"],
        unique=True,
    )
    op.create_index(
        "ix_mouvements_bancaires_id_utilisateur_creation",
        "mouvements_bancaires",
        ["id_utilisateur_creation"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_bank_movement_creation_user",
        "mouvements_bancaires",
        "utilisateurs",
        ["id_utilisateur_creation"],
        ["id_utilisateur"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_bank_movement_creation_user",
        "mouvements_bancaires",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_mouvements_bancaires_id_utilisateur_creation",
        table_name="mouvements_bancaires",
    )
    op.drop_index(
        "ix_mouvements_bancaires_cle_idempotence",
        table_name="mouvements_bancaires",
    )
    op.drop_column("mouvements_bancaires", "id_utilisateur_creation")
    op.drop_column("mouvements_bancaires", "cle_idempotence")
