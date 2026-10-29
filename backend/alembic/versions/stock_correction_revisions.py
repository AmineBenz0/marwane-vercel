"""Track allocation changes in the parent transaction revision."""
from pathlib import Path
from alembic import op

revision = 'stock_correction_revisions'
down_revision = 'phase3_cash_bank_payment_corrections'
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().exec_driver_sql((Path(__file__).resolve().parents[2] / 'migrations' / 'stock_correction_revisions.sql').read_text())


def downgrade():
    raise RuntimeError('Stock correction history requires a forward-only rollback')
