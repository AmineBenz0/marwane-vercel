"""Initial migration

Revision ID: 51e530ae737a
Revises: 
Create Date: 2025-11-10 16:26:03.814749

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '51e530ae737a'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create utilisateurs table
    op.create_table(
        'utilisateurs',
        sa.Column('id_utilisateur', sa.Integer(), nullable=False),
        sa.Column('nom_utilisateur', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('mot_de_passe_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=True),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_modification', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id_utilisateur')
    )
    op.create_index(op.f('ix_utilisateurs_id_utilisateur'), 'utilisateurs', ['id_utilisateur'], unique=False)
    op.create_index(op.f('ix_utilisateurs_email'), 'utilisateurs', ['email'], unique=True)

    # Create clients table
    op.create_table(
        'clients',
        sa.Column('id_client', sa.Integer(), nullable=False),
        sa.Column('nom_client', sa.String(length=255), nullable=False),
        sa.Column('est_actif', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_modification', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id_utilisateur_creation', sa.Integer(), nullable=True),
        sa.Column('id_utilisateur_modification', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['id_utilisateur_creation'], ['utilisateurs.id_utilisateur'], ),
        sa.ForeignKeyConstraint(['id_utilisateur_modification'], ['utilisateurs.id_utilisateur'], ),
        sa.PrimaryKeyConstraint('id_client')
    )
    op.create_index(op.f('ix_clients_id_client'), 'clients', ['id_client'], unique=False)

    # Create fournisseurs table
    op.create_table(
        'fournisseurs',
        sa.Column('id_fournisseur', sa.Integer(), nullable=False),
        sa.Column('nom_fournisseur', sa.String(length=255), nullable=False),
        sa.Column('est_actif', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_modification', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id_utilisateur_creation', sa.Integer(), nullable=True),
        sa.Column('id_utilisateur_modification', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['id_utilisateur_creation'], ['utilisateurs.id_utilisateur'], ),
        sa.ForeignKeyConstraint(['id_utilisateur_modification'], ['utilisateurs.id_utilisateur'], ),
        sa.PrimaryKeyConstraint('id_fournisseur')
    )
    op.create_index(op.f('ix_fournisseurs_id_fournisseur'), 'fournisseurs', ['id_fournisseur'], unique=False)

    # Create produits table
    op.create_table(
        'produits',
        sa.Column('id_produit', sa.Integer(), nullable=False),
        sa.Column('nom_produit', sa.String(length=255), nullable=False),
        sa.Column('est_actif', sa.Boolean(), nullable=False, server_default='true'),
        sa.PrimaryKeyConstraint('id_produit'),
        sa.UniqueConstraint('nom_produit')
    )
    op.create_index(op.f('ix_produits_id_produit'), 'produits', ['id_produit'], unique=False)

    # Create transactions table
    op.create_table(
        'transactions',
        sa.Column('id_transaction', sa.Integer(), nullable=False),
        sa.Column('date_transaction', sa.Date(), nullable=False),
        sa.Column('montant_total', sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column('est_actif', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('id_client', sa.Integer(), nullable=True),
        sa.Column('id_fournisseur', sa.Integer(), nullable=True),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_modification', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id_utilisateur_creation', sa.Integer(), nullable=True),
        sa.Column('id_utilisateur_modification', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['id_client'], ['clients.id_client'], ),
        sa.ForeignKeyConstraint(['id_fournisseur'], ['fournisseurs.id_fournisseur'], ),
        sa.ForeignKeyConstraint(['id_utilisateur_creation'], ['utilisateurs.id_utilisateur'], ),
        sa.ForeignKeyConstraint(['id_utilisateur_modification'], ['utilisateurs.id_utilisateur'], ),
        sa.PrimaryKeyConstraint('id_transaction')
    )
    op.create_index(op.f('ix_transactions_id_transaction'), 'transactions', ['id_transaction'], unique=False)
    op.create_index(op.f('ix_transactions_date_transaction'), 'transactions', ['date_transaction'], unique=False)
    op.create_index(op.f('ix_transactions_id_client'), 'transactions', ['id_client'], unique=False)
    op.create_index(op.f('ix_transactions_id_fournisseur'), 'transactions', ['id_fournisseur'], unique=False)

    # Create lignes_transaction table
    op.create_table(
        'lignes_transaction',
        sa.Column('id_ligne_transaction', sa.Integer(), nullable=False),
        sa.Column('id_transaction', sa.Integer(), nullable=False),
        sa.Column('id_produit', sa.Integer(), nullable=False),
        sa.Column('quantite', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['id_produit'], ['produits.id_produit'], ),
        sa.ForeignKeyConstraint(['id_transaction'], ['transactions.id_transaction'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id_ligne_transaction')
    )
    op.create_index(op.f('ix_lignes_transaction_id_ligne_transaction'), 'lignes_transaction', ['id_ligne_transaction'], unique=False)
    op.create_index(op.f('ix_lignes_transaction_id_transaction'), 'lignes_transaction', ['id_transaction'], unique=False)
    op.create_index(op.f('ix_lignes_transaction_id_produit'), 'lignes_transaction', ['id_produit'], unique=False)

    # Create caisse table
    op.create_table(
        'caisse',
        sa.Column('id_mouvement', sa.Integer(), nullable=False),
        sa.Column('date_mouvement', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('montant', sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column('type_mouvement', sa.String(length=10), nullable=False),
        sa.Column('id_transaction', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['id_transaction'], ['transactions.id_transaction'], ),
        sa.PrimaryKeyConstraint('id_mouvement'),
        sa.CheckConstraint('montant > 0', name='check_montant_caisse_positif'),
        sa.CheckConstraint("type_mouvement IN ('ENTREE', 'SORTIE')", name='check_type_mouvement')
    )
    op.create_index(op.f('ix_caisse_id_mouvement'), 'caisse', ['id_mouvement'], unique=False)
    op.create_index(op.f('ix_caisse_date_mouvement'), 'caisse', ['date_mouvement'], unique=False)
    op.create_index(op.f('ix_caisse_id_transaction'), 'caisse', ['id_transaction'], unique=False)

    # Create caisse_solde_historique table
    op.create_table(
        'caisse_solde_historique',
        sa.Column('id_historique', sa.Integer(), nullable=False),
        sa.Column('date_snapshot', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('solde', sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column('id_mouvement', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['id_mouvement'], ['caisse.id_mouvement'], ),
        sa.PrimaryKeyConstraint('id_historique')
    )
    op.create_index(op.f('ix_caisse_solde_historique_id_historique'), 'caisse_solde_historique', ['id_historique'], unique=False)
    op.create_index(op.f('ix_caisse_solde_historique_date_snapshot'), 'caisse_solde_historique', ['date_snapshot'], unique=False)
    op.create_index(op.f('ix_caisse_solde_historique_id_mouvement'), 'caisse_solde_historique', ['id_mouvement'], unique=False)

    # Create transactions_audit table
    op.create_table(
        'transactions_audit',
        sa.Column('id_audit', sa.Integer(), nullable=False),
        sa.Column('id_transaction', sa.Integer(), nullable=False),
        sa.Column('id_utilisateur', sa.Integer(), nullable=False),
        sa.Column('date_changement', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('champ_modifie', sa.String(length=255), nullable=True),
        sa.Column('ancienne_valeur', sa.Text(), nullable=True),
        sa.Column('nouvelle_valeur', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['id_transaction'], ['transactions.id_transaction'], ),
        sa.ForeignKeyConstraint(['id_utilisateur'], ['utilisateurs.id_utilisateur'], ),
        sa.PrimaryKeyConstraint('id_audit')
    )
    op.create_index(op.f('ix_transactions_audit_id_audit'), 'transactions_audit', ['id_audit'], unique=False)
    op.create_index(op.f('ix_transactions_audit_id_transaction'), 'transactions_audit', ['id_transaction'], unique=False)
    op.create_index(op.f('ix_transactions_audit_date_changement'), 'transactions_audit', ['date_changement'], unique=False)

    # Create audit_connexions table
    op.create_table(
        'audit_connexions',
        sa.Column('id_audit_connexion', sa.Integer(), nullable=False),
        sa.Column('email_utilisateur', sa.String(length=255), nullable=False),
        sa.Column('date_tentative', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('succes', sa.Boolean(), nullable=False),
        sa.Column('adresse_ip', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id_audit_connexion')
    )
    op.create_index(op.f('ix_audit_connexions_id_audit_connexion'), 'audit_connexions', ['id_audit_connexion'], unique=False)
    op.create_index(op.f('ix_audit_connexions_email_utilisateur'), 'audit_connexions', ['email_utilisateur'], unique=False)
    op.create_index(op.f('ix_audit_connexions_date_tentative'), 'audit_connexions', ['date_tentative'], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign key constraints)
    op.drop_index(op.f('ix_audit_connexions_date_tentative'), table_name='audit_connexions')
    op.drop_index(op.f('ix_audit_connexions_email_utilisateur'), table_name='audit_connexions')
    op.drop_index(op.f('ix_audit_connexions_id_audit_connexion'), table_name='audit_connexions')
    op.drop_table('audit_connexions')
    
    op.drop_index(op.f('ix_transactions_audit_date_changement'), table_name='transactions_audit')
    op.drop_index(op.f('ix_transactions_audit_id_transaction'), table_name='transactions_audit')
    op.drop_index(op.f('ix_transactions_audit_id_audit'), table_name='transactions_audit')
    op.drop_table('transactions_audit')
    
    op.drop_index(op.f('ix_caisse_solde_historique_id_mouvement'), table_name='caisse_solde_historique')
    op.drop_index(op.f('ix_caisse_solde_historique_date_snapshot'), table_name='caisse_solde_historique')
    op.drop_index(op.f('ix_caisse_solde_historique_id_historique'), table_name='caisse_solde_historique')
    op.drop_table('caisse_solde_historique')
    
    op.drop_index(op.f('ix_caisse_id_transaction'), table_name='caisse')
    op.drop_index(op.f('ix_caisse_date_mouvement'), table_name='caisse')
    op.drop_index(op.f('ix_caisse_id_mouvement'), table_name='caisse')
    op.drop_table('caisse')
    
    op.drop_index(op.f('ix_lignes_transaction_id_produit'), table_name='lignes_transaction')
    op.drop_index(op.f('ix_lignes_transaction_id_transaction'), table_name='lignes_transaction')
    op.drop_index(op.f('ix_lignes_transaction_id_ligne_transaction'), table_name='lignes_transaction')
    op.drop_table('lignes_transaction')
    
    op.drop_index(op.f('ix_transactions_id_fournisseur'), table_name='transactions')
    op.drop_index(op.f('ix_transactions_id_client'), table_name='transactions')
    op.drop_index(op.f('ix_transactions_date_transaction'), table_name='transactions')
    op.drop_index(op.f('ix_transactions_id_transaction'), table_name='transactions')
    op.drop_table('transactions')
    
    op.drop_index(op.f('ix_produits_id_produit'), table_name='produits')
    op.drop_table('produits')
    
    op.drop_index(op.f('ix_fournisseurs_id_fournisseur'), table_name='fournisseurs')
    op.drop_table('fournisseurs')
    
    op.drop_index(op.f('ix_clients_id_client'), table_name='clients')
    op.drop_table('clients')
    
    op.drop_index(op.f('ix_utilisateurs_email'), table_name='utilisateurs')
    op.drop_index(op.f('ix_utilisateurs_id_utilisateur'), table_name='utilisateurs')
    op.drop_table('utilisateurs')
