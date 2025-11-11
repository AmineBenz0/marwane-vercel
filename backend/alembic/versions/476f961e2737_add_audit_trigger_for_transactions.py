"""add_audit_trigger_for_transactions

Revision ID: 476f961e2737
Revises: c501890a0fbe
Create Date: 2025-11-10 20:04:46.485589

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '476f961e2737'
down_revision: Union[str, None] = 'c501890a0fbe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    """
    Crée la fonction PostgreSQL et le trigger pour l'audit automatique des modifications
    de transactions.
    
    La fonction audit_transaction_changes() :
    - Compare les valeurs OLD et NEW pour chaque champ modifié
    - Enregistre chaque changement dans transactions_audit
    - Utilise id_utilisateur_modification depuis NEW (défini par l'application)
      ou une variable de session comme fallback
    """
    # Créer la fonction d'audit
    op.execute("""
        CREATE OR REPLACE FUNCTION audit_transaction_changes()
        RETURNS TRIGGER AS $$
        DECLARE
            user_id INTEGER;
        BEGIN
            -- Récupérer l'ID utilisateur avec une chaîne de fallback :
            -- 1. id_utilisateur_modification (défini par l'application lors des mises à jour)
            -- 2. id_utilisateur_creation (utilisateur qui a créé la transaction)
            -- 3. Variable de session app.user_id (si définie par l'application)
            -- 4. Si toujours NULL, utiliser 0 comme valeur par défaut (utilisateur système)
            --    Note: Cela garantit que la contrainte NOT NULL est respectée
            user_id := COALESCE(
                NEW.id_utilisateur_modification,
                NEW.id_utilisateur_creation,
                NULLIF(current_setting('app.user_id', TRUE), '')::INTEGER,
                0  -- Utilisateur système par défaut si aucun utilisateur n'est trouvé
            );
            
            -- Vérifier chaque champ et enregistrer les modifications
            -- date_transaction
            IF OLD.date_transaction IS DISTINCT FROM NEW.date_transaction THEN
                INSERT INTO transactions_audit (
                    id_transaction,
                    id_utilisateur,
                    date_changement,
                    champ_modifie,
                    ancienne_valeur,
                    nouvelle_valeur
                ) VALUES (
                    NEW.id_transaction,
                    user_id,
                    NOW(),
                    'date_transaction',
                    OLD.date_transaction::TEXT,
                    NEW.date_transaction::TEXT
                );
            END IF;
            
            -- montant_total
            IF OLD.montant_total IS DISTINCT FROM NEW.montant_total THEN
                INSERT INTO transactions_audit (
                    id_transaction,
                    id_utilisateur,
                    date_changement,
                    champ_modifie,
                    ancienne_valeur,
                    nouvelle_valeur
                ) VALUES (
                    NEW.id_transaction,
                    user_id,
                    NOW(),
                    'montant_total',
                    OLD.montant_total::TEXT,
                    NEW.montant_total::TEXT
                );
            END IF;
            
            -- est_actif
            IF OLD.est_actif IS DISTINCT FROM NEW.est_actif THEN
                INSERT INTO transactions_audit (
                    id_transaction,
                    id_utilisateur,
                    date_changement,
                    champ_modifie,
                    ancienne_valeur,
                    nouvelle_valeur
                ) VALUES (
                    NEW.id_transaction,
                    user_id,
                    NOW(),
                    'est_actif',
                    OLD.est_actif::TEXT,
                    NEW.est_actif::TEXT
                );
            END IF;
            
            -- id_client
            IF OLD.id_client IS DISTINCT FROM NEW.id_client THEN
                INSERT INTO transactions_audit (
                    id_transaction,
                    id_utilisateur,
                    date_changement,
                    champ_modifie,
                    ancienne_valeur,
                    nouvelle_valeur
                ) VALUES (
                    NEW.id_transaction,
                    user_id,
                    NOW(),
                    'id_client',
                    COALESCE(OLD.id_client::TEXT, 'NULL'),
                    COALESCE(NEW.id_client::TEXT, 'NULL')
                );
            END IF;
            
            -- id_fournisseur
            IF OLD.id_fournisseur IS DISTINCT FROM NEW.id_fournisseur THEN
                INSERT INTO transactions_audit (
                    id_transaction,
                    id_utilisateur,
                    date_changement,
                    champ_modifie,
                    ancienne_valeur,
                    nouvelle_valeur
                ) VALUES (
                    NEW.id_transaction,
                    user_id,
                    NOW(),
                    'id_fournisseur',
                    COALESCE(OLD.id_fournisseur::TEXT, 'NULL'),
                    COALESCE(NEW.id_fournisseur::TEXT, 'NULL')
                );
            END IF;
            
            -- id_utilisateur_creation (peut être modifié manuellement)
            IF OLD.id_utilisateur_creation IS DISTINCT FROM NEW.id_utilisateur_creation THEN
                INSERT INTO transactions_audit (
                    id_transaction,
                    id_utilisateur,
                    date_changement,
                    champ_modifie,
                    ancienne_valeur,
                    nouvelle_valeur
                ) VALUES (
                    NEW.id_transaction,
                    user_id,
                    NOW(),
                    'id_utilisateur_creation',
                    COALESCE(OLD.id_utilisateur_creation::TEXT, 'NULL'),
                    COALESCE(NEW.id_utilisateur_creation::TEXT, 'NULL')
                );
            END IF;
            
            -- id_utilisateur_modification (peut être modifié manuellement)
            IF OLD.id_utilisateur_modification IS DISTINCT FROM NEW.id_utilisateur_modification THEN
                INSERT INTO transactions_audit (
                    id_transaction,
                    id_utilisateur,
                    date_changement,
                    champ_modifie,
                    ancienne_valeur,
                    nouvelle_valeur
                ) VALUES (
                    NEW.id_transaction,
                    user_id,
                    NOW(),
                    'id_utilisateur_modification',
                    COALESCE(OLD.id_utilisateur_modification::TEXT, 'NULL'),
                    COALESCE(NEW.id_utilisateur_modification::TEXT, 'NULL')
                );
            END IF;
            
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    # Créer le trigger sur la table transactions
    op.execute("""
        CREATE TRIGGER trigger_audit_transactions
        AFTER UPDATE ON transactions
        FOR EACH ROW
        EXECUTE FUNCTION audit_transaction_changes();
    """)


def downgrade() -> None:
    """
    Supprime le trigger et la fonction d'audit.
    """
    # Supprimer le trigger
    op.execute("DROP TRIGGER IF EXISTS trigger_audit_transactions ON transactions;")
    
    # Supprimer la fonction
    op.execute("DROP FUNCTION IF EXISTS audit_transaction_changes();")
