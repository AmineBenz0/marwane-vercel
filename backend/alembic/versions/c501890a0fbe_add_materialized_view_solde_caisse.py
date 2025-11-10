"""add_materialized_view_solde_caisse

Revision ID: c501890a0fbe
Revises: 08d98041282c
Create Date: 2025-11-10 17:06:51.359111

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c501890a0fbe'
down_revision: Union[str, None] = '08d98041282c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the materialized view for cash balance
    op.execute("""
        CREATE MATERIALIZED VIEW Vue_Solde_Caisse AS
        SELECT 
            COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN montant ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN type_mouvement = 'SORTIE' THEN montant ELSE 0 END), 0) as solde_actuel,
            MAX(date_mouvement) as derniere_maj
        FROM caisse;
    """)
    
    # Create an index on the materialized view
    # Note: Since this view returns a single row, the index is mainly for consistency
    # and potential future use if the view structure changes
    op.execute("""
        CREATE UNIQUE INDEX idx_solde_caisse ON Vue_Solde_Caisse(solde_actuel);
    """)
    
    # Create a function to refresh the materialized view
    # Using regular REFRESH (not CONCURRENTLY) for better performance on a single-row view
    op.execute("""
        CREATE OR REPLACE FUNCTION refresh_vue_solde_caisse()
        RETURNS TRIGGER AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW Vue_Solde_Caisse;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    # Create a trigger that automatically refreshes the view after INSERT, UPDATE, or DELETE on caisse
    op.execute("""
        CREATE TRIGGER trigger_refresh_vue_solde_caisse
        AFTER INSERT OR UPDATE OR DELETE ON caisse
        FOR EACH ROW
        EXECUTE FUNCTION refresh_vue_solde_caisse();
    """)


def downgrade() -> None:
    # Drop the trigger
    op.execute("DROP TRIGGER IF EXISTS trigger_refresh_vue_solde_caisse ON caisse;")
    
    # Drop the function
    op.execute("DROP FUNCTION IF EXISTS refresh_vue_solde_caisse();")
    
    # Drop the index
    op.execute("DROP INDEX IF EXISTS idx_solde_caisse;")
    
    # Drop the materialized view
    op.execute("DROP MATERIALIZED VIEW IF EXISTS Vue_Solde_Caisse;")
