"""snapshot supplier payment funding source

Revision ID: supplier_funding_source
Revises: fournisseur_payment_preference
Create Date: 2026-10-22 15:49:46.148990

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'supplier_funding_source'
down_revision: Union[str, None] = 'fournisseur_payment_preference'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('paiements', sa.Column('source_reglement', sa.String(10), nullable=True))
    op.drop_constraint('check_paiement_compte_virement', 'paiements', type_='check')
    op.create_check_constraint(
        'check_paiement_source_reglement', 'paiements',
        "source_reglement IS NULL OR source_reglement IN ('caisse', 'banque')",
    )
    op.create_check_constraint(
        'check_paiement_source_compte', 'paiements',
        "CASE WHEN source_reglement IS NULL THEN (id_compte IS NULL OR type_paiement = 'virement') "
        "WHEN source_reglement = 'caisse' THEN id_compte IS NULL "
        "WHEN source_reglement = 'banque' THEN id_compte IS NOT NULL ELSE FALSE END",
    )


def downgrade() -> None:
    raise RuntimeError('Payment funding snapshots must be preserved; restore a reviewed backup to downgrade.')
