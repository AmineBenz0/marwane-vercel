"""Add audited transaction cancellation metadata and protect history."""

from alembic import op
import sqlalchemy as sa


revision = "transaction_cancellation_metadata"
down_revision = "production_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("motif_annulation", sa.Text(), nullable=True))
    op.add_column("transactions", sa.Column("date_annulation", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "transactions",
        sa.Column("id_utilisateur_annulation", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_transactions_utilisateur_annulation",
        "transactions",
        "utilisateurs",
        ["id_utilisateur_annulation"],
        ["id_utilisateur"],
    )
    op.create_index(
        "ix_transactions_date_annulation",
        "transactions",
        ["date_annulation"],
        unique=False,
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.prevent_transaction_delete()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RAISE EXCEPTION
                'transactions are append-only; use the audited deactivation operation';
        END;
        $$;
        """
    )
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_no_delete_transaction ON public.transactions;
        CREATE TRIGGER trg_no_delete_transaction
        BEFORE DELETE ON public.transactions
        FOR EACH ROW EXECUTE FUNCTION public.prevent_transaction_delete();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_no_delete_transaction ON public.transactions")
    op.execute("DROP FUNCTION IF EXISTS public.prevent_transaction_delete()")
    op.drop_index("ix_transactions_date_annulation", table_name="transactions")
    op.drop_constraint(
        "fk_transactions_utilisateur_annulation",
        "transactions",
        type_="foreignkey",
    )
    op.drop_column("transactions", "id_utilisateur_annulation")
    op.drop_column("transactions", "date_annulation")
    op.drop_column("transactions", "motif_annulation")
