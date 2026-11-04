"""Audited cheque and linked LC corrections."""
from pathlib import Path
from alembic import op

revision = 'instrument_corrections'
down_revision = 'party_advances_credit_allocation'
branch_labels = None
depends_on = None


def upgrade():
    source = Path(__file__).resolve().parents[2] / 'migrations' / 'instrument_corrections.sql'
    # psycopg2 interprets PL/pgSQL format markers like %I as DBAPI binds.
    # Escape driver-level percents, not the stored migration source itself.
    bind = op.get_bind()
    sql = source.read_text()
    if bind.dialect.paramstyle in {"format", "pyformat"}:
        sql = sql.replace("%", "%%")
    bind.exec_driver_sql(sql)


def downgrade():
    raise RuntimeError('Use a forward correction; never discard instrument history')
