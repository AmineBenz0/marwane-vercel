import importlib.util
from pathlib import Path
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text, inspect


def test_additive_allocation_migration_preserves_known_sources_and_replays():
    path = Path('alembic/versions/01aa6010b368_automatic_egg_allocations.py')
    spec = importlib.util.spec_from_file_location('allocation_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine('sqlite://')
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE productions (id_production INTEGER PRIMARY KEY)'))
        conn.execute(text('CREATE TABLE transactions (id_transaction INTEGER PRIMARY KEY, id_production INTEGER REFERENCES productions(id_production), quantite INTEGER)'))
        conn.execute(text('INSERT INTO productions VALUES (1)'))
        conn.execute(text('INSERT INTO transactions VALUES (1, 1, 20), (2, NULL, 30)'))
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
            migration.upgrade()
        assert conn.execute(text('SELECT id_transaction, id_production, quantite FROM egg_sale_allocations')).all() == [(1, 1, 20)]
        assert conn.execute(text('SELECT quantite FROM transactions ORDER BY id_transaction')).scalars().all() == [20, 30]
        assert 'allocation_automatique' in [c['name'] for c in inspect(conn).get_columns('transactions')]
