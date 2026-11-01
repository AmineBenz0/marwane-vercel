"""Add explicit positive-valued transaction refunds."""
from pathlib import Path
from alembic import op

revision = 'explicit_transaction_refunds'
down_revision = 'stock_correction_revisions'
branch_labels = None
depends_on = None


def upgrade():
    source = Path(__file__).resolve().parents[2] / 'migrations' / 'explicit_transaction_refunds.sql'
    op.get_bind().exec_driver_sql(source.read_text())


def downgrade():
    raise RuntimeError('Refund history requires a forward-only rollback; never discard settlement records')
