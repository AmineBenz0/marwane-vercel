"""
Script pour vérifier que tous les index de performance ont été créés correctement.
"""
import sys
from pathlib import Path

# Ajouter le répertoire backend au PYTHONPATH pour pouvoir importer app
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text
from app.config import settings

# Index attendus selon le BACKLOG
EXPECTED_INDEXES = {
    'transactions': [
        'idx_transactions_date',
        'idx_transactions_client',
        'idx_transactions_fournisseur',
        'idx_transactions_actif',
    ],
    'transactions_audit': [
        'idx_audit_transaction',
        'idx_audit_date',
    ]
}


def verify_indexes():
    """Vérifie que tous les index attendus existent dans la base de données."""
    try:
        # Créer une connexion à la base de données
        engine = create_engine(settings.DATABASE_URL)
        
        with engine.connect() as conn:
            print("=" * 60)
            print("Vérification des Index de Performance")
            print("=" * 60)
            print()
            
            all_present = True
            
            for table_name, expected_indexes in EXPECTED_INDEXES.items():
                print(f"📊 Table: {table_name}")
                print("-" * 60)
                
                # Récupérer tous les index de la table
                query = text("""
                    SELECT indexname, indexdef
                    FROM pg_indexes
                    WHERE tablename = :table_name
                    ORDER BY indexname
                """)
                
                result = conn.execute(query, {"table_name": table_name})
                all_indexes = {row[0]: row[1] for row in result}
                
                # Vérifier chaque index attendu
                for index_name in expected_indexes:
                    if index_name in all_indexes:
                        print(f"  ✅ {index_name}")
                        print(f"     {all_indexes[index_name]}")
                    else:
                        print(f"  ❌ {index_name} - MANQUANT")
                        all_present = False
                
                # Afficher les index supplémentaires (non attendus)
                unexpected = set(all_indexes.keys()) - set(expected_indexes)
                if unexpected:
                    print()
                    print(f"  ℹ️  Index supplémentaires trouvés (non requis):")
                    for idx in sorted(unexpected):
                        print(f"     - {idx}")
                
                print()
            
            print("=" * 60)
            if all_present:
                print("✅ Tous les index sont présents !")
                return 0
            else:
                print("❌ Certains index sont manquants.")
                print()
                print("Pour créer les index, exécutez :")
                print("  cd backend")
                print("  alembic upgrade head")
                return 1
                
    except Exception as e:
        print(f"❌ Erreur lors de la vérification : {e}")
        return 1


if __name__ == "__main__":
    sys.exit(verify_indexes())

