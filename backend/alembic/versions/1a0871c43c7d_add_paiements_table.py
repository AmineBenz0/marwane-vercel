"""add_paiements_table

Revision ID: 1a0871c43c7d
Revises: 005_flatten_transactions
Create Date: 2025-11-23 11:27:23.784127

Cette migration ajoute:
1. Colonne date_echeance dans la table transactions
2. Nouvelle table paiements pour gérer les paiements multiples par transaction
3. Contraintes et index pour la table paiements

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1a0871c43c7d'
down_revision: Union[str, None] = '005_flatten_transactions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Ajoute la colonne date_echeance à transactions et crée la table paiements.
    """
    # 1. Ajouter la colonne date_echeance à la table transactions (si elle n'existe pas déjà)
    from sqlalchemy import inspect
    from alembic import context
    
    # Obtenir la connexion
    connection = context.get_bind()
    inspector = inspect(connection)
    
    # Vérifier si la colonne date_echeance existe déjà
    columns = [col['name'] for col in inspector.get_columns('transactions')]
    if 'date_echeance' not in columns:
        op.add_column(
            'transactions',
            sa.Column('date_echeance', sa.Date(), nullable=True, comment='Date limite de paiement')
        )
        
        # Créer un index sur date_echeance
        op.create_index(
            'idx_transactions_date_echeance',
            'transactions',
            ['date_echeance']
        )
    
    # 2. Créer la table paiements (si elle n'existe pas déjà)
    tables = inspector.get_table_names()
    if 'paiements' in tables:
        # La table existe déjà, ne rien faire
        return
    
    # Créer la table paiements
    op.create_table(
        'paiements',
        # Identifiants
        sa.Column('id_paiement', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('id_transaction', sa.Integer(), nullable=False),
        
        # Informations de base du paiement
        sa.Column('date_paiement', sa.Date(), nullable=False, comment='Date du paiement'),
        sa.Column('montant', sa.Numeric(precision=15, scale=2), nullable=False, comment='Montant du paiement'),
        sa.Column('type_paiement', sa.String(length=20), nullable=False, comment='Type de paiement (cash, cheque, virement, etc.)'),
        
        # Informations pour les chèques
        sa.Column('numero_cheque', sa.String(length=50), nullable=True, comment='Numéro du chèque'),
        sa.Column('banque', sa.String(length=100), nullable=True, comment='Banque émettrice du chèque'),
        sa.Column('date_encaissement_prevue', sa.Date(), nullable=True, comment='Date prévue d\'encaissement du chèque'),
        sa.Column('date_encaissement_effective', sa.Date(), nullable=True, comment='Date effective d\'encaissement du chèque'),
        sa.Column('statut_cheque', sa.String(length=20), nullable=True, comment='Statut du chèque (emis, a_encaisser, encaisse, rejete, annule)'),
        sa.Column('motif_rejet', sa.Text(), nullable=True, comment='Motif du rejet si le chèque est rejeté'),
        
        # Informations pour les virements
        sa.Column('reference_virement', sa.String(length=100), nullable=True, comment='Référence du virement bancaire'),
        
        # Informations générales
        sa.Column('notes', sa.Text(), nullable=True, comment='Notes ou commentaires additionnels'),
        sa.Column('statut', sa.String(length=20), nullable=False, server_default='valide', comment='Statut du paiement (valide, en_attente, rejete, annule)'),
        
        # Métadonnées de traçabilité
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('date_modification', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column('id_utilisateur_creation', sa.Integer(), nullable=True),
        sa.Column('id_utilisateur_modification', sa.Integer(), nullable=True),
        
        # Clés primaires et étrangères
        sa.PrimaryKeyConstraint('id_paiement'),
        sa.ForeignKeyConstraint(
            ['id_transaction'],
            ['transactions.id_transaction'],
            name='fk_paiements_transaction',
            ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['id_utilisateur_creation'],
            ['utilisateurs.id_utilisateur'],
            name='fk_paiements_utilisateur_creation'
        ),
        sa.ForeignKeyConstraint(
            ['id_utilisateur_modification'],
            ['utilisateurs.id_utilisateur'],
            name='fk_paiements_utilisateur_modification'
        ),
        
        # Contraintes de validation
        sa.CheckConstraint('montant > 0', name='check_paiement_montant_positif'),
        sa.CheckConstraint(
            "type_paiement IN ('cash', 'cheque', 'virement', 'carte', 'traite', 'compensation', 'autre')",
            name='check_type_paiement_valide'
        ),
        sa.CheckConstraint(
            "statut IN ('valide', 'en_attente', 'rejete', 'annule')",
            name='check_statut_paiement_valide'
        ),
        sa.CheckConstraint(
            "statut_cheque IS NULL OR statut_cheque IN ('emis', 'a_encaisser', 'encaisse', 'rejete', 'annule')",
            name='check_statut_cheque_valide'
        )
    )
    
    # 3. Créer les index pour optimiser les requêtes
    op.create_index('idx_paiements_id_transaction', 'paiements', ['id_transaction'])
    op.create_index('idx_paiements_date_paiement', 'paiements', ['date_paiement'])
    op.create_index('idx_paiements_type_paiement', 'paiements', ['type_paiement'])
    op.create_index('idx_paiements_numero_cheque', 'paiements', ['numero_cheque'], unique=False)


def downgrade() -> None:
    """
    Supprime la table paiements et la colonne date_echeance de transactions.
    """
    # Supprimer les index
    op.drop_index('idx_paiements_numero_cheque', table_name='paiements')
    op.drop_index('idx_paiements_type_paiement', table_name='paiements')
    op.drop_index('idx_paiements_date_paiement', table_name='paiements')
    op.drop_index('idx_paiements_id_transaction', table_name='paiements')
    
    # Supprimer la table paiements
    op.drop_table('paiements')
    
    # Supprimer l'index et la colonne date_echeance de transactions
    op.drop_index('idx_transactions_date_echeance', table_name='transactions')
    op.drop_column('transactions', 'date_echeance')
