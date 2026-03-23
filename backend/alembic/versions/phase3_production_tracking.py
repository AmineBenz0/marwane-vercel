"""Phase 3 Production Tracking

Revision ID: phase3_production_tracking
Revises: add_id_paiement_to_caisse
Create Date: 2026-03-17 12:20:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column


# revision identifiers, used by Alembic.
revision = 'phase3_production_tracking'
down_revision = 'add_id_paiement_to_caisse'
branch_labels = None
depends_on = None


def upgrade():
    # Table Batiments
    op.create_table(
        'batiments',
        sa.Column('id_batiment', sa.Integer(), nullable=False),
        sa.Column('nom', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('est_actif', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id_batiment'),
        sa.UniqueConstraint('nom')
    )
    op.create_index(op.f('ix_batiments_id_batiment'), 'batiments', ['id_batiment'], unique=False)

    # Table Productions
    op.create_table(
        'productions',
        sa.Column('id_production', sa.Integer(), nullable=False),
        sa.Column('date_production', sa.Date(), nullable=False),
        sa.Column('id_batiment', sa.Integer(), nullable=False),
        sa.Column('type_oeuf', sa.String(length=50), nullable=False),
        sa.Column('calibre', sa.String(length=50), nullable=False),
        sa.Column('nombre_oeufs', sa.Integer(), nullable=False),
        sa.Column('grammage', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('nombre_cartons', sa.Integer(), nullable=False),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_modification', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id_utilisateur_creation', sa.Integer(), nullable=True),
        sa.Column('id_utilisateur_modification', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['id_batiment'], ['batiments.id_batiment'], ),
        sa.ForeignKeyConstraint(['id_utilisateur_creation'], ['utilisateurs.id_utilisateur'], ),
        sa.ForeignKeyConstraint(['id_utilisateur_modification'], ['utilisateurs.id_utilisateur'], ),
        sa.PrimaryKeyConstraint('id_production')
    )
    op.create_index(op.f('ix_productions_date_production'), 'productions', ['date_production'], unique=False)
    op.create_index(op.f('ix_productions_id_batiment'), 'productions', ['id_batiment'], unique=False)
    op.create_index(op.f('ix_productions_id_production'), 'productions', ['id_production'], unique=False)
    op.create_index(op.f('ix_productions_type_oeuf'), 'productions', ['type_oeuf'], unique=False)
    op.create_index(op.f('ix_productions_calibre'), 'productions', ['calibre'], unique=False)

    # Insertion des 3 bâtiments par défaut
    batiments_table = table('batiments',
        column('nom', sa.String),
        column('description', sa.String)
    )
    op.bulk_insert(batiments_table, [
        {'nom': 'Bâtiment A', 'description': 'Premier bâtiment de production'},
        {'nom': 'Bâtiment B', 'description': 'Second bâtiment de production'},
        {'nom': 'Bâtiment C', 'description': 'Troisième bâtiment de production'}
    ])


def downgrade():
    op.drop_table('productions')
    op.drop_table('batiments')
