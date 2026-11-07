"""Run against a disposable, fully migrated native PostgreSQL fixture."""
import os
import pytest
from sqlalchemy import text
from sqlalchemy.engine.url import make_url
from tests.conftest import TEST_DB_URL, engine

pytestmark = pytest.mark.skipif(
    os.environ.get("PHASE8_DISPOSABLE_DB") != "true",
    reason="Native PostgreSQL release gate only",
)

FUNCTIONS = {
    "guard_independent_cycle_snapshot",
    "sync_independent_lot_to_cycle",
    "assert_independent_lot_has_cycle",
}

def test_independent_lot_trigger_resolution_is_pinned_without_security_definer():
    url = make_url(TEST_DB_URL)
    if (
        not url.drivername.startswith("postgresql")
        or url.host not in {"localhost", "127.0.0.1"}
        or url.database != "comptabilite_db"
        or url.username != "postgres"
    ):
        pytest.fail("Security gate refuses non-disposable targets")
    with engine.connect() as connection:
        functions = connection.execute(text("""
            SELECT p.proname, p.prosecdef, p.proconfig
            FROM pg_catalog.pg_proc p
            JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN
                ('guard_independent_cycle_snapshot',
                 'sync_independent_lot_to_cycle',
                 'assert_independent_lot_has_cycle')
        """)).mappings().all()
    assert {f["proname"] for f in functions} == FUNCTIONS
    for function in functions:
        assert function["prosecdef"] is False
        assert any(setting in {"search_path=", 'search_path=""'} for setting in (function["proconfig"] or []))
