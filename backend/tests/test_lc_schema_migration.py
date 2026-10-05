"""Run the maintenance SQL against isolated PostgreSQL schemas, then roll back."""

import os
from pathlib import Path
import re
from uuid import uuid4

import psycopg2
import pytest


@pytest.fixture
def migration_database():
    url = os.environ.get("POSTGRES_MIGRATION_TEST_URL")
    if not url:
        pytest.skip("POSTGRES_MIGRATION_TEST_URL is required for PostgreSQL migration tests")
    connection = psycopg2.connect(url, connect_timeout=10)
    schema = f"lc_migration_test_{uuid4().hex}"
    cursor = connection.cursor()
    cursor.execute(f'CREATE SCHEMA "{schema}"')
    cursor.execute(f'SET LOCAL search_path TO "{schema}"')
    cursor.execute("""
        CREATE TABLE lettres_credit (
            id_lc INTEGER PRIMARY KEY, numero_reference TEXT UNIQUE NOT NULL,
            statut TEXT NOT NULL,
            CONSTRAINT check_lc_statut_valide CHECK (
                statut IN ('active', 'utilisee', 'cedee', 'expiree', 'annulee')
            )
        );
        CREATE TABLE cessions_lc (
            id_cession INTEGER PRIMARY KEY,
            id_lc INTEGER NOT NULL REFERENCES lettres_credit(id_lc),
            statut TEXT NOT NULL DEFAULT 'active',
            id_cession_inverse INTEGER REFERENCES cessions_lc(id_cession),
            motif_annulation TEXT, date_annulation TIMESTAMPTZ,
            id_utilisateur_annulation INTEGER
        );
        CREATE TABLE paiements (id_paiement INTEGER PRIMARY KEY, id_lc INTEGER, statut TEXT);
        CREATE TABLE mouvements_bancaires (
            id_mouvement INTEGER PRIMARY KEY, source TEXT, reference TEXT, statut TEXT
        );
        INSERT INTO lettres_credit VALUES
            (1, 'reversed', 'annulee'), (2, 'payment', 'utilisee'),
            (3, 'bank', 'utilisee'), (4, 'cession', 'cedee'), (5, 'available', 'active');
        INSERT INTO cessions_lc (id_cession, id_lc, statut, motif_annulation) VALUES
            (11, 1, 'annulee', 'Retained cancellation reason'),
            (12, 1, 'active', NULL), (13, 4, 'active', NULL);
        UPDATE cessions_lc SET id_cession_inverse = 12 WHERE id_cession = 11;
        UPDATE cessions_lc SET id_cession_inverse = 11 WHERE id_cession = 12;
        INSERT INTO paiements VALUES (1, 2, 'valide');
        INSERT INTO mouvements_bancaires VALUES (1, 'lc', 'bank', 'active');
    """)
    path = Path(__file__).resolve().parents[2] / "supabase_migrations/0004_lc_usage_reuse.sql"
    sql = re.sub(r"(?m)^(BEGIN|COMMIT);\s*$", "", path.read_text(encoding="utf-8"))
    sql = sql.replace("public.", f'"{schema}".').replace("'public'", f"'{schema}'")
    try:
        yield cursor, sql
    finally:
        connection.rollback()  # Includes the schema and all synthetic records.
        connection.close()


def test_migration_restores_availability_and_preserves_audit(migration_database):
    cursor, sql = migration_database
    cursor.execute(sql)
    cursor.execute("SELECT id_lc, statut, version_utilisation FROM lettres_credit ORDER BY id_lc")
    assert cursor.fetchall() == [
        (1, "active", 0), (2, "utilisee", 1), (3, "utilisee", 1),
        (4, "utilisee", 1), (5, "active", 0),
    ]
    cursor.execute("SELECT id_cession, id_cession_origine FROM cessions_lc ORDER BY id_cession")
    assert cursor.fetchall() == [(11, None), (12, 11), (13, None)]
    cursor.execute("SELECT motif_annulation FROM cessions_lc WHERE id_cession = 11")
    assert cursor.fetchone() == ("Retained cancellation reason",)


def test_replay_preserves_usage_versions_and_enforces_one_reversal(migration_database):
    cursor, sql = migration_database
    cursor.execute(sql)
    cursor.execute("UPDATE lettres_credit SET version_utilisation = 7 WHERE id_lc = 3")
    cursor.execute(sql)
    cursor.execute("SELECT version_utilisation FROM lettres_credit WHERE id_lc = 3")
    assert cursor.fetchone() == (7,)
    cursor.execute("SAVEPOINT duplicate_reversal")
    with pytest.raises(psycopg2.errors.UniqueViolation):
        cursor.execute("INSERT INTO cessions_lc (id_cession,id_lc,id_cession_origine) VALUES (14,1,11)")
    cursor.execute("ROLLBACK TO SAVEPOINT duplicate_reversal")


def test_ambiguous_history_aborts_without_leaving_partial_columns(migration_database):
    cursor, sql = migration_database
    cursor.execute("UPDATE cessions_lc SET id_cession_inverse = NULL WHERE id_cession = 11")
    cursor.execute("SAVEPOINT attempted_migration")
    with pytest.raises(psycopg2.errors.RaiseException, match="unambiguous reversal"):
        cursor.execute(sql)
    cursor.execute("ROLLBACK TO SAVEPOINT attempted_migration")
    cursor.execute("SELECT * FROM lettres_credit LIMIT 0")
    assert "version_utilisation" not in [column.name for column in cursor.description]
