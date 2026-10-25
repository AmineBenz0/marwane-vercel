"""Exercise the SQL alignment in an isolated PostgreSQL schema; always roll back."""

import os
import re
from pathlib import Path
from uuid import uuid4

import app.models  # noqa: F401 -- register every mapped table
import psycopg2
import pytest
from app.database import Base
from sqlalchemy import create_mock_engine

MIGRATION = next((Path(__file__).parents[2] / "supabase_migrations").glob(
    "*_align_database_integrity.sql"
))
CHECKS = {
    "charges": ["check_charge_montant_positif"],
    "mouvements_bancaires": [
        "check_mouvement_bancaire_montant_positif", "check_type_mouvement_bancaire_valide",
    ],
    "produits": ["check_type_produit_valide"],
    "transformation_lignes": ["check_transformation_line_positive", "check_transformation_line_type"],
    "transformations": ["check_transformation_output_positive"],
    "productions": ["check_nombre_oeufs_positif", "check_grammage_positif"],
    "lettres_credit": ["check_lc_detenteur_unifie"],
}
INDEXES = [
    "uq_caisse_active_charge", "uq_caisse_active_payment", "uq_bank_active_charge",
    "uq_bank_active_payment", "uq_lc_active_payment", "uq_nomenclature_active_product",
    "ix_lettres_credit_numero_reference", "ix_utilisateurs_email",
]


