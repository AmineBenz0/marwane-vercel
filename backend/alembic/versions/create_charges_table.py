"""Create charges table

Revision ID: create_charges_table
Revises: phase3_production_tracking
Create Date: 2026-03-18 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'create_charges_table'
down_revision = 'phase3_production_tracking'
branch_labels = None
depends_on = None


def upgrade():
    # Table Charges
    op.create_table(
        'charges',
        sa.Column('id_charge', sa.Integer(), nullable=False),
        sa.Column('libelle', sa.String(length=200), nullable=False),
        sa.Column('montant', sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column('date_charge', sa.Date(), nullable=False),
        sa.Column('categorie', sa.String(length=50), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_modification', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id_utilisateur_creation', sa.Integer(), nullable=True),
        sa.Column('id_utilisateur_modification', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['id_utilisateur_creation'], ['utilisateurs.id_utilisateur'], ),
        sa.ForeignKeyConstraint(['id_utilisateur_modification'], ['utilisateurs.id_utilisateur'], ),
        sa.PrimaryKeyConstraint('id_charge')
    )
    op.create_index(op.f('ix_charges_id_charge'), 'charges', ['id_charge'], unique=False)
    op.create_index(op.f('ix_charges_date_charge'), 'charges', ['date_charge'], unique=False)
    op.create_index(op.f('ix_charges_categorie'), 'charges', ['categorie'], unique=False)


def downgrade():
    op.drop_table('charges')
