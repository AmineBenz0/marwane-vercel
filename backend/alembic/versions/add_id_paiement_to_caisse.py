"""Add id_paiement to caisse

Revision ID: add_id_paiement_to_caisse
Revises: phase1_lc_adjustments
Create Date: 2026-03-17 11:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_id_paiement_to_caisse'
down_revision: Union[str, None] = 'phase1_lc_adjustments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add id_paiement column to caisse table
    op.add_column('caisse', sa.Column('id_paiement', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_caisse_paiement', 'caisse', 'paiements', ['id_paiement'], ['id_paiement'])
    op.create_index('idx_caisse_id_paiement', 'caisse', ['id_paiement'])


def downgrade() -> None:
    # Remove id_paiement column from caisse table
    op.drop_index('idx_caisse_id_paiement', table_name='caisse')
    op.drop_constraint('fk_caisse_paiement', 'caisse', type_='foreignkey')
    op.drop_column('caisse', 'id_paiement')
