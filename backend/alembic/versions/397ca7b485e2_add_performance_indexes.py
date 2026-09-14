"""add_performance_indexes

Revision ID: 397ca7b485e2
Revises: 001_add_business_constraints
Create Date: 2025-11-10 16:53:48.309737

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '397ca7b485e2'
down_revision: Union[str, None] = '001_add_business_constraints'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create performance indexes on transactions table
    # Note: Some indexes may already exist with different names (ix_*),
    # but we create new ones with the exact names specified in the requirements
    
    # Index on date_transaction
    op.create_index(
        'idx_transactions_date',
        'transactions',
        ['date_transaction'],
        unique=False
    )
    
    # Index on id_client
    op.create_index(
        'idx_transactions_client',
        'transactions',
        ['id_client'],
        unique=False
    )
    
    # Index on id_fournisseur
    op.create_index(
        'idx_transactions_fournisseur',
        'transactions',
        ['id_fournisseur'],
        unique=False
    )
    
    # Index on est_actif (this one doesn't exist yet)
    op.create_index(
        'idx_transactions_actif',
        'transactions',
        ['est_actif'],
        unique=False
    )
    
    # Create performance indexes on transactions_audit table
    # Index on id_transaction
    op.create_index(
        'idx_audit_transaction',
        'transactions_audit',
        ['id_transaction'],
        unique=False
    )
    
    # Index on date_changement
    op.create_index(
        'idx_audit_date',
        'transactions_audit',
        ['date_changement'],
        unique=False
    )


def downgrade() -> None:
    # Drop indexes in reverse order
    op.drop_index('idx_audit_date', table_name='transactions_audit')
    op.drop_index('idx_audit_transaction', table_name='transactions_audit')
    op.drop_index('idx_transactions_actif', table_name='transactions')
    op.drop_index('idx_transactions_fournisseur', table_name='transactions')
    op.drop_index('idx_transactions_client', table_name='transactions')
    op.drop_index('idx_transactions_date', table_name='transactions')
