"""Add prix_unitaire to lignes_transaction

Revision ID: 004_add_prix_unitaire
Revises: 2be88a19e3e2
Create Date: 2025-11-14

This migration adds the prix_unitaire column to the lignes_transaction table.
The column is nullable to keep existing records valid.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "004_add_prix_unitaire"
down_revision = "2be88a19e3e2"
branch_labels = None
depends_on = None


def upgrade():
  """
  Add prix_unitaire column to the lignes_transaction table.

  Uses IF NOT EXISTS to be idempotent in case the column was already created.
  """
  op.execute(
    """
    ALTER TABLE lignes_transaction
    ADD COLUMN IF NOT EXISTS prix_unitaire NUMERIC(15, 2);
    """
  )


def downgrade():
  """
  Remove prix_unitaire column from the lignes_transaction table.
  """
  op.execute(
    """
    ALTER TABLE lignes_transaction
    DROP COLUMN IF EXISTS prix_unitaire;
    """
  )


