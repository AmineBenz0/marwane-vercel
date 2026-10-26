"""automatic_egg_allocations

Revision ID: 01aa6010b368
Revises: supplier_funding_source
Create Date: 2026-10-24 20:05:05.305081

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '01aa6010b368'
down_revision: Union[str, None] = 'supplier_funding_source'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table('egg_sale_allocations') and any(c['name'] == 'allocation_automatique' for c in inspector.get_columns('transactions')):
        return
    op.add_column('transactions', sa.Column('allocation_automatique', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table('egg_sale_allocations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('id_transaction', sa.Integer(), sa.ForeignKey('transactions.id_transaction', ondelete='CASCADE'), nullable=False),
        sa.Column('id_production', sa.Integer(), sa.ForeignKey('productions.id_production', ondelete='RESTRICT'), nullable=False),
        sa.Column('quantite', sa.Integer(), nullable=False),
        sa.CheckConstraint('quantite > 0', name='egg_allocation_positive'),
        sa.UniqueConstraint('id_transaction', 'id_production', name='egg_allocation_source_unique'))
    op.create_index('ix_egg_sale_allocations_id_transaction', 'egg_sale_allocations', ['id_transaction'])
    op.create_index('ix_egg_sale_allocations_id_production', 'egg_sale_allocations', ['id_production'])
    op.execute("INSERT INTO egg_sale_allocations (id_transaction, id_production, quantite) SELECT id_transaction, id_production, quantite FROM transactions WHERE id_production IS NOT NULL")
    if op.get_bind().dialect.name == 'postgresql':
        op.execute("ALTER TABLE egg_sale_allocations ENABLE ROW LEVEL SECURITY")
        op.execute("CREATE POLICY runtime_allocation_access ON egg_sale_allocations TO app_runtime USING (true) WITH CHECK (true)")
        op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON egg_sale_allocations TO app_runtime")
        op.execute("GRANT USAGE, SELECT ON SEQUENCE egg_sale_allocations_id_seq TO app_runtime")


def downgrade() -> None:
    raise RuntimeError("Stock origin history must be preserved.")
