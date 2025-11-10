"""add_type_mouvement_to_caisse

Revision ID: 08d98041282c
Revises: 397ca7b485e2
Create Date: 2025-11-10 17:00:56.493543

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '08d98041282c'
down_revision: Union[str, None] = '397ca7b485e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if column exists before adding it
    # This migration is safe to run even if the column already exists
    connection = op.get_bind()
    
    # Check if type_mouvement column exists
    result = connection.execute(sa.text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'caisse' 
        AND column_name = 'type_mouvement'
    """))
    
    column_exists = result.fetchone() is not None
    
    if not column_exists:
        # Add the type_mouvement column
        op.add_column('caisse', 
            sa.Column('type_mouvement', sa.String(length=10), nullable=False, server_default='ENTREE')
        )
    
    # Check if constraint exists before adding it
    result = connection.execute(sa.text("""
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'caisse' 
        AND constraint_name = 'check_type_mouvement'
    """))
    
    constraint_exists = result.fetchone() is not None
    
    if not constraint_exists:
        # Add the CHECK constraint to limit values to 'ENTREE' and 'SORTIE'
        op.execute("""
            ALTER TABLE caisse 
            ADD CONSTRAINT check_type_mouvement 
            CHECK (type_mouvement IN ('ENTREE', 'SORTIE'))
        """)


def downgrade() -> None:
    # Drop the constraint if it exists
    op.execute("ALTER TABLE caisse DROP CONSTRAINT IF EXISTS check_type_mouvement")
    
    # Drop the column if it exists
    # Note: This will fail if there are dependencies, but that's expected behavior
    connection = op.get_bind()
    result = connection.execute(sa.text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'caisse' 
        AND column_name = 'type_mouvement'
    """))
    
    if result.fetchone() is not None:
        op.drop_column('caisse', 'type_mouvement')
