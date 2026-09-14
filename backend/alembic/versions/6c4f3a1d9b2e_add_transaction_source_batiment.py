"""add transaction source batiment

Revision ID: 6c4f3a1d9b2e
Revises: 5d3c4087733d
Create Date: 2026-05-14 20:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6c4f3a1d9b2e"
down_revision: Union[str, None] = "5d3c4087733d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("id_batiment", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_transactions_id_batiment"), "transactions", ["id_batiment"], unique=False)
    op.create_foreign_key(
        "fk_transactions_batiment",
        "transactions",
        "batiments",
        ["id_batiment"],
        ["id_batiment"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_transactions_batiment", "transactions", type_="foreignkey")
    op.drop_index(op.f("ix_transactions_id_batiment"), table_name="transactions")
    op.drop_column("transactions", "id_batiment")
