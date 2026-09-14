"""add production operational fields

Revision ID: 7f3e9a2b1c4d
Revises: 418e5bb36fb5
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa


revision = "7f3e9a2b1c4d"
down_revision = "418e5bb36fb5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("productions", sa.Column("mortalite", sa.Integer(), nullable=True))
    op.add_column("productions", sa.Column("consommation_aliment_kg", sa.Numeric(10, 2), nullable=True))
    op.add_column("productions", sa.Column("formule", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("productions", "formule")
    op.drop_column("productions", "consommation_aliment_kg")
    op.drop_column("productions", "mortalite")
