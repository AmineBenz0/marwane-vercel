#!/usr/bin/env python3
"""
Script pour détecter et corriger les incohérences entre transactions et mouvements de caisse.

Vérifie que :
1. Chaque transaction active a un mouvement de caisse associé
2. Le montant du mouvement de caisse correspond au montant de la transaction
3. Le type de mouvement est correct (ENTREE pour client, SORTIE pour fournisseur)
"""
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from app.database import SessionLocal
from decimal import Decimal

def fix_inconsistencies():
    """
    Détecte et corrige les incohérences entre transactions et caisse.
    """
    db = SessionLocal()
    try:
        print("🔍 Recherche d'incohérences...\n")
        
        # 1. Transactions sans mouvement de caisse
        print("1️⃣ Transactions sans mouvement de caisse :")
        result = db.execute(text("""
            SELECT t.id_transaction, t.montant_total, t.id_client, t.id_fournisseur
            FROM transactions t
            LEFT JOIN caisse c ON t.id_transaction = c.id_transaction
            WHERE t.est_actif = TRUE AND c.id_mouvement IS NULL
        """))
        transactions_sans_mouvement = result.fetchall()
        
        if transactions_sans_mouvement:
            print(f"   ❌ {len(transactions_sans_mouvement)} transaction(s) sans mouvement de caisse trouvée(s)")
            for tx in transactions_sans_mouvement:
                type_mouvement = 'ENTREE' if tx[2] else 'SORTIE'  # ENTREE si client, SORTIE si fournisseur
                print(f"      - Transaction #{tx[0]}: {tx[1]} MAD (type: {type_mouvement})")
                
                # Créer le mouvement manquant
                db.execute(text("""
                    INSERT INTO caisse (montant, type_mouvement, id_transaction, date_mouvement)
                    VALUES (:montant, :type_mouvement, :id_transaction, NOW())
                """), {
                    "montant": tx[1],
                    "type_mouvement": type_mouvement,
                    "id_transaction": tx[0]
                })
            db.commit()
            print(f"   ✅ {len(transactions_sans_mouvement)} mouvement(s) de caisse créé(s)\n")
        else:
            print("   ✅ Aucune transaction sans mouvement de caisse\n")
        
        # 2. Mouvements avec montant différent de la transaction
        print("2️⃣ Mouvements de caisse avec montant incorrect :")
        result = db.execute(text("""
            SELECT t.id_transaction, t.montant_total, c.id_mouvement, c.montant, c.type_mouvement
            FROM transactions t
            JOIN caisse c ON t.id_transaction = c.id_transaction
            WHERE t.est_actif = TRUE AND t.montant_total != c.montant
        """))
        mouvements_incorrects = result.fetchall()
        
        if mouvements_incorrects:
            print(f"   ❌ {len(mouvements_incorrects)} mouvement(s) avec montant incorrect trouvé(s)")
            for tx in mouvements_incorrects:
                print(f"      - Transaction #{tx[0]}: montant={tx[1]} MAD, caisse={tx[3]} MAD (diff: {tx[1] - tx[3]} MAD)")
                
                # Corriger le montant
                db.execute(text("""
                    UPDATE caisse SET montant = :montant WHERE id_mouvement = :id_mouvement
                """), {
                    "montant": tx[1],
                    "id_mouvement": tx[2]
                })
            db.commit()
            print(f"   ✅ {len(mouvements_incorrects)} mouvement(s) corrigé(s)\n")
        else:
            print("   ✅ Tous les montants sont cohérents\n")
        
        # 3. Mouvements avec type incorrect
        print("3️⃣ Mouvements de caisse avec type incorrect :")
        result = db.execute(text("""
            SELECT t.id_transaction, c.id_mouvement, c.type_mouvement,
                   CASE WHEN t.id_client IS NOT NULL THEN 'ENTREE' ELSE 'SORTIE' END as type_attendu
            FROM transactions t
            JOIN caisse c ON t.id_transaction = c.id_transaction
            WHERE t.est_actif = TRUE 
              AND c.type_mouvement != CASE WHEN t.id_client IS NOT NULL THEN 'ENTREE' ELSE 'SORTIE' END
        """))
        mouvements_type_incorrect = result.fetchall()
        
        if mouvements_type_incorrect:
            print(f"   ❌ {len(mouvements_type_incorrect)} mouvement(s) avec type incorrect trouvé(s)")
            for tx in mouvements_type_incorrect:
                print(f"      - Transaction #{tx[0]}: type={tx[2]}, attendu={tx[3]}")
                
                # Corriger le type
                db.execute(text("""
                    UPDATE caisse SET type_mouvement = :type_mouvement WHERE id_mouvement = :id_mouvement
                """), {
                    "type_mouvement": tx[3],
                    "id_mouvement": tx[1]
                })
            db.commit()
            print(f"   ✅ {len(mouvements_type_incorrect)} mouvement(s) corrigé(s)\n")
        else:
            print("   ✅ Tous les types sont corrects\n")
        
        # 4. Afficher le solde final
        print("📊 Résumé final :")
        result = db.execute(text("""
            SELECT 
                COALESCE(SUM(CASE WHEN c.type_mouvement = 'ENTREE' THEN c.montant ELSE 0 END), 0) as total_entrees,
                COALESCE(SUM(CASE WHEN c.type_mouvement = 'SORTIE' THEN c.montant ELSE 0 END), 0) as total_sorties
            FROM caisse c
            JOIN transactions t ON c.id_transaction = t.id_transaction
            WHERE t.est_actif = TRUE
        """))
        solde_data = result.fetchone()
        
        total_entrees = solde_data[0]
        total_sorties = solde_data[1]
        solde = Decimal(str(total_entrees)) - Decimal(str(total_sorties))
        
        print(f"   💰 Entrées totales : {total_entrees} MAD")
        print(f"   💸 Sorties totales : {total_sorties} MAD")
        print(f"   ✅ Solde de la caisse : {solde} MAD\n")
        
        # Comparer avec le total des ventes
        result = db.execute(text("""
            SELECT COALESCE(SUM(montant_total), 0) as total_ventes
            FROM transactions
            WHERE est_actif = TRUE AND id_client IS NOT NULL
        """))
        total_ventes = result.fetchone()[0]
        
        result = db.execute(text("""
            SELECT COALESCE(SUM(montant_total), 0) as total_achats
            FROM transactions
            WHERE est_actif = TRUE AND id_fournisseur IS NOT NULL
        """))
        total_achats = result.fetchone()[0]
        
        print(f"   📈 Total des ventes : {total_ventes} MAD")
        print(f"   📉 Total des achats : {total_achats} MAD")
        print(f"   ➡️  Différence attendue : {Decimal(str(total_ventes)) - Decimal(str(total_achats))} MAD")
        
        if solde == (Decimal(str(total_ventes)) - Decimal(str(total_achats))):
            print("\n✅ SUCCÈS : Le solde de la caisse est cohérent avec les transactions !")
        else:
            print(f"\n⚠️  ATTENTION : Différence de {abs(solde - (Decimal(str(total_ventes)) - Decimal(str(total_achats))))} MAD détectée")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 70)
    print("🔧 Script de vérification et correction des incohérences Caisse")
    print("=" * 70)
    print()
    fix_inconsistencies()
    print("=" * 70)

