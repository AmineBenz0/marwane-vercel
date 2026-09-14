"""merge multiple heads

Revision ID: 2be88a19e3e2
Revises: 002_add_est_actif, 003_add_product_type_flags, 476f961e2737
Create Date: 2025-11-14 13:26:55.902404

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2be88a19e3e2'
down_revision: Union[str, None] = ('002_add_est_actif', '003_add_product_type_flags', '476f961e2737')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
