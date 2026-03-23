"""Phase 1: LC form adjustments, remove traite, allow overpayment

- Make banque_emettrice nullable (optional)
- Drop date_expiration column
- Drop date_expiration index
- Update type_paiement check constraint (remove 'traite')

Revision ID: phase1_lc_adjustments
Revises: add_lc_support
Create Date: 2026-03-17 11:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'phase1_lc_adjustments'
down_revision: Union[str, None] = 'add_lc_support'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Make banque_emettrice nullable (optional)
    op.alter_column(
        'lettres_credit',
        'banque_emettrice',
        existing_type=sa.String(length=100),
        nullable=True
    )

    # 2. Drop date_expiration index if exists, then drop column
    op.execute('DROP INDEX IF EXISTS ix_lettres_credit_date_expiration')
    op.execute('ALTER TABLE lettres_credit DROP COLUMN IF EXISTS date_expiration')

    # 3. Update type_paiement check constraint (remove 'traite')
    op.execute("ALTER TABLE paiements DROP CONSTRAINT IF EXISTS check_type_paiement_valide")
    op.execute("""
        ALTER TABLE paiements ADD CONSTRAINT check_type_paiement_valide 
        CHECK (type_paiement IN ('cash', 'cheque', 'virement', 'carte', 'compensation', 'lc', 'autre'))
    """)


def downgrade() -> None:
    # 1. Add back date_expiration column
    op.add_column(
        'lettres_credit',
        sa.Column('date_expiration', sa.Date(), nullable=True)
    )
    op.create_index('ix_lettres_credit_date_expiration', 'lettres_credit', ['date_expiration'])

    # 2. Make banque_emettrice non-nullable again
    op.alter_column(
        'lettres_credit',
        'banque_emettrice',
        existing_type=sa.String(length=100),
        nullable=False
    )

    # 3. Restore type_paiement check constraint with 'traite'
    op.execute("ALTER TABLE paiements DROP CONSTRAINT IF EXISTS check_type_paiement_valide")
    op.execute("""
        ALTER TABLE paiements ADD CONSTRAINT check_type_paiement_valide 
        CHECK (type_paiement IN ('cash', 'cheque', 'virement', 'carte', 'traite', 'compensation', 'lc', 'autre'))
    """)
