"""Add LC support

Revision ID: add_lc_support
Revises: 1a0871c43c7d
Create Date: 2026-03-15 17:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = 'add_lc_support'
down_revision: Union[str, None] = '1a0871c43c7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# NOTE: The schema produced by this migration is immediately modified by 
# 'phase1_lc_adjustments' which follows it, notably making 'banque_emettrice' 
# nullable and dropping 'date_expiration' to match the refined LC model.

def upgrade() -> None:
    # 1. Créer la table lettres_credit
    op.create_table(
        'lettres_credit',
        sa.Column('id_lc', sa.Integer(), nullable=False),
        sa.Column('numero_reference', sa.String(length=50), nullable=False),
        sa.Column('banque_emettrice', sa.String(length=100), nullable=False),
        sa.Column('montant', sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column('date_emission', sa.Date(), nullable=False),
        sa.Column('date_disponibilite', sa.Date(), nullable=False),
        sa.Column('date_expiration', sa.Date(), nullable=False),
        sa.Column('statut', sa.String(length=20), server_default='active', nullable=False),
        sa.Column('type_detenteur', sa.String(length=20), nullable=False),
        sa.Column('id_client', sa.Integer(), nullable=True),
        sa.Column('id_fournisseur', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('date_modification', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('id_utilisateur_creation', sa.Integer(), nullable=True),
        sa.Column('id_utilisateur_modification', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['id_client'], ['clients.id_client'], name='fk_lc_client'),
        sa.ForeignKeyConstraint(['id_fournisseur'], ['fournisseurs.id_fournisseur'], name='fk_lc_fournisseur'),
        sa.ForeignKeyConstraint(['id_utilisateur_creation'], ['utilisateurs.id_utilisateur'], name='fk_lc_user_creation'),
        sa.ForeignKeyConstraint(['id_utilisateur_modification'], ['utilisateurs.id_utilisateur'], name='fk_lc_user_modification'),
        sa.PrimaryKeyConstraint('id_lc'),
        sa.CheckConstraint('montant > 0', name='check_lc_montant_positif'),
        sa.CheckConstraint("statut IN ('active', 'utilisee', 'cedee', 'expiree', 'annulee')", name='check_lc_statut_valide'),
        sa.CheckConstraint("type_detenteur IN ('client', 'fournisseur')", name='check_lc_type_detenteur_valide'),
        sa.UniqueConstraint('numero_reference', name='uq_lc_numero_reference')
    )
    op.create_index('idx_lc_numero_ref', 'lettres_credit', ['numero_reference'])
    op.create_index('idx_lc_statut', 'lettres_credit', ['statut'])
    op.create_index('idx_lc_date_dispo', 'lettres_credit', ['date_disponibilite'])

    # 2. Créer la table cessions_lc
    op.create_table(
        'cessions_lc',
        sa.Column('id_cession', sa.Integer(), nullable=False),
        sa.Column('id_lc', sa.Integer(), nullable=False),
        sa.Column('type_cedant', sa.String(length=20), nullable=False),
        sa.Column('id_cedant_client', sa.Integer(), nullable=True),
        sa.Column('id_cedant_fournisseur', sa.Integer(), nullable=True),
        sa.Column('type_cessionnaire', sa.String(length=20), nullable=False),
        sa.Column('id_cessionnaire_client', sa.Integer(), nullable=True),
        sa.Column('id_cessionnaire_fournisseur', sa.Integer(), nullable=True),
        sa.Column('date_cession', sa.Date(), nullable=False),
        sa.Column('motif', sa.Text(), nullable=True),
        sa.Column('date_creation', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('id_utilisateur_creation', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['id_lc'], ['lettres_credit.id_lc'], name='fk_cession_lc', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['id_cedant_client'], ['clients.id_client'], name='fk_cession_cedant_client'),
        sa.ForeignKeyConstraint(['id_cedant_fournisseur'], ['fournisseurs.id_fournisseur'], name='fk_cession_cedant_fourn'),
        sa.ForeignKeyConstraint(['id_cessionnaire_client'], ['clients.id_client'], name='fk_cession_cess_client'),
        sa.ForeignKeyConstraint(['id_cessionnaire_fournisseur'], ['fournisseurs.id_fournisseur'], name='fk_cession_cess_fourn'),
        sa.ForeignKeyConstraint(['id_utilisateur_creation'], ['utilisateurs.id_utilisateur'], name='fk_cession_user'),
        sa.PrimaryKeyConstraint('id_cession')
    )
    op.create_index('idx_cession_lc_date', 'cessions_lc', ['date_cession'])

    # 3. Mettre à jour la table paiements
    # Ajouter la colonne id_lc
    op.add_column('paiements', sa.Column('id_lc', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_paiements_lc', 'paiements', 'lettres_credit', ['id_lc'], ['id_lc'])
    op.create_index('idx_paiements_id_lc', 'paiements', ['id_lc'])

    # Mettre à jour la contrainte CHECK pour type_paiement
    # Note: SQLite ne supporte pas l'altération de contraintes CHECK facilement. 
    # Mais ici on suppose PostgreSQL car psycopg2 est utilisé.
    op.execute("ALTER TABLE paiements DROP CONSTRAINT check_type_paiement_valide")
    op.execute("""
        ALTER TABLE paiements ADD CONSTRAINT check_type_paiement_valide 
        CHECK (type_paiement IN ('cash', 'cheque', 'virement', 'carte', 'traite', 'compensation', 'lc', 'autre'))
    """)


def downgrade() -> None:
    # 1. Revenir à la contrainte précédente sur paiements
    op.execute("ALTER TABLE paiements DROP CONSTRAINT check_type_paiement_valide")
    op.execute("""
        ALTER TABLE paiements ADD CONSTRAINT check_type_paiement_valide 
        CHECK (type_paiement IN ('cash', 'cheque', 'virement', 'carte', 'traite', 'compensation', 'autre'))
    """)

    # 2. Supprimer les ajouts dans paiements
    op.drop_index('idx_paiements_id_lc', table_name='paiements')
    op.drop_constraint('fk_paiements_lc', 'paiements', type_='foreignkey')
    op.drop_column('paiements', 'id_lc')

    # 3. Supprimer les tables
    op.drop_table('cessions_lc')
    op.drop_table('lettres_credit')
