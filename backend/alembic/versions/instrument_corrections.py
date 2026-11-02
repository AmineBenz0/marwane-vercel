"""Audited cheque and linked LC corrections."""
from pathlib import Path
from alembic import op

revision = 'instrument_corrections'
down_revision = 'party_advances_credit_allocation'
branch_labels = None
depends_on = None


def upgrade():
    source = Path(__file__).resolve().parents[2] / 'migrations' / 'instrument_corrections.sql'
    op.get_bind().exec_driver_sql(source.read_text())


def downgrade():
    raise RuntimeError('Use a forward correction; never discard instrument history')
