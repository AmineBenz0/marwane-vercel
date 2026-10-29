"""Real PostgreSQL contract checks, isolated in a rolled-back synthetic schema."""
import os
from pathlib import Path
from uuid import uuid4
import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'supabase_migrations' / '20261029111705_correction_history_foundation.sql'
PAYMENT_MIGRATION = ROOT / 'supabase_migrations' / '20261029162302_audited_payment_corrections.sql'
SQL = Path(__file__).parent / 'sql'


def test_deployment_migration_copies_match():
    canonical = MIGRATION.read_text()
    assert (ROOT / 'backend/migrations/correction_history_foundation.sql').read_text() == canonical
    assert canonical in (ROOT / 'supabase_bootstrap.sql').read_text()
    payment_guard = PAYMENT_MIGRATION.read_text()
    assert (ROOT / 'backend/migrations/audited_payment_corrections.sql').read_text() == payment_guard
    assert payment_guard in (ROOT / 'supabase_bootstrap.sql').read_text()
    assert "operation_request->'target'->>'entity_type' IS DISTINCT FROM 'paiement'" in payment_guard
    assert 'operation_result->\'record\'->>\'row_version\'' in payment_guard


def test_correction_foundation_on_postgres():
    url = os.environ.get('POSTGRES_MIGRATION_TEST_URL')
    if not url:
        pytest.skip('Set POSTGRES_MIGRATION_TEST_URL to a disposable privileged PostgreSQL database')
    import psycopg2
    schema = 'correction_test_' + uuid4().hex
    with psycopg2.connect(url) as connection:
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'CREATE SCHEMA {schema}')
                for content in [(SQL / 'correction_foundation_fixture.sql').read_text(), MIGRATION.read_text(), MIGRATION.read_text(), PAYMENT_MIGRATION.read_text(), (SQL / 'correction_foundation_assertions.sql').read_text()]:
                    cursor.execute(content.replace('public.', schema + '.').replace('SCHEMA public ', 'SCHEMA ' + schema + ' '))
        finally:
            connection.rollback()
