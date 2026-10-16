import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_vaccine_migration_preserves_existing_expenses_and_seeds_catalogue():
    path = Path(__file__).parents[1] / 'alembic/versions/daily_vaccine_expenses_daily_vaccine_expenses.py'
    spec = importlib.util.spec_from_file_location('vaccine_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine('sqlite:///:memory:')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE batiments (id_batiment INTEGER PRIMARY KEY)'))
        connection.execute(text('CREATE TABLE cycles_production (id_cycle INTEGER PRIMARY KEY)'))
        connection.execute(text('CREATE TABLE charges (id_charge INTEGER PRIMARY KEY, montant NUMERIC(15,2), date_charge DATE)'))
        connection.execute(text("INSERT INTO charges VALUES (1, 125, '2026-10-01')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert connection.execute(text('SELECT count(*) FROM vaccins')).scalar_one() == 13
        assert connection.execute(text('SELECT count(*) FROM vaccins WHERE prix_defaut IS NOT NULL')).scalar_one() == 0
        assert connection.execute(text('SELECT montant FROM charges WHERE id_charge=1')).scalar_one() == 125
        assert connection.execute(text('SELECT source_journaliere FROM charges WHERE id_charge=1')).scalar_one() == 0
        assert {'id_vaccin', 'quantite', 'prix_unitaire', 'id_batiment', 'id_cycle'} <= {column['name'] for column in inspect(connection).get_columns('charges')}
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert connection.execute(text('SELECT montant FROM charges WHERE id_charge=1')).scalar_one() == 125
        assert 'vaccins' not in inspect(connection).get_table_names()
