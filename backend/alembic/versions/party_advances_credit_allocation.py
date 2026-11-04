"""Add explicit party advances and paired non-cash credit allocations."""
from pathlib import Path
from alembic import op

revision = 'party_advances_credit_allocation'
down_revision = 'explicit_transaction_refunds'
branch_labels = None
depends_on = None


def upgrade():
    source = Path(__file__).resolve().parents[2] / 'migrations' / 'party_advances_credit_allocation.sql'
    # psycopg2 interprets PL/pgSQL format markers like %I as DBAPI binds.
    # Escape driver-level percents, not the stored migration source itself.
    bind = op.get_bind()
    sql = source.read_text()
    if bind.dialect.paramstyle in {"format", "pyformat"}:
        sql = sql.replace("%", "%%")
    bind.exec_driver_sql(sql)


def downgrade():
    raise RuntimeError('Credit history requires a forward-only rollback; never discard settlement records')
