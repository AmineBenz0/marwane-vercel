"""Add product type flags (pour_clients, pour_fournisseurs)

Revision ID: 003_add_product_type_flags
Revises: c501890a0fbe
Create Date: 2024-11-14

This migration adds two boolean fields to the produits table:
- pour_clients: indicates if product can be used for client transactions
- pour_fournisseurs: indicates if product can be used for supplier transactions

Both fields default to TRUE to ensure existing products remain usable.
A CHECK constraint ensures at least one flag is TRUE.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003_add_product_type_flags'
down_revision = 'c501890a0fbe'
branch_labels = None
depends_on = None


def upgrade():
    """
    Add product type flags to the produits table.
    
    Changes:
    1. Add pour_clients column (boolean, default TRUE)
    2. Add pour_fournisseurs column (boolean, default TRUE)
    3. Add CHECK constraint to ensure at least one is TRUE
    4. Add indexes for performance
    """
    # Add the two boolean columns with default TRUE
    # This ensures existing products remain usable for all transaction types
    op.add_column('produits', 
        sa.Column('pour_clients', sa.Boolean(), nullable=False, server_default='true')
    )
    op.add_column('produits', 
        sa.Column('pour_fournisseurs', sa.Boolean(), nullable=False, server_default='true')
    )
    
    # Add constraint: at least one must be true
    # This prevents creating products that can't be used anywhere
    op.create_check_constraint(
        'check_au_moins_un_type',
        'produits',
        'pour_clients = true OR pour_fournisseurs = true'
    )
    
    # Create indexes for better query performance when filtering by type
    op.create_index('idx_produits_pour_clients', 'produits', ['pour_clients'])
    op.create_index('idx_produits_pour_fournisseurs', 'produits', ['pour_fournisseurs'])


def downgrade():
    """
    Remove product type flags from the produits table.
    
    This will:
    1. Drop indexes
    2. Drop CHECK constraint
    3. Drop columns
    """
    # Drop indexes
    op.drop_index('idx_produits_pour_fournisseurs', table_name='produits')
    op.drop_index('idx_produits_pour_clients', table_name='produits')
    
    # Drop CHECK constraint
    op.drop_constraint('check_au_moins_un_type', 'produits', type_='check')
    
    # Drop columns
    op.drop_column('produits', 'pour_fournisseurs')
    op.drop_column('produits', 'pour_clients')

