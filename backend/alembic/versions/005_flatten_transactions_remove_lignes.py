"""Flatten transactions: move ligne fields to transactions and remove lignes_transaction table

Revision ID: 005_flatten_transactions
Revises: 004_add_prix_unitaire
Create Date: 2025-11-15

This migration simplifies the data model by treating each line as an independent transaction.
Changes:
1. Add id_produit, quantite, prix_unitaire to transactions table
2. Migrate existing data: explode multi-line transactions into separate transactions
3. Drop lignes_transaction table
4. Update constraints and indexes
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = '005_flatten_transactions'
down_revision = '004_add_prix_unitaire'
branch_labels = None
depends_on = None


def upgrade():
    """
    Flatten the transaction model: 1 line = 1 transaction.
    """
    connection = op.get_bind()
    
    # Step 1: Add new columns to transactions table
    print("Step 1: Adding new columns to transactions table...")
    op.add_column('transactions', 
        sa.Column('id_produit', sa.Integer(), nullable=True)
    )
    op.add_column('transactions', 
        sa.Column('quantite', sa.Integer(), nullable=True)
    )
    op.add_column('transactions', 
        sa.Column('prix_unitaire', sa.Numeric(precision=15, scale=2), nullable=True)
    )
    
    # Step 2: Migrate existing data
    print("Step 2: Migrating existing data (exploding multi-line transactions)...")
    
    # Get all transactions with their lines
    result = connection.execute(text("""
        SELECT 
            t.id_transaction,
            t.date_transaction,
            t.est_actif,
            t.id_client,
            t.id_fournisseur,
            t.date_creation,
            t.date_modification,
            t.id_utilisateur_creation,
            t.id_utilisateur_modification,
            lt.id_ligne_transaction,
            lt.id_produit,
            lt.quantite,
            lt.prix_unitaire
        FROM transactions t
        LEFT JOIN lignes_transaction lt ON t.id_transaction = lt.id_transaction
        ORDER BY t.id_transaction, lt.id_ligne_transaction
    """))
    
    transactions_data = result.fetchall()
    
    # Group by transaction
    transactions_by_id = {}
    for row in transactions_data:
        tx_id = row[0]
        if tx_id not in transactions_by_id:
            transactions_by_id[tx_id] = {
                'transaction': row[:9],  # Transaction fields
                'lignes': []
            }
        if row[9] is not None:  # id_ligne_transaction exists
            transactions_by_id[tx_id]['lignes'].append({
                'id_ligne_transaction': row[9],
                'id_produit': row[10],
                'quantite': row[11],
                'prix_unitaire': row[12]
            })
    
    # Process each transaction
    transactions_to_delete = []
    new_transactions = []
    
    for tx_id, data in transactions_by_id.items():
        tx_data = data['transaction']
        lignes = data['lignes']
        
        if len(lignes) == 0:
            # Transaction without lines: keep as is (will be handled later if needed)
            print(f"  ⚠️  Transaction #{tx_id} has no lines, keeping as is")
            continue
        elif len(lignes) == 1:
            # Transaction with 1 line: update in place
            ligne = lignes[0]
            connection.execute(text("""
                UPDATE transactions
                SET id_produit = :id_produit,
                    quantite = :quantite,
                    prix_unitaire = :prix_unitaire,
                    montant_total = :quantite * :prix_unitaire
                WHERE id_transaction = :id_transaction
            """), {
                'id_transaction': tx_id,
                'id_produit': ligne['id_produit'],
                'quantite': ligne['quantite'],
                'prix_unitaire': ligne['prix_unitaire']
            })
            print(f"  ✓ Transaction #{tx_id}: updated with 1 line")
        else:
            # Transaction with multiple lines: keep first line in place, create new transactions for others
            transactions_to_delete.append(tx_id)
            
            for idx, ligne in enumerate(lignes):
                montant = float(ligne['quantite']) * float(ligne['prix_unitaire'] or 0)
                
                if idx == 0:
                    # Update the original transaction with the first line
                    connection.execute(text("""
                        UPDATE transactions
                        SET id_produit = :id_produit,
                            quantite = :quantite,
                            prix_unitaire = :prix_unitaire,
                            montant_total = :montant_total
                        WHERE id_transaction = :id_transaction
                    """), {
                        'id_transaction': tx_id,
                        'id_produit': ligne['id_produit'],
                        'quantite': ligne['quantite'],
                        'prix_unitaire': ligne['prix_unitaire'],
                        'montant_total': montant
                    })
                    
                    # Update the associated caisse movement
                    connection.execute(text("""
                        UPDATE caisse
                        SET montant = :montant
                        WHERE id_transaction = :id_transaction
                    """), {
                        'id_transaction': tx_id,
                        'montant': montant
                    })
                    
                    print(f"  ✓ Transaction #{tx_id}: updated with line 1/{len(lignes)}")
                else:
                    # Create new transaction for additional lines
                    new_tx = {
                        'date_transaction': tx_data[1],
                        'montant_total': montant,
                        'est_actif': tx_data[2],
                        'id_client': tx_data[3],
                        'id_fournisseur': tx_data[4],
                        'date_creation': tx_data[5],
                        'date_modification': tx_data[6],
                        'id_utilisateur_creation': tx_data[7],
                        'id_utilisateur_modification': tx_data[8],
                        'id_produit': ligne['id_produit'],
                        'quantite': ligne['quantite'],
                        'prix_unitaire': ligne['prix_unitaire']
                    }
                    new_transactions.append(new_tx)
    
    # Insert new transactions
    if new_transactions:
        print(f"  ➕ Creating {len(new_transactions)} new transactions from multi-line transactions...")
        for new_tx in new_transactions:
            result = connection.execute(text("""
                INSERT INTO transactions (
                    date_transaction, montant_total, est_actif, id_client, id_fournisseur,
                    date_creation, date_modification, id_utilisateur_creation, id_utilisateur_modification,
                    id_produit, quantite, prix_unitaire
                ) VALUES (
                    :date_transaction, :montant_total, :est_actif, :id_client, :id_fournisseur,
                    :date_creation, :date_modification, :id_utilisateur_creation, :id_utilisateur_modification,
                    :id_produit, :quantite, :prix_unitaire
                )
                RETURNING id_transaction
            """), new_tx)
            
            new_id = result.fetchone()[0]
            
            # Create corresponding caisse movement
            type_mouvement = 'ENTREE' if new_tx['id_client'] else 'SORTIE'
            connection.execute(text("""
                INSERT INTO caisse (montant, type_mouvement, id_transaction, date_mouvement)
                VALUES (:montant, :type_mouvement, :id_transaction, NOW())
            """), {
                'montant': new_tx['montant_total'],
                'type_mouvement': type_mouvement,
                'id_transaction': new_id
            })
            
            print(f"    ✓ Created transaction #{new_id}")
    
    # Step 3: Make new columns NOT NULL (after data migration)
    print("Step 3: Making new columns NOT NULL...")
    op.alter_column('transactions', 'id_produit', nullable=False)
    op.alter_column('transactions', 'quantite', nullable=False)
    op.alter_column('transactions', 'prix_unitaire', nullable=False)
    
    # Step 4: Add foreign key and constraints
    print("Step 4: Adding foreign key and constraints...")
    op.create_foreign_key(
        'fk_transactions_produit',
        'transactions', 'produits',
        ['id_produit'], ['id_produit']
    )
    
    op.create_check_constraint(
        'check_quantite_positive',
        'transactions',
        'quantite > 0'
    )
    
    op.create_check_constraint(
        'check_prix_unitaire_positive',
        'transactions',
        'prix_unitaire > 0'
    )
    
    # Step 5: Add indexes for performance
    print("Step 5: Adding indexes...")
    op.create_index('idx_transactions_id_produit', 'transactions', ['id_produit'])
    op.create_index('idx_transactions_id_client', 'transactions', ['id_client'])
    op.create_index('idx_transactions_id_fournisseur', 'transactions', ['id_fournisseur'])
    
    # Step 6: Drop lignes_transaction table
    print("Step 6: Dropping lignes_transaction table...")
    op.drop_table('lignes_transaction')
    
    print("✅ Migration completed successfully!")


def downgrade():
    """
    Reverse the flattening: recreate lignes_transaction table.
    WARNING: This will lose data if transactions were created after the upgrade.
    """
    # Recreate lignes_transaction table
    op.create_table(
        'lignes_transaction',
        sa.Column('id_ligne_transaction', sa.Integer(), nullable=False),
        sa.Column('id_transaction', sa.Integer(), nullable=False),
        sa.Column('id_produit', sa.Integer(), nullable=False),
        sa.Column('quantite', sa.Integer(), nullable=False),
        sa.Column('prix_unitaire', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.ForeignKeyConstraint(['id_transaction'], ['transactions.id_transaction'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['id_produit'], ['produits.id_produit']),
        sa.PrimaryKeyConstraint('id_ligne_transaction'),
        sa.CheckConstraint('quantite > 0', name='check_quantite_positive')
    )
    op.create_index('ix_lignes_transaction_id_ligne_transaction', 'lignes_transaction', ['id_ligne_transaction'])
    op.create_index('ix_lignes_transaction_id_transaction', 'lignes_transaction', ['id_transaction'])
    op.create_index('ix_lignes_transaction_id_produit', 'lignes_transaction', ['id_produit'])
    
    # Migrate data back (create one ligne per transaction)
    connection = op.get_bind()
    connection.execute(text("""
        INSERT INTO lignes_transaction (id_transaction, id_produit, quantite, prix_unitaire)
        SELECT id_transaction, id_produit, quantite, prix_unitaire
        FROM transactions
        WHERE id_produit IS NOT NULL
    """))
    
    # Drop indexes
    op.drop_index('idx_transactions_id_fournisseur', 'transactions')
    op.drop_index('idx_transactions_id_client', 'transactions')
    op.drop_index('idx_transactions_id_produit', 'transactions')
    
    # Drop constraints
    op.drop_constraint('check_prix_unitaire_positive', 'transactions', type_='check')
    op.drop_constraint('check_quantite_positive', 'transactions', type_='check')
    op.drop_constraint('fk_transactions_produit', 'transactions', type_='foreignkey')
    
    # Drop columns
    op.drop_column('transactions', 'prix_unitaire')
    op.drop_column('transactions', 'quantite')
    op.drop_column('transactions', 'id_produit')

