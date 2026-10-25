"""Add first-class promise metadata to egg sales.

Revision ID: 4f9c2b7a1d30
Revises: 01aa6010b368
"""
from alembic import op
import sqlalchemy as sa


revision = "4f9c2b7a1d30"
down_revision = "01aa6010b368"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("transactions")}
    if "est_promesse" not in columns:
        op.add_column("transactions", sa.Column(
            "est_promesse", sa.Boolean(), nullable=False, server_default=sa.false()
        ))
    if "date_livraison_prevue" not in columns:
        op.add_column("transactions", sa.Column(
            "date_livraison_prevue", sa.Date(), nullable=True
        ))
    indexes = {index["name"] for index in inspector.get_indexes("transactions")}
    if "ix_transactions_date_livraison_prevue" not in indexes:
        op.create_index(
            "ix_transactions_date_livraison_prevue",
            "transactions",
            ["date_livraison_prevue"],
        )


def downgrade() -> None:
    op.drop_index("ix_transactions_date_livraison_prevue", table_name="transactions")
    op.drop_column("transactions", "date_livraison_prevue")
    op.drop_column("transactions", "est_promesse")
