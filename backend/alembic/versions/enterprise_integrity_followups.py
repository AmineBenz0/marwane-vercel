"""Close concurrency and payment-state integrity gaps."""

from alembic import op
import sqlalchemy as sa


revision = "enterprise_integrity_followups"
down_revision = "enterprise_ledger_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older releases stored an encashed cheque as a pending general payment.
    # Normalize that state before the application starts enforcing the shared
    # effective-payment predicate.
    op.execute(
        """
        UPDATE paiements
        SET statut = 'valide'
        WHERE type_paiement = 'cheque'
          AND statut_cheque = 'encaisse'
          AND statut = 'en_attente'
        """
    )

    # PostgreSQL treats NULL values as distinct in a regular UNIQUE
    # constraint. This partial index closes the race where two requests could
    # create the same source movement before either request recorded a
    # reversal reference. Existing duplicates intentionally make the
    # migration fail closed and must be resolved through the read-only
    # reconciliation process first.
    op.create_index(
        "uq_stock_source_movement_active",
        "mouvements_stock",
        ["source_type", "source_id", "type_mouvement", "id_produit"],
        unique=True,
        postgresql_where=sa.text("id_mouvement_inverse IS NULL"),
        sqlite_where=sa.text("id_mouvement_inverse IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_stock_source_movement_active",
        table_name="mouvements_stock",
    )
