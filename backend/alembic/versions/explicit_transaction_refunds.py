"""Add explicit positive-valued transaction refunds."""
from pathlib import Path
from alembic import op

revision = 'explicit_transaction_refunds'
down_revision = 'stock_correction_revisions'
branch_labels = None
depends_on = None


def upgrade():
    source = Path(__file__).resolve().parents[2] / 'migrations' / 'explicit_transaction_refunds.sql'
    # psycopg2 interprets PL/pgSQL format markers like %I as DBAPI binds.
    # Escape driver-level percents, not the stored migration source itself.
    bind = op.get_bind()
    sql = source.read_text()
    if bind.dialect.paramstyle in {"format", "pyformat"}:
        sql = sql.replace("%", "%%")
    bind.exec_driver_sql(sql)


def downgrade():
    raise RuntimeError('Refund history requires a forward-only rollback; never discard settlement records')
