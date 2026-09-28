"""Add PostgreSQL search capabilities and operational query indexes."""

from alembic import op


revision = "20260911_search_performance"
down_revision = "job_execution_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.immutable_unaccent(value text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        STRICT
        SET search_path = public, extensions
        AS $$ SELECT unaccent(value) $$
        """
    )

    statements = (
        """
        CREATE INDEX IF NOT EXISTS ix_clients_search_name
        ON clients USING gin
        (lower(public.immutable_unaccent(nom_client::text)) gin_trgm_ops)
        WHERE est_actif IS TRUE
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_fournisseurs_search_name
        ON fournisseurs USING gin
        (lower(public.immutable_unaccent(nom_fournisseur::text)) gin_trgm_ops)
        WHERE est_actif IS TRUE
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_produits_search_name
        ON produits USING gin
        (lower(public.immutable_unaccent(nom_produit::text)) gin_trgm_ops)
        WHERE est_actif IS TRUE
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_charges_search_label
        ON charges USING gin
        (lower(public.immutable_unaccent(libelle::text)) gin_trgm_ops)
        WHERE statut = 'active'
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_lettres_credit_search_reference
        ON lettres_credit USING gin
        (lower(public.immutable_unaccent(numero_reference::text)) gin_trgm_ops)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_transactions_supplier_due_active
        ON transactions (id_fournisseur, est_actif, date_echeance)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_transactions_client_due_active
        ON transactions (id_client, est_actif, date_echeance)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_transactions_date_active
        ON transactions (date_transaction, est_actif)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_paiements_transaction_state
        ON paiements (id_transaction, statut, statut_cheque)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_productions_building_date_active
        ON productions (id_batiment, date_production, est_actif)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_productions_cycle_date_active
        ON productions (id_cycle, date_production, est_actif)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_cycles_building_status_start
        ON cycles_production (id_batiment, statut, date_debut)
        """,
    )
    for statement in statements:
        op.execute(statement)


def downgrade() -> None:
    for index_name in (
        "ix_clients_search_name",
        "ix_fournisseurs_search_name",
        "ix_produits_search_name",
        "ix_charges_search_label",
        "ix_lettres_credit_search_reference",
        "ix_transactions_supplier_due_active",
        "ix_transactions_client_due_active",
        "ix_transactions_date_active",
        "ix_paiements_transaction_state",
        "ix_productions_building_date_active",
        "ix_productions_cycle_date_active",
        "ix_cycles_building_status_start",
    ):
        op.execute(f"DROP INDEX IF EXISTS {index_name}")
    # Keep shared extensions and the function during downgrade so older
    # application versions do not lose their search dependency.
