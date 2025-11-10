"""Add business constraints

Revision ID: 001_add_business_constraints
Revises: 
Create Date: 2025-11-10 15:32:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_add_business_constraints'
down_revision: Union[str, None] = '51e530ae737a'  # Depends on initial migration
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add constraint: montant_total must be positive
    op.execute("""
        ALTER TABLE transactions 
        ADD CONSTRAINT check_montant_positif 
        CHECK (montant_total > 0)
    """)
    
    # Add constraint: transaction must have either client OR fournisseur (exclusive)
    op.execute("""
        ALTER TABLE transactions 
        ADD CONSTRAINT check_client_ou_fournisseur 
        CHECK (
            (id_client IS NOT NULL AND id_fournisseur IS NULL) 
            OR 
            (id_fournisseur IS NOT NULL AND id_client IS NULL)
        )
    """)
    
    # Add constraint: quantite must be positive
    op.execute("""
        ALTER TABLE lignes_transaction 
        ADD CONSTRAINT check_quantite_positive 
        CHECK (quantite > 0)
    """)


def downgrade() -> None:
    # Remove constraints in reverse order
    op.execute("ALTER TABLE lignes_transaction DROP CONSTRAINT IF EXISTS check_quantite_positive")
    op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS check_client_ou_fournisseur")
    op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS check_montant_positif")

