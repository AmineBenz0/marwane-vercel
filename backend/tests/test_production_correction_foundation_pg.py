"""Exercise guarded correction history DDL on disposable PostgreSQL, never live."""
import os
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "backend/migrations/production_correction_history_foundation.sql"
FIXTURE = ROOT / "backend/tests/sql/correction_foundation_fixture.sql"


def _connection():
    url = os.environ.get("POSTGRES_MIGRATION_TEST_URL")
    if not url:
        pytest.skip("No disposable database configured")
    if urlparse(url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        pytest.fail("Migration smoke tests refuse remote database hosts")
    import psycopg2
    return psycopg2.connect(url)


def _sql(source, schema):
    return source.replace("public.", f"{schema}.").replace(
        "SCHEMA public ", f"SCHEMA {schema} "
    )


def _fixture(cursor, schema, populated):
    lines = FIXTURE.read_text().splitlines()
    if not populated:
        lines = [line for line in lines if not line.startswith((
            "INSERT INTO public.transactions VALUES",
            "INSERT INTO public.paiements VALUES",
            "INSERT INTO public.caisse(",
        ))]
    cursor.execute(f"CREATE SCHEMA {schema}")
    cursor.execute(_sql("\n".join(lines), schema))


def test_guarded_foundation_installs_and_audits_runtime_writes():
    conn = _connection()
    schema = "test_corr_" + uuid4().hex
    try:
        with conn.cursor() as cur:
            _fixture(cur, schema, populated=False)
            cur.execute(_sql(MIGRATION.read_text(), schema))
            cur.execute(f"""
                SELECT
                  (SELECT count(*) FROM {schema}.entity_revisions),
                  (SELECT count(*) FROM {schema}.correction_operations),
                  (SELECT count(*) FROM pg_trigger t JOIN pg_class c
                    ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname='{schema}'
                      AND t.tgname IN ('trg_correction_capture','trg_correction_version')
                      AND NOT t.tgisinternal)
            """)
            assert cur.fetchone() == (0, 0, 4)

            cur.execute("SET LOCAL ROLE app_runtime")
            cur.execute(f"""
                INSERT INTO {schema}.transactions
                (id_transaction,date_transaction,date_echeance,quantite,prix_unitaire,
                 montant_total,est_actif,id_client,id_utilisateur_creation)
                VALUES(1,'2026-11-09','2026-11-10',10,2,20,true,1,1)
            """)
            cur.execute(f"""
                UPDATE {schema}.transactions
                   SET date_echeance='2026-11-12',id_utilisateur_modification=1
                 WHERE id_transaction=1
            """)
            cur.execute(f"""
                INSERT INTO {schema}.paiements
                (id_paiement,id_transaction,date_paiement,montant,type_paiement,
                 statut,id_utilisateur_creation)
                VALUES(1,1,'2026-11-09',5,'cash','valide',1)
            """)
            cur.execute(f"SELECT count(*),max(revision) FROM {schema}.entity_revisions")
            assert cur.fetchone() == (3, 2)
            cur.execute(f"""
                SELECT before_snapshot->>'date_echeance',after_snapshot->>'date_echeance'
                FROM {schema}.entity_revisions
                WHERE entity_type='transaction' AND revision=2
            """)
            assert cur.fetchone() == ('2026-11-10', '2026-11-12')
    finally:
        conn.rollback()
        conn.close()


def test_foundation_guard_aborts_on_existing_financial_records():
    conn = _connection()
    schema = "test_guard_" + uuid4().hex
    try:
        with conn.cursor() as cur:
            _fixture(cur, schema, populated=True)
            with pytest.raises(Exception, match="financial baseline changed"):
                cur.execute(_sql(MIGRATION.read_text(), schema))
    finally:
        conn.rollback()
        conn.close()
