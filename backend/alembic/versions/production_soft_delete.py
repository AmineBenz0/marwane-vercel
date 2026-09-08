"""Make egg production corrections auditable and non-destructive."""

from alembic import op
import sqlalchemy as sa


revision = "production_soft_delete"
down_revision = "enterprise_bank_idempotency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "productions",
        sa.Column("est_actif", sa.Boolean(), nullable=True, server_default=sa.true()),
    )
    op.execute("UPDATE productions SET est_actif = TRUE WHERE est_actif IS NULL")
    op.alter_column("productions", "est_actif", nullable=False, server_default=None)
    op.add_column(
        "productions",
        sa.Column("date_annulation", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("productions", sa.Column("motif_annulation", sa.Text(), nullable=True))
    op.add_column(
        "productions",
        sa.Column("id_utilisateur_annulation", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_productions_cancellation_user",
        "productions",
        "utilisateurs",
        ["id_utilisateur_annulation"],
        ["id_utilisateur"],
    )
    op.create_index(
        "ix_productions_est_actif_date",
        "productions",
        ["est_actif", "date_production"],
        unique=False,
    )
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_production_delete() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Production records are historical; deactivate the record instead';
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER trg_no_delete_production
        BEFORE DELETE ON productions
        FOR EACH ROW EXECUTE FUNCTION prevent_production_delete();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_no_delete_production ON productions")
    op.execute("DROP FUNCTION IF EXISTS prevent_production_delete()")
    op.drop_index("ix_productions_est_actif_date", table_name="productions")
    op.drop_constraint(
        "fk_productions_cancellation_user",
        "productions",
        type_="foreignkey",
    )
    op.drop_column("productions", "id_utilisateur_annulation")
    op.drop_column("productions", "motif_annulation")
    op.drop_column("productions", "date_annulation")
    op.drop_column("productions", "est_actif")
