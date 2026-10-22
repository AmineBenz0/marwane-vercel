"""Rehearse the independent-lot migration on isolated PostgreSQL fixtures."""
import os
from datetime import date
from pathlib import Path
from uuid import uuid4

import psycopg2
import pytest


def test_independent_lot_migration_preserves_and_maps_history():
    url = os.environ.get("POSTGRES_MIGRATION_TEST_URL")
    if not url:
        pytest.skip("POSTGRES_MIGRATION_TEST_URL is required")

    schema = "independent_lot_" + uuid4().hex
    connection = psycopg2.connect(url, connect_timeout=10)
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'CREATE SCHEMA "{schema}"')
            cursor.execute(f'SET search_path TO "{schema}"')
            cursor.execute("""
                CREATE TABLE lots_production (
                    id_lot SERIAL PRIMARY KEY,
                    nom_lot VARCHAR(100) NOT NULL,
                    souche VARCHAR(100),
                    date_debut DATE NOT NULL,
                    age_depart_semaines INTEGER NOT NULL,
                    effectif_initial INTEGER,
                    duree_semaines INTEGER NOT NULL,
                    date_fin_prevue DATE NOT NULL,
                    date_fin_reelle DATE,
                    statut VARCHAR(30) NOT NULL,
                    notes TEXT,
                    date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
                    date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
                    id_utilisateur_creation INTEGER,
                    id_utilisateur_modification INTEGER
                );
                CREATE TABLE cycles_production (
                    id_cycle INTEGER PRIMARY KEY,
                    id_batiment INTEGER NOT NULL,
                    nom_cycle VARCHAR(100) NOT NULL,
                    souche VARCHAR(100),
                    date_debut DATE NOT NULL,
                    age_depart_semaines INTEGER NOT NULL,
                    effectif_initial INTEGER,
                    duree_semaines INTEGER NOT NULL,
                    date_fin_prevue DATE NOT NULL,
                    date_fin_reelle DATE,
                    statut VARCHAR(30) NOT NULL,
                    notes TEXT,
                    date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
                    date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
                    id_utilisateur_creation INTEGER,
                    id_utilisateur_modification INTEGER,
                    id_lot INTEGER REFERENCES lots_production(id_lot)
                );
                CREATE TABLE productions (
                    id_production INTEGER PRIMARY KEY,
                    id_cycle INTEGER NOT NULL REFERENCES cycles_production(id_cycle),
                    oeufs_normaux INTEGER NOT NULL,
                    oeufs_blancs INTEGER NOT NULL,
                    oeufs_casses INTEGER NOT NULL,
                    mortalite INTEGER NOT NULL,
                    aliment_kg NUMERIC(10, 2) NOT NULL
                );
                CREATE TABLE transactions (
                    id_transaction INTEGER PRIMARY KEY,
                    id_cycle INTEGER NOT NULL REFERENCES cycles_production(id_cycle),
                    montant_total NUMERIC(12, 2) NOT NULL
                );
                CREATE TABLE charges (
                    id_charge INTEGER PRIMARY KEY,
                    id_cycle INTEGER NOT NULL REFERENCES cycles_production(id_cycle),
                    montant NUMERIC(12, 2) NOT NULL
                );
            """)
            cursor.execute("""
                INSERT INTO lots_production (
                    id_lot, nom_lot, souche, date_debut, age_depart_semaines,
                    effectif_initial, duree_semaines, date_fin_prevue, statut, notes
                ) VALUES
                    (10, 'Shared arrival', 'ISA Brown', '2026-01-01', 0, 300, 80,
                     '2027-07-15', 'actif', 'Shared parent notes'),
                    (20, 'Empty parent', NULL, '2025-01-01', 2, 40, 80,
                     '2026-07-15', 'termine', 'Keep for review'),
                    (30, 'Unknown flock', 'Lohmann', '2026-03-01', 3, 77, 80,
                     '2027-09-13', 'termine', NULL);
                INSERT INTO cycles_production (
                    id_cycle, id_batiment, nom_cycle, souche, date_debut,
                    age_depart_semaines, effectif_initial, duree_semaines,
                    date_fin_prevue, statut, notes, id_lot
                ) VALUES
                    (101, 1, 'Legacy A', 'Old A', '2026-01-01', 0, 100, 80,
                     '2027-07-15', 'actif', 'Cycle A note', 10),
                    (102, 2, 'Legacy B', 'Old B', '2026-01-01', 0, 180, 80,
                     '2027-07-15', 'actif', 'Cycle B note', 10),
                    (104, 4, 'Unknown flock cycle', 'Old C', '2026-03-01', 3, NULL, 80,
                     '2027-09-13', 'termine', NULL, 30),
                    (103, 3, 'Parentless cycle', 'Sussex', '2026-04-01', 4, NULL, 80,
                     '2027-10-14', 'actif', 'Legacy no-parent note', NULL);
                INSERT INTO productions VALUES
                    (501, 101, 20, 3, 1, 2, 4.50),
                    (502, 102, 40, 6, 2, 4, 8.00);
                INSERT INTO transactions VALUES (601, 101, 125.00), (602, 102, 275.00);
                INSERT INTO charges VALUES (701, 101, 35.00), (702, 102, 65.00);
                SELECT setval(pg_get_serial_sequence('lots_production', 'id_lot'), 30, true);
            """)

            cursor.execute("""
                SELECT c.id_batiment, c.id_cycle,
                       sum(p.oeufs_normaux), sum(p.oeufs_blancs), sum(p.oeufs_casses),
                       sum(p.mortalite), sum(p.aliment_kg)
                FROM productions p JOIN cycles_production c USING (id_cycle)
                GROUP BY c.id_batiment, c.id_cycle ORDER BY c.id_cycle
            """)
            baseline_production = cursor.fetchall()
            cursor.execute("""
                SELECT c.id_batiment, c.id_cycle, sum(ch.montant)
                FROM charges ch JOIN cycles_production c USING (id_cycle)
                GROUP BY c.id_batiment, c.id_cycle ORDER BY c.id_cycle
            """)
            baseline_expenses = cursor.fetchall()
            cursor.execute("""
                SELECT c.id_batiment, c.id_cycle, sum(t.montant_total)
                FROM transactions t JOIN cycles_production c USING (id_cycle)
                GROUP BY c.id_batiment, c.id_cycle ORDER BY c.id_cycle
            """)
            baseline_financials = cursor.fetchall()

            sql_path = Path(__file__).resolve().parents[2] / "supabase_migrations/0006_independent_lots_per_building.sql"
            sql = sql_path.read_text(encoding="utf-8")
            cursor.execute(sql.replace("public.", f'"{schema}".'))

            cursor.execute("""
                SELECT id_cycle, id_batiment, id_lot, effectif_initial, statut
                FROM cycles_production ORDER BY id_cycle
            """)
            rows = cursor.fetchall()
            assert rows == [
                (101, 1, 10, 100, "actif"),
                (102, 2, 31, 180, "actif"),
                (103, 3, 32, None, "actif"),
                (104, 4, 30, None, "termine"),
            ]
            cursor.execute("""
                SELECT id_lot, nom_lot, souche, date_debut, age_depart_semaines,
                       effectif_initial, statut, notes
                FROM lots_production WHERE id_lot IN (10, 30, 31, 32)
                ORDER BY id_lot
            """)
            assert cursor.fetchall() == [
                (10, "Shared arrival", "ISA Brown", date(2026, 1, 1), 0, 100, "actif", "Shared parent notes"),
                (30, "Unknown flock", "Lohmann", date(2026, 3, 1), 3, None, "termine", None),
                (31, "Shared arrival", "ISA Brown", date(2026, 1, 1), 0, 180, "actif", "Shared parent notes"),
                (32, "Parentless cycle", "Sussex", date(2026, 4, 1), 4, None, "actif", "Legacy no-parent note"),
            ]
            cursor.execute("""
                SELECT c.id_batiment, c.id_cycle,
                       sum(p.oeufs_normaux), sum(p.oeufs_blancs), sum(p.oeufs_casses),
                       sum(p.mortalite), sum(p.aliment_kg)
                FROM productions p JOIN cycles_production c USING (id_cycle)
                GROUP BY c.id_batiment, c.id_cycle ORDER BY c.id_cycle
            """)
            assert cursor.fetchall() == baseline_production
            cursor.execute("""
                SELECT c.id_batiment, c.id_cycle, sum(ch.montant)
                FROM charges ch JOIN cycles_production c USING (id_cycle)
                GROUP BY c.id_batiment, c.id_cycle ORDER BY c.id_cycle
            """)
            assert cursor.fetchall() == baseline_expenses
            cursor.execute("""
                SELECT c.id_batiment, c.id_cycle, sum(t.montant_total)
                FROM transactions t JOIN cycles_production c USING (id_cycle)
                GROUP BY c.id_batiment, c.id_cycle ORDER BY c.id_cycle
            """)
            assert cursor.fetchall() == baseline_financials

            cursor.execute("""
                SELECT old_lot_id, id_cycle, new_lot_id, action, reconciliation_status,
                       reconciliation_reason
                FROM independent_lot_migration_map WHERE id_cycle IS NOT NULL
                ORDER BY id_cycle
            """)
            mappings = cursor.fetchall()
            assert [row[:4] for row in mappings] == [
                (10, 101, 10, "split_shared_parent"),
                (10, 102, 31, "split_shared_parent"),
                (None, 103, 32, "created_from_parentless_cycle"),
                (30, 104, 30, "retained_single_parent"),
            ]
            assert all(row[4] == "review_required" for row in mappings)
            assert "sum of cycle flock values differs" in mappings[0][5]
            assert "no valid parent" in mappings[2][5]
            assert "flock values differ" in mappings[3][5]

            cursor.execute("""
                SELECT old_lot_id, action, parent_snapshot_before->>'nom_lot'
                FROM independent_lot_migration_map WHERE action = 'empty_parent_archived'
            """)
            assert cursor.fetchall() == [(20, "empty_parent_archived", "Empty parent")]
            cursor.execute("SELECT count(*) FROM lots_production WHERE id_lot = 20")
            assert cursor.fetchone() == (0,)

            # A replay must not allocate additional lots or alter the mapping.
            cursor.execute("SELECT count(*) FROM lots_production")
            lot_count_before_replay = cursor.fetchone()[0]
            cursor.execute("SELECT count(*) FROM independent_lot_migration_map")
            map_count_before_replay = cursor.fetchone()[0]
            cursor.execute(sql.replace("public.", f'"{schema}".'))
            cursor.execute("SELECT count(*) FROM lots_production")
            assert cursor.fetchone()[0] == lot_count_before_replay
            cursor.execute("SELECT count(*) FROM independent_lot_migration_map")
            assert cursor.fetchone()[0] == map_count_before_replay
    finally:
        connection.rollback()
        with connection.cursor() as cursor:
            cursor.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        connection.close()
