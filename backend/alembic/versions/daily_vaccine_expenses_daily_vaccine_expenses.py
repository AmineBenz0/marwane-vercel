"""daily vaccine expenses

Revision ID: daily_vaccine_expenses
Revises: shared_production_lots
Create Date: 2026-10-15 21:55:47.068398

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'daily_vaccine_expenses'
down_revision: Union[str, None] = 'shared_production_lots'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vaccins',
        sa.Column('id_vaccin', sa.Integer(), primary_key=True),
        sa.Column('nom', sa.String(150), nullable=False, unique=True),
        sa.Column('prix_defaut', sa.Numeric(15, 2), nullable=True),
        sa.Column('unite', sa.String(40), nullable=False, server_default='unité'),
        sa.Column('est_actif', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint('prix_defaut IS NULL OR prix_defaut > 0', name='check_vaccin_prix_positif'),
    )
    catalogue = sa.table('vaccins', sa.column('nom', sa.String(150)))
    op.bulk_insert(catalogue, [{'nom': name} for name in (
        'MA5', 'IB4/91', 'CLONE 30', 'Gumboro 228E', 'H9 + ND', 'MG 6/85',
        'Vectormune FP+LT+AE', 'SG 9R', 'CORVAC 4', 'NOBILIS ILT', 'NEMOVAC', 'H9N2', 'IB MULTI',
    )])
    with op.batch_alter_table('charges') as batch:
        batch.add_column(sa.Column('source_journaliere', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column('id_vaccin', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('nom_vaccin', sa.String(150), nullable=True))
        batch.add_column(sa.Column('unite', sa.String(40), nullable=True))
        batch.add_column(sa.Column('quantite', sa.Numeric(12, 3), nullable=True))
        batch.add_column(sa.Column('prix_unitaire', sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column('id_batiment', sa.Integer(), nullable=True))
        batch.add_column(sa.Column('id_cycle', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_charges_vaccin', 'vaccins', ['id_vaccin'], ['id_vaccin'])
        batch.create_foreign_key('fk_charges_batiment', 'batiments', ['id_batiment'], ['id_batiment'])
        batch.create_foreign_key('fk_charges_cycle', 'cycles_production', ['id_cycle'], ['id_cycle'])
        batch.create_check_constraint('check_charge_vaccin_details',
            'NOT source_journaliere OR (id_vaccin IS NOT NULL AND nom_vaccin IS NOT NULL '
            'AND unite IS NOT NULL AND quantite IS NOT NULL AND quantite > 0 '
            'AND prix_unitaire IS NOT NULL AND prix_unitaire > 0 AND id_batiment IS NOT NULL)')
        if op.get_bind().dialect.name == 'postgresql':
            batch.create_check_constraint('check_charge_vaccin_total',
                'NOT source_journaliere OR montant = round(quantite * prix_unitaire, 2)')
        for field in ('id_vaccin', 'id_batiment', 'id_cycle'):
            batch.create_index('ix_charges_' + field, [field])
        batch.create_index('ix_charges_daily_vaccins', ['id_batiment', 'date_charge'])
    if op.get_bind().dialect.name == 'postgresql':
        op.execute('ALTER TABLE public.vaccins ENABLE ROW LEVEL SECURITY')
        op.execute('REVOKE ALL ON public.vaccins FROM PUBLIC')
        op.execute('''DO $$ DECLARE exposed_role text; BEGIN
            FOR exposed_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
                EXECUTE format('REVOKE ALL ON public.vaccins FROM %I', exposed_role);
            END LOOP;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
                ALTER TABLE public.vaccins OWNER TO app_migrator;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
                GRANT SELECT ON public.vaccins TO app_runtime;
                CREATE POLICY app_runtime_access ON public.vaccins FOR SELECT TO app_runtime USING (true);
            END IF;
        END $$''')


def downgrade() -> None:
    with op.batch_alter_table('charges') as batch:
        batch.drop_constraint('check_charge_vaccin_details', type_='check')
        if op.get_bind().dialect.name == 'postgresql':
            batch.drop_constraint('check_charge_vaccin_total', type_='check')
        for name in ('fk_charges_vaccin', 'fk_charges_batiment', 'fk_charges_cycle'):
            batch.drop_constraint(name, type_='foreignkey')
        batch.drop_index('ix_charges_daily_vaccins')
        for field in ('id_vaccin', 'id_batiment', 'id_cycle'):
            batch.drop_index('ix_charges_' + field)
        for field in ('source_journaliere', 'id_vaccin', 'nom_vaccin', 'unite', 'quantite', 'prix_unitaire', 'id_batiment', 'id_cycle'):
            batch.drop_column(field)
    op.drop_table('vaccins')
