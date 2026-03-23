"""fix caisse view and constraints

Revision ID: fix_caisse_view_constraints
Revises: bank_and_charge_updates
Create Date: 2026-03-21 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fix_caisse_view_constraints'
down_revision = 'bank_and_charge_updates'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Replace Materialized View with a plain View to avoid locking on refresh
    op.execute("DROP TRIGGER IF EXISTS trigger_refresh_vue_solde_caisse ON caisse;")
    op.execute("DROP FUNCTION IF EXISTS refresh_vue_solde_caisse();")
    op.execute("DROP INDEX IF EXISTS idx_solde_caisse;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS Vue_Solde_Caisse;")
    
    op.execute("""
        CREATE VIEW Vue_Solde_Caisse AS
        SELECT 
            COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN montant ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN type_mouvement = 'SORTIE' THEN montant ELSE 0 END), 0) as solde_actuel,
            MAX(date_mouvement) as derniere_maj
        FROM caisse;
    """)

    # 2. Add mutual exclusion constraint on caisse table
    # A movement belongs to either (transaction OR paiement) OR a charge.
    # Note: initial migration made id_transaction NOT NULL. 
    # To support charges, we first need to make id_transaction nullable.
    op.alter_column('caisse', 'id_transaction', existing_type=sa.Integer(), nullable=True)
    
    op.create_check_constraint(
        'check_caisse_mutual_exclusion',
        'caisse',
        "(id_charge IS NOT NULL AND id_transaction IS NULL AND id_paiement IS NULL) OR "
        "(id_charge IS NULL AND (id_transaction IS NOT NULL OR id_paiement IS NOT NULL))"
    )


def downgrade():
    # 1. Remove check constraint and restore NOT NULL
    op.drop_constraint('check_caisse_mutual_exclusion', 'caisse', type_='check')
    op.alter_column('caisse', 'id_transaction', existing_type=sa.Integer(), nullable=False)

    # 2. Restore Materialized View (legacy behavior)
    op.execute("DROP VIEW IF EXISTS Vue_Solde_Caisse;")
    
    op.execute("""
        CREATE MATERIALIZED VIEW Vue_Solde_Caisse AS
        SELECT 
            COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN montant ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN type_mouvement = 'SORTIE' THEN montant ELSE 0 END), 0) as solde_actuel,
            MAX(date_mouvement) as derniere_maj
        FROM caisse;
    """)
    op.execute("CREATE UNIQUE INDEX idx_solde_caisse ON Vue_Solde_Caisse(solde_actuel);")
    op.execute("""
        CREATE OR REPLACE FUNCTION refresh_vue_solde_caisse()
        RETURNS TRIGGER AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW Vue_Solde_Caisse;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trigger_refresh_vue_solde_caisse
        AFTER INSERT OR UPDATE OR DELETE ON caisse
        FOR EACH ROW
        EXECUTE FUNCTION refresh_vue_solde_caisse();
    """)
