"""
Script pour ajouter la colonne date_echeance à la table transactions.
À exécuter une seule fois après avoir ajouté le modèle Paiement.
"""
import sys
import os

# Ajouter le répertoire parent au path pour pouvoir importer app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


def add_date_echeance_column():
    """
    Ajoute la colonne date_echeance à la table transactions si elle n'existe pas déjà.
    """
    print("[INFO] Ajout de la colonne date_echeance a la table transactions...")
    
    with engine.connect() as connection:
        try:
            # Vérifier si la colonne existe déjà
            result = connection.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'transactions' AND column_name = 'date_echeance';
            """))
            
            if result.fetchone():
                print("[OK] La colonne date_echeance existe deja dans la table transactions.")
                return
            
            # Ajouter la colonne
            connection.execute(text("ALTER TABLE transactions ADD COLUMN date_echeance DATE;"))
            connection.commit()
            print("[OK] Colonne date_echeance ajoutee avec succes.")
            
            # Créer l'index
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_transactions_date_echeance 
                ON transactions(date_echeance);
            """))
            connection.commit()
            print("[OK] Index idx_transactions_date_echeance cree avec succes.")
            
        except Exception as e:
            print(f"[ERROR] Erreur lors de l'ajout de la colonne: {e}")
            connection.rollback()
            raise


if __name__ == "__main__":
    try:
        add_date_echeance_column()
        print("\n[SUCCESS] Migration terminee avec succes!")
    except Exception as e:
        print(f"\n[ERROR] Echec de la migration: {e}")
        sys.exit(1)

