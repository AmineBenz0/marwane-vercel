"""enterprise financial, inventory, BOM, alert, and void-state foundation.

This migration is additive. Existing records remain readable and all new
financial corrections are represented by status/reversal records.
"""

from alembic import op
import sqlalchemy as sa


revision = "enterprise_foundation"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("caisse", sa.Column("statut", sa.String(length=20), nullable=True, server_default="active"))
    op.execute("UPDATE caisse SET statut = 'active' WHERE statut IS NULL")
    op.alter_column("caisse", "statut", nullable=False, server_default=None)
    op.create_index("ix_caisse_statut", "caisse", ["statut"], unique=False)
    op.create_check_constraint("check_statut_caisse_valide", "caisse", "statut IN ('active', 'annule')")

    op.add_column("paiements", sa.Column("motif_annulation", sa.Text(), nullable=True))
    op.add_column("paiements", sa.Column("cle_idempotence", sa.String(length=120), nullable=True))
    op.create_index("ix_paiements_cle_idempotence", "paiements", ["cle_idempotence"], unique=True)
    op.add_column("charges", sa.Column("motif_annulation", sa.Text(), nullable=True))

    op.add_column("charges", sa.Column("statut", sa.String(length=20), nullable=True, server_default="active"))
    op.execute("UPDATE charges SET statut = 'active' WHERE statut IS NULL")
    op.alter_column("charges", "statut", nullable=False, server_default=None)
    op.create_index("ix_charges_statut", "charges", ["statut"], unique=False)
    op.create_check_constraint("check_statut_charge_valide", "charges", "statut IN ('active', 'annule')")
    op.create_check_constraint("check_charge_montant_positif", "charges", "montant > 0")

    op.add_column("mouvements_bancaires", sa.Column("statut", sa.String(length=20), nullable=True, server_default="active"))
    op.execute("UPDATE mouvements_bancaires SET statut = 'active' WHERE statut IS NULL")
    op.alter_column("mouvements_bancaires", "statut", nullable=False, server_default=None)
    op.create_index("ix_mouvements_bancaires_statut", "mouvements_bancaires", ["statut"], unique=False)
    op.create_check_constraint("check_mouvement_bancaire_montant_positif", "mouvements_bancaires", "montant > 0")
    op.create_check_constraint("check_type_mouvement_bancaire_valide", "mouvements_bancaires", "type_mouvement IN ('ENTREE', 'SORTIE')")
    op.create_check_constraint("check_statut_mouvement_bancaire_valide", "mouvements_bancaires", "statut IN ('active', 'annule')")

    op.add_column("transformations", sa.Column("id_nomenclature", sa.Integer(), nullable=True))
    op.add_column("transformations", sa.Column("quantite_sortie", sa.Numeric(15, 3), nullable=True))
    op.add_column("transformations", sa.Column("cout_total", sa.Numeric(15, 2), nullable=True))
    op.add_column("transformations", sa.Column("cle_idempotence", sa.String(length=120), nullable=True))
    op.create_index("ix_transformations_id_nomenclature", "transformations", ["id_nomenclature"], unique=False)
    op.create_index("ix_transformations_cle_idempotence", "transformations", ["cle_idempotence"], unique=True)
    op.create_check_constraint("check_transformation_output_positive", "transformations", "quantite_sortie IS NULL OR quantite_sortie > 0")

    op.create_table(
        "nomenclatures",
        sa.Column("id_nomenclature", sa.Integer(), primary_key=True),
        sa.Column("id_produit_sortie", sa.Integer(), sa.ForeignKey("produits.id_produit"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("est_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("date_debut", sa.Date(), nullable=True),
        sa.Column("date_fin", sa.Date(), nullable=True),
        sa.Column("quantite_sortie", sa.Numeric(15, 3), nullable=False, server_default="1"),
        sa.Column("rendement_pct", sa.Numeric(5, 2), nullable=False, server_default="100"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("date_creation", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("id_utilisateur", sa.Integer(), sa.ForeignKey("utilisateurs.id_utilisateur"), nullable=True),
        sa.CheckConstraint("version > 0", name="check_bom_version_positive"),
        sa.CheckConstraint("quantite_sortie > 0", name="check_bom_output_positive"),
        sa.CheckConstraint("rendement_pct > 0 AND rendement_pct <= 100", name="check_bom_yield_range"),
        sa.UniqueConstraint("id_produit_sortie", "version", name="uq_bom_product_version"),
    )
    op.create_index("ix_nomenclatures_id_nomenclature", "nomenclatures", ["id_nomenclature"], unique=False)
    op.create_index("ix_nomenclatures_id_produit_sortie", "nomenclatures", ["id_produit_sortie"], unique=False)
    op.create_index("ix_nomenclatures_est_active", "nomenclatures", ["est_active"], unique=False)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_nomenclature_active_product ON nomenclatures (id_produit_sortie) WHERE est_active = true")

    op.create_table(
        "nomenclature_lignes",
        sa.Column("id_ligne", sa.Integer(), primary_key=True),
        sa.Column("id_nomenclature", sa.Integer(), sa.ForeignKey("nomenclatures.id_nomenclature"), nullable=False),
        sa.Column("id_produit_entree", sa.Integer(), sa.ForeignKey("produits.id_produit"), nullable=False),
        sa.Column("quantite", sa.Numeric(15, 3), nullable=False),
        sa.CheckConstraint("quantite > 0", name="check_bom_line_positive"),
        sa.UniqueConstraint("id_nomenclature", "id_produit_entree", name="uq_bom_input_product"),
    )
    op.create_index("ix_nomenclature_lignes_id_nomenclature", "nomenclature_lignes", ["id_nomenclature"], unique=False)
    op.create_index("ix_nomenclature_lignes_id_produit_entree", "nomenclature_lignes", ["id_produit_entree"], unique=False)

    op.create_check_constraint("check_transformation_line_positive", "transformation_lignes", "quantite > 0")
    op.create_check_constraint("check_transformation_line_type", "transformation_lignes", "type_ligne IN ('INPUT', 'OUTPUT')")

    op.create_table(
        "mouvements_stock",
        sa.Column("id_mouvement_stock", sa.Integer(), primary_key=True),
        sa.Column("id_produit", sa.Integer(), sa.ForeignKey("produits.id_produit"), nullable=False),
        sa.Column("quantite_delta", sa.Numeric(15, 3), nullable=False),
        sa.Column("cout_unitaire", sa.Numeric(15, 4), nullable=False, server_default="0"),
        sa.Column("type_mouvement", sa.String(length=40), nullable=False),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("cle_idempotence", sa.String(length=120), nullable=True),
        sa.Column("id_mouvement_inverse", sa.Integer(), sa.ForeignKey("mouvements_stock.id_mouvement_stock"), nullable=True),
        sa.Column("date_mouvement", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("id_utilisateur", sa.Integer(), sa.ForeignKey("utilisateurs.id_utilisateur"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.CheckConstraint("quantite_delta <> 0", name="check_stock_delta_nonzero"),
        sa.CheckConstraint("cout_unitaire >= 0", name="check_stock_cost_nonnegative"),
        sa.UniqueConstraint("source_type", "source_id", "type_mouvement", "id_produit", "id_mouvement_inverse", name="uq_stock_source_movement"),
    )
    op.create_index("ix_mouvements_stock_id_mouvement_stock", "mouvements_stock", ["id_mouvement_stock"], unique=False)
    op.create_index("ix_mouvements_stock_id_produit", "mouvements_stock", ["id_produit"], unique=False)
    op.create_index("ix_mouvements_stock_source", "mouvements_stock", ["source_type", "source_id"], unique=False)
    op.create_index("ix_mouvements_stock_cle_idempotence", "mouvements_stock", ["cle_idempotence"], unique=True)

    op.create_table(
        "alertes",
        sa.Column("id_alerte", sa.Integer(), primary_key=True),
        sa.Column("id_transaction", sa.Integer(), sa.ForeignKey("transactions.id_transaction"), nullable=True),
        sa.Column("type_alerte", sa.String(length=40), nullable=False),
        sa.Column("titre", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("date_reference", sa.Date(), nullable=False),
        sa.Column("est_lue", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("date_lecture", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_creation", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("id_transaction", "type_alerte", "date_reference", name="uq_alert_transaction_type_date"),
    )
    op.create_index("ix_alertes_id_alerte", "alertes", ["id_alerte"], unique=False)
    op.create_index("ix_alertes_unread", "alertes", ["est_lue", "date_creation"], unique=False)

    op.execute("ALTER TABLE produits DROP CONSTRAINT IF EXISTS check_type_produit_valide")
    op.execute("UPDATE produits SET type_produit = 'produit_fini' WHERE type_produit IS NULL OR type_produit NOT IN ('matiere_premiere', 'produit_fini', 'service')")
    op.create_check_constraint("check_type_produit_valide", "produits", "type_produit IN ('matiere_premiere', 'produit_fini', 'service')")

    op.create_foreign_key("fk_transformations_nomenclature", "transformations", "nomenclatures", ["id_nomenclature"], ["id_nomenclature"])
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("""
        CREATE OR REPLACE FUNCTION public.immutable_unaccent(value text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        SET search_path = public, pg_catalog
        AS $$ SELECT public.unaccent(value) $$
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_clients_nom_unaccent_trgm ON clients USING gin (public.immutable_unaccent(nom_client) gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_fournisseurs_nom_unaccent_trgm ON fournisseurs USING gin (public.immutable_unaccent(nom_fournisseur) gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_produits_nom_unaccent_trgm ON produits USING gin (public.immutable_unaccent(nom_produit) gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_charges_libelle_unaccent_trgm ON charges USING gin (public.immutable_unaccent(libelle) gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_lc_reference_unaccent_trgm ON lettres_credit USING gin (public.immutable_unaccent(numero_reference) gin_trgm_ops)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_caisse_active_payment ON caisse (id_paiement) WHERE id_paiement IS NOT NULL AND statut = 'active'")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_caisse_active_charge ON caisse (id_charge) WHERE id_charge IS NOT NULL AND statut = 'active'")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_active_payment ON mouvements_bancaires (id_paiement) WHERE id_paiement IS NOT NULL AND statut = 'active'")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_active_charge ON mouvements_bancaires (id_charge) WHERE id_charge IS NOT NULL AND statut = 'active'")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_lc_active_payment ON paiements (id_lc) WHERE id_lc IS NOT NULL AND statut <> 'annule'")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_lc_reference_unaccent_trgm")
    op.execute("DROP INDEX IF EXISTS ix_charges_libelle_unaccent_trgm")
    op.execute("DROP INDEX IF EXISTS uq_nomenclature_active_product")
    op.execute("DROP INDEX IF EXISTS uq_lc_active_payment")
    op.execute("DROP INDEX IF EXISTS uq_bank_active_charge")
    op.execute("DROP INDEX IF EXISTS uq_bank_active_payment")
    op.execute("DROP INDEX IF EXISTS uq_caisse_active_charge")
    op.execute("DROP INDEX IF EXISTS uq_caisse_active_payment")
    op.execute("DROP INDEX IF EXISTS ix_produits_nom_unaccent_trgm")
    op.execute("DROP INDEX IF EXISTS ix_fournisseurs_nom_unaccent_trgm")
    op.execute("DROP INDEX IF EXISTS ix_clients_nom_unaccent_trgm")
    op.execute("DROP FUNCTION IF EXISTS public.immutable_unaccent(text)")
    op.drop_constraint("fk_transformations_nomenclature", "transformations", type_="foreignkey")
    op.drop_constraint("check_type_produit_valide", "produits", type_="check")
    op.drop_table("alertes")
    op.drop_table("mouvements_stock")
    op.drop_table("nomenclature_lignes")
    op.drop_table("nomenclatures")
    op.drop_constraint("check_transformation_line_type", "transformation_lignes", type_="check")
    op.drop_constraint("check_transformation_line_positive", "transformation_lignes", type_="check")
    op.drop_constraint("check_transformation_output_positive", "transformations", type_="check")
    op.drop_index("ix_transformations_cle_idempotence", table_name="transformations")
    op.drop_index("ix_transformations_id_nomenclature", table_name="transformations")
    op.drop_column("transformations", "cle_idempotence")
    op.drop_column("transformations", "cout_total")
    op.drop_column("transformations", "quantite_sortie")
    op.drop_column("transformations", "id_nomenclature")
    op.drop_constraint("check_statut_mouvement_bancaire_valide", "mouvements_bancaires", type_="check")
    op.drop_constraint("check_type_mouvement_bancaire_valide", "mouvements_bancaires", type_="check")
    op.drop_constraint("check_mouvement_bancaire_montant_positif", "mouvements_bancaires", type_="check")
    op.drop_index("ix_mouvements_bancaires_statut", table_name="mouvements_bancaires")
    op.drop_column("mouvements_bancaires", "statut")
    op.drop_constraint("check_charge_montant_positif", "charges", type_="check")
    op.drop_constraint("check_statut_charge_valide", "charges", type_="check")
    op.drop_index("ix_charges_statut", table_name="charges")
    op.drop_column("charges", "statut")
    op.drop_constraint("check_statut_caisse_valide", "caisse", type_="check")
    op.drop_index("ix_caisse_statut", table_name="caisse")
    op.drop_column("caisse", "statut")
    op.drop_column("charges", "motif_annulation")
    op.drop_index("ix_paiements_cle_idempotence", table_name="paiements")
    op.drop_column("paiements", "cle_idempotence")
    op.drop_column("paiements", "motif_annulation")