@pytest.fixture
def alignment_db():
    url = os.getenv("POSTGRES_MIGRATION_TEST_URL")
    if not url:
        pytest.skip("POSTGRES_MIGRATION_TEST_URL must identify a disposable PostgreSQL database")
    conn = psycopg2.connect(url, connect_timeout=10)
    cursor = conn.cursor()
    schema = f"alignment_test_{uuid4().hex}"
    cursor.execute(f'CREATE SCHEMA "{schema}"')
    cursor.execute(f'SET LOCAL search_path TO "{schema}"')
    cursor.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app_runtime') THEN
                CREATE ROLE app_runtime NOLOGIN;
            END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        END $$;
    """)
    mock = None

    def emit(sql, *args, **kwargs):
        cursor.execute(str(sql.compile(dialect=mock.dialect)))

    mock = create_mock_engine("postgresql://", emit)
    Base.metadata.create_all(mock, checkfirst=False)
    # Start without the reviewed checks/indexes, as in the SQL-managed database.
    for table, names in CHECKS.items():
        for name in names:
            cursor.execute(f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "{name}"')
    for name in INDEXES:
        cursor.execute(f'DROP INDEX IF EXISTS "{name}"')
    cursor.execute("ALTER TABLE cycles_production ALTER COLUMN duree_semaines SET DEFAULT 80")
    cursor.execute(f'GRANT USAGE ON SCHEMA "{schema}" TO app_runtime')
    cursor.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "{schema}" TO app_runtime')
    cursor.execute(f'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "{schema}" TO app_runtime')
    cursor.execute("ALTER TABLE vaccins ENABLE ROW LEVEL SECURITY")
    cursor.execute("CREATE POLICY app_runtime_access ON vaccins FOR ALL TO app_runtime USING (true) WITH CHECK (true)")
    sql = re.sub(r"(?m)^(BEGIN|COMMIT);\s*$", "", MIGRATION.read_text())
    sql = sql.replace("public.", f'"{schema}".')
    try:
        yield cursor, sql, schema
    finally:
        conn.rollback()  # Removes fixtures, functions, privileges, and the schema.
        conn.close()


def reject(cursor, sql, error, params=None):
    cursor.execute("SAVEPOINT expected_rejection")
    with pytest.raises(error):
        cursor.execute(sql, params)
    cursor.execute("ROLLBACK TO SAVEPOINT expected_rejection")


def seed(cursor):
    cursor.execute("""
        INSERT INTO utilisateurs (id_utilisateur,nom_utilisateur,email,mot_de_passe_hash,est_actif)
            VALUES (1,'Alignment','alignment@example.test','unused',true);
        INSERT INTO clients (id_client,nom_client,est_actif) VALUES (1,'Alignment client',true);
        INSERT INTO batiments (id_batiment,nom,est_actif) VALUES (1,'Alignment building',true);
        INSERT INTO produits (id_produit,nom_produit,type_produit,est_actif,pour_clients,pour_fournisseurs)
            VALUES (1,'Alignment service','service',true,true,true);
        INSERT INTO comptes_bancaires (id_compte,nom_banque,numero_compte,solde_actuel)
            VALUES (1,'Alignment bank','alignment-bank',1000);
        INSERT INTO transactions (id_transaction,date_transaction,id_produit,quantite,prix_unitaire,montant_total,est_actif,id_client,id_utilisateur_creation)
            VALUES (1,CURRENT_DATE,1,1,100,100,true,1,1);
        INSERT INTO lettres_credit (id_lc,numero_reference,montant,date_emission,date_disponibilite,statut,type_detenteur,id_client)
            VALUES (1,'alignment-lc',40,CURRENT_DATE,CURRENT_DATE,'active','client',1);
        INSERT INTO paiements (id_paiement,id_transaction,date_paiement,montant,type_paiement,statut,id_lc)
            VALUES (1,1,CURRENT_DATE,40,'lc','valide',1);
        INSERT INTO charges (id_charge,libelle,montant,date_charge,categorie,statut,source_journaliere)
            VALUES (1,'Alignment expense',25,CURRENT_DATE,'autre','active',false);
        INSERT INTO caisse (id_mouvement,montant,type_mouvement,id_paiement,statut)
            VALUES (1,40,'ENTREE',1,'active');
        INSERT INTO mouvements_bancaires (id_mouvement,id_compte,montant,type_mouvement,source,id_charge,statut)
            VALUES (1,1,25,'SORTIE','frais',1,'active');
        INSERT INTO productions (id_production,date_production,id_batiment,type_oeuf,calibre,nombre_oeufs,grammage,nombre_cartons,est_actif)
            VALUES (1,CURRENT_DATE,1,'normal','moyen',100,60,1,true);
        INSERT INTO mouvements_stock (id_mouvement_stock,id_produit,quantite_delta,cout_unitaire,type_mouvement,source_type,source_id)
            VALUES (1,1,10,0,'ENTREE','test',1);
        INSERT INTO corrections_financieres (id_correction,type_entite,id_entite,action,raison)
            VALUES (1,'charge',1,'creation','Alignment test');
        INSERT INTO vaccins (id_vaccin,nom,prix_defaut) VALUES (1,'Alignment vaccine',45);
    """)


def test_replay_preserves_history_and_aligns_defaults(alignment_db):
    cursor, sql, schema = alignment_db
    seed(cursor)
    cursor.execute("SELECT row_to_json(t) FROM transactions t WHERE id_transaction=1")
    before = cursor.fetchone()[0]
    cursor.execute(sql)
    cursor.execute(sql)
    verification = (Path(__file__).parents[1] / 'scripts/sql/verify_database_alignment.sql').read_text()
    verification = verification.replace('public.', f'"{schema}".').replace("schemaname='public'", f"schemaname='{schema}'")
    cursor.execute(verification)
    assert cursor.fetchall() == []
    cursor.execute("SELECT row_to_json(t) FROM transactions t WHERE id_transaction=1")
    assert cursor.fetchone()[0] == before
    cursor.execute("SELECT column_default FROM information_schema.columns WHERE table_schema=%s AND table_name='cycles_production' AND column_name='duree_semaines'", (schema,))
    assert cursor.fetchone()[0] == "100"
    cursor.execute("SELECT count(*) FROM pg_trigger WHERE tgrelid=%s::regclass AND NOT tgisinternal", (f'{schema}.transactions',))
    assert cursor.fetchone()[0] == 1  # Delete protection only; no new audit trigger.


@pytest.mark.parametrize("statement", [
    "UPDATE charges SET montant=0 WHERE id_charge=1",
    "UPDATE productions SET nombre_oeufs=-1 WHERE id_production=1",
    "UPDATE productions SET grammage=-1 WHERE id_production=1",
    "UPDATE lettres_credit SET id_client=NULL WHERE id_lc=1",
    "UPDATE mouvements_bancaires SET type_mouvement='INVALID' WHERE id_mouvement=1",
    "UPDATE produits SET type_produit='INVALID' WHERE id_produit=1",
])
def test_invalid_values_are_rejected(alignment_db, statement):
    cursor, sql, _ = alignment_db
    seed(cursor)
    cursor.execute(sql)
    # Bank identity trigger may reject an invalid direction before the CHECK does.
    reject(cursor, statement, (psycopg2.errors.CheckViolation, psycopg2.errors.RaiseException))


@pytest.mark.parametrize("table,pk", [
    ("transactions", "id_transaction"), ("paiements", "id_paiement"),
    ("caisse", "id_mouvement"), ("mouvements_bancaires", "id_mouvement"),
    ("charges", "id_charge"), ("productions", "id_production"),
    ("mouvements_stock", "id_mouvement_stock"), ("corrections_financieres", "id_correction"),
])
def test_historical_records_cannot_be_erased(alignment_db, table, pk):
    cursor, sql, _ = alignment_db
    seed(cursor)
    cursor.execute(sql)
    reject(cursor, f'DELETE FROM "{table}" WHERE "{pk}"=1', psycopg2.errors.RaiseException)


def test_cancellation_releases_uniqueness_without_overwriting_history(alignment_db):
    cursor, sql, _ = alignment_db
    seed(cursor)
    cursor.execute(sql)
    reject(cursor, "UPDATE paiements SET montant=50 WHERE id_paiement=1", psycopg2.errors.RaiseException)
    reject(cursor, "INSERT INTO paiements (id_paiement,id_transaction,date_paiement,montant,type_paiement,id_lc) VALUES (2,1,CURRENT_DATE,40,'lc',1)", psycopg2.errors.UniqueViolation)
    reject(cursor, "INSERT INTO caisse (id_mouvement,montant,type_mouvement,id_paiement) VALUES (2,40,'ENTREE',1)", psycopg2.errors.UniqueViolation)
    reject(cursor, "INSERT INTO mouvements_bancaires (id_mouvement,id_compte,montant,type_mouvement,source,id_charge) VALUES (2,1,25,'SORTIE','frais',1)", psycopg2.errors.UniqueViolation)
    cursor.execute("""
        UPDATE paiements SET statut='annule',motif_annulation='Correction' WHERE id_paiement=1;
        UPDATE caisse SET statut='annule',motif_annulation='Correction' WHERE id_mouvement=1;
        UPDATE mouvements_bancaires SET statut='annule',motif_annulation='Correction' WHERE id_mouvement=1;
        INSERT INTO paiements (id_paiement,id_transaction,date_paiement,montant,type_paiement,id_lc) VALUES (2,1,CURRENT_DATE,40,'lc',1);
        INSERT INTO caisse (id_mouvement,montant,type_mouvement,id_paiement) VALUES (2,40,'ENTREE',2);
        INSERT INTO mouvements_bancaires (id_mouvement,id_compte,montant,type_mouvement,source,id_charge) VALUES (2,1,25,'SORTIE','frais',1);
    """)
    cursor.execute("SELECT id_paiement,montant,statut FROM paiements ORDER BY id_paiement")
    assert [(row[0], int(row[1]), row[2]) for row in cursor.fetchall()] == [(1,40,'annule'),(2,40,'valide')]


def test_runtime_can_update_vaccine_price_and_cancel_but_not_rewrite_history(alignment_db):
    cursor, sql, _ = alignment_db
    seed(cursor)
    cursor.execute(sql)
    cursor.execute("SET LOCAL ROLE app_runtime")
    cursor.execute("UPDATE vaccins SET prix_defaut=60 WHERE id_vaccin=1 RETURNING prix_defaut")
    assert int(cursor.fetchone()[0]) == 60
    reject(cursor, "UPDATE vaccins SET nom='Renamed' WHERE id_vaccin=1", psycopg2.errors.InsufficientPrivilege)
    reject(cursor, "INSERT INTO vaccins (nom) VALUES ('Extra')", psycopg2.errors.InsufficientPrivilege)
    reject(cursor, "DELETE FROM vaccins WHERE id_vaccin=1", psycopg2.errors.InsufficientPrivilege)
    reject(cursor, "DELETE FROM transactions WHERE id_transaction=1", psycopg2.errors.InsufficientPrivilege)
    reject(cursor, "UPDATE corrections_financieres SET raison='Changed' WHERE id_correction=1", psycopg2.errors.InsufficientPrivilege)
    cursor.execute("UPDATE paiements SET statut='annule',motif_annulation='Correction' WHERE id_paiement=1 RETURNING id_paiement")
    assert cursor.fetchone()[0] == 1
    cursor.execute("RESET ROLE")


def test_invalid_existing_data_aborts_the_whole_alignment(alignment_db):
    cursor, sql, schema = alignment_db
    seed(cursor)
    cursor.execute("UPDATE charges SET montant=0 WHERE id_charge=1")
    reject(cursor, sql, psycopg2.errors.CheckViolation)
    cursor.execute("SELECT column_default FROM information_schema.columns WHERE table_schema=%s AND table_name='cycles_production' AND column_name='duree_semaines'", (schema,))
    assert cursor.fetchone()[0] == '80'
    cursor.execute("SELECT montant FROM charges WHERE id_charge=1")
    assert cursor.fetchone()[0] == 0  # No silent cleanup or data rewrite.
