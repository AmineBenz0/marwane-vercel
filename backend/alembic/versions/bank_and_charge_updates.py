"""Bank accounts and charge integration

Revision ID: bank_and_charge_updates
Revises: phase3_production_tracking
Create Date: 2026-03-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'bank_and_charge_updates'
down_revision = 'create_charges_table'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add id_charge to caisse
    op.add_column('caisse', sa.Column('id_charge', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_caisse_charge', 'caisse', 'charges', ['id_charge'], ['id_charge'])
    op.create_index('idx_caisse_id_charge', 'caisse', ['id_charge'])

    # 2. Create comptes_bancaires
    op.create_table(
        'comptes_bancaires',
        sa.Column('id_compte', sa.Integer(), nullable=False),
        sa.Column('nom_banque', sa.String(length=100), nullable=False),
        sa.Column('numero_compte', sa.String(length=50), nullable=False),
        sa.Column('solde_actuel', sa.Numeric(precision=15, scale=2), nullable=False, server_default='0'),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_modification', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id_compte'),
        sa.UniqueConstraint('numero_compte')
    )
    op.create_index(op.f('ix_comptes_bancaires_id_compte'), 'comptes_bancaires', ['id_compte'], unique=False)

    # 3. Create mouvements_bancaires
    op.create_table(
        'mouvements_bancaires',
        sa.Column('id_mouvement', sa.Integer(), nullable=False),
        sa.Column('id_compte', sa.Integer(), nullable=False),
        sa.Column('date_mouvement', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('montant', sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column('type_mouvement', sa.String(length=10), nullable=False),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('reference', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.String(length=255), nullable=True),
        sa.Column('id_paiement', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['id_compte'], ['comptes_bancaires.id_compte'], ),
        sa.ForeignKeyConstraint(['id_paiement'], ['paiements.id_paiement'], ),
        sa.PrimaryKeyConstraint('id_mouvement')
    )
    op.create_index(op.f('ix_mouvements_bancaires_id_compte'), 'mouvements_bancaires', ['id_compte'], unique=False)
    op.create_index(op.f('ix_mouvements_bancaires_id_mouvement'), 'mouvements_bancaires', ['id_mouvement'], unique=False)


def downgrade():
    op.drop_table('mouvements_bancaires')
    op.drop_table('comptes_bancaires')
    op.drop_index('idx_caisse_id_charge', table_name='caisse')
    op.drop_constraint('fk_caisse_charge', 'caisse', type_='foreignkey')
    op.drop_column('caisse', 'id_charge')
