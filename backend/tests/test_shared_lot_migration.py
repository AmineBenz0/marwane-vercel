"""Check the maintenance migration against isolated PostgreSQL history."""
import os
from pathlib import Path
import re
from uuid import uuid4

import psycopg2
import pytest


def test_shared_lot_migration_preserves_history_and_replays():
    url = os.environ.get("POSTGRES_MIGRATION_TEST_URL")
    if not url:
        pytest.skip("POSTGRES_MIGRATION_TEST_URL is required")
    connection = psycopg2.connect(url, connect_timeout=10)
    schema = "lot_migration_" + uuid4().hex
    try:
        cursor = connection.cursor()
        cursor.execute(f'CREATE SCHEMA "{schema}"')
        cursor.execute(f'SET LOCAL search_path TO "{schema}"')
        cursor.execute("""
            CREATE TABLE utilisateurs (id_utilisateur INTEGER PRIMARY KEY);
            CREATE TABLE cycles_production (
                id_cycle INTEGER PRIMARY KEY, id_batiment INTEGER NOT NULL,
                nom_cycle VARCHAR(100) NOT NULL, souche VARCHAR(100),
                date_debut DATE NOT NULL, age_depart_semaines INTEGER NOT NULL,
                effectif_initial INTEGER, duree_semaines INTEGER NOT NULL,
                date_fin_prevue DATE NOT NULL, date_fin_reelle DATE, statut VARCHAR(30) NOT NULL,
                notes TEXT, date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
                date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
                id_utilisateur_creation INTEGER, id_utilisateur_modification INTEGER
            );
            CREATE TABLE productions (id_production INTEGER PRIMARY KEY, id_cycle INTEGER REFERENCES cycles_production(id_cycle), mortalite INTEGER);
            CREATE TABLE transactions (id_transaction INTEGER PRIMARY KEY, id_cycle INTEGER REFERENCES cycles_production(id_cycle));
            INSERT INTO cycles_production (id_cycle,id_batiment,nom_cycle,date_debut,
                age_depart_semaines,effectif_initial,duree_semaines,date_fin_prevue,
                date_fin_reelle,statut,notes) VALUES
                (41,1,'Historic A','2026-01-01',0,NULL,100,'2026-06-01','2026-06-01','termine','Retain'),
                (42,2,'Active B','2026-07-01',5,200,100,'2027-07-01',NULL,'a_cloturer',NULL);
            INSERT INTO productions VALUES (17,41,2),(18,42,3);
            INSERT INTO transactions VALUES (21,41);
        """)
        path = Path(__file__).resolve().parents[2] / "supabase_migrations/0005_shared_production_lots.sql"
        sql = re.sub(r"(?m)^(BEGIN|COMMIT);\s*$", "", path.read_text(encoding="utf-8"))
        sql = sql.replace("public.", f'"{schema}".')
        cursor.execute(sql)
        cursor.execute("SELECT id_cycle,id_lot,statut FROM cycles_production ORDER BY id_cycle")
        first = cursor.fetchall()
        assert first == [(41, 1, "termine"), (42, 2, "actif")]
        cursor.execute("SELECT effectif_initial,notes FROM lots_production ORDER BY id_lot")
        assert cursor.fetchall() == [(None, "Retain"), (200, None)]
        cursor.execute("SELECT * FROM productions ORDER BY id_production")
        assert cursor.fetchall() == [(17, 41, 2), (18, 42, 3)]
        cursor.execute("SELECT * FROM transactions")
        assert cursor.fetchall() == [(21, 41)]
        cursor.execute("UPDATE lots_production SET notes = 'Correction' WHERE id_lot = 2")
        cursor.execute(sql)
        cursor.execute("SELECT id_cycle,id_lot,statut FROM cycles_production ORDER BY id_cycle")
        assert cursor.fetchall() == first
        cursor.execute("SELECT count(*),max(notes) FILTER (WHERE id_lot=2) FROM lots_production")
        assert cursor.fetchone() == (2, "Correction")
        cursor.execute("SELECT relrowsecurity FROM pg_class WHERE oid = 'lots_production'::regclass")
        assert cursor.fetchone() == (True,)
        cursor.execute("SAVEPOINT invalid_reference")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            cursor.execute("UPDATE cycles_production SET id_lot = 999 WHERE id_cycle = 41")
        cursor.execute("ROLLBACK TO SAVEPOINT invalid_reference")
    finally:
        connection.rollback()
        connection.close()
