"""add_est_actif_to_utilisateurs

Revision ID: 002_add_est_actif
Revises: c501890a0fbe
Create Date: 2025-01-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_add_est_actif'
down_revision: Union[str, None] = 'c501890a0fbe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if column exists before adding it
    # This migration is safe to run even if the column already exists
    connection = op.get_bind()
    
    # Check if est_actif column exists
    result = connection.execute(sa.text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'utilisateurs' 
        AND column_name = 'est_actif'
    """))
    
    column_exists = result.fetchone() is not None
    
    if not column_exists:
        # Add the est_actif column with default True
        # First add the column as nullable
        op.add_column('utilisateurs', 
            sa.Column('est_actif', sa.Boolean(), nullable=True, server_default='true')
        )
        
        # Update existing rows to True (they should already be active)
        op.execute("UPDATE utilisateurs SET est_actif = true WHERE est_actif IS NULL")
        
        # Now make it NOT NULL
        op.alter_column('utilisateurs', 'est_actif',
                       existing_type=sa.Boolean(),
                       nullable=False,
                       server_default='true')


def downgrade() -> None:
    # Drop the column if it exists
    connection = op.get_bind()
    result = connection.execute(sa.text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'utilisateurs' 
        AND column_name = 'est_actif'
    """))
    
    if result.fetchone() is not None:
        op.drop_column('utilisateurs', 'est_actif')

