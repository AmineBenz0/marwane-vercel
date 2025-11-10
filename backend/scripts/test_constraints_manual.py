"""
Script manuel pour tester les contraintes métier.
Ce script peut être exécuté directement pour vérifier que les contraintes fonctionnent.

Usage:
    python scripts/test_constraints_manual.py
"""
import sys
from pathlib import Path

# Ajouter le répertoire parent au path pour les imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.exc import IntegrityError
from datetime import date
from decimal import Decimal

from app.database import SessionLocal
from app.models import Transaction, LigneTransaction, Client, Fournisseur, Produit, Utilisateur


def test_constraints():
    """Teste toutes les contraintes métier."""
    db = SessionLocal()
    
    try:
        print("=" * 60)
        print("TEST DES CONTRAINTES MÉTIER")
        print("=" * 60)
        
        # Créer des données de test
        print("\n1. Création des données de test...")
        user = Utilisateur(
            nom_utilisateur="test_constraints_user",
            email="test_constraints@example.com",
            mot_de_passe_hash="dummy_hash",
            role="admin"
        )
        db.add(user)
        db.flush()
        
        client = Client(
            nom_client="Client Test Constraints",
            est_actif=True,
            id_utilisateur_creation=user.id_utilisateur
        )
        db.add(client)
        db.flush()
        
        fournisseur = Fournisseur(
            nom_fournisseur="Fournisseur Test Constraints",
            est_actif=True,
            id_utilisateur_creation=user.id_utilisateur
        )
        db.add(fournisseur)
        db.flush()
        
        produit = Produit(
            nom_produit="Produit Test Constraints",
            est_actif=True
        )
        db.add(produit)
        db.flush()
        
        print("   ✓ Données de test créées")
        
        # Test 1: Montant négatif
        print("\n2. Test: Montant négatif (devrait échouer)...")
        try:
            transaction = Transaction(
                date_transaction=date.today(),
                montant_total=Decimal("-100.00"),
                est_actif=True,
                id_client=client.id_client,
                id_fournisseur=None,
                id_utilisateur_creation=user.id_utilisateur
            )
            db.add(transaction)
            db.commit()
            print("   ✗ ÉCHEC: La transaction avec montant négatif a été acceptée!")
            db.delete(transaction)
            db.commit()
        except IntegrityError as e:
            print(f"   ✓ SUCCÈS: Contrainte check_montant_positif fonctionne")
            db.rollback()
        
        # Test 2: Montant zéro
        print("\n3. Test: Montant zéro (devrait échouer)...")
        try:
            transaction = Transaction(
                date_transaction=date.today(),
                montant_total=Decimal("0.00"),
                est_actif=True,
                id_client=client.id_client,
                id_fournisseur=None,
                id_utilisateur_creation=user.id_utilisateur
            )
            db.add(transaction)
            db.commit()
            print("   ✗ ÉCHEC: La transaction avec montant zéro a été acceptée!")
            db.delete(transaction)
            db.commit()
        except IntegrityError as e:
            print(f"   ✓ SUCCÈS: Contrainte check_montant_positif fonctionne (montant zéro)")
            db.rollback()
        
        # Test 3: Client ET Fournisseur
        print("\n4. Test: Transaction avec client ET fournisseur (devrait échouer)...")
        try:
            transaction = Transaction(
                date_transaction=date.today(),
                montant_total=Decimal("100.00"),
                est_actif=True,
                id_client=client.id_client,
                id_fournisseur=fournisseur.id_fournisseur,
                id_utilisateur_creation=user.id_utilisateur
            )
            db.add(transaction)
            db.commit()
            print("   ✗ ÉCHEC: La transaction avec client ET fournisseur a été acceptée!")
            db.delete(transaction)
            db.commit()
        except IntegrityError as e:
            print(f"   ✓ SUCCÈS: Contrainte check_client_ou_fournisseur fonctionne")
            db.rollback()
        
        # Test 4: Ni client ni fournisseur
        print("\n5. Test: Transaction sans client ni fournisseur (devrait échouer)...")
        try:
            transaction = Transaction(
                date_transaction=date.today(),
                montant_total=Decimal("100.00"),
                est_actif=True,
                id_client=None,
                id_fournisseur=None,
                id_utilisateur_creation=user.id_utilisateur
            )
            db.add(transaction)
            db.commit()
            print("   ✗ ÉCHEC: La transaction sans client ni fournisseur a été acceptée!")
            db.delete(transaction)
            db.commit()
        except IntegrityError as e:
            print(f"   ✓ SUCCÈS: Contrainte check_client_ou_fournisseur fonctionne (ni l'un ni l'autre)")
            db.rollback()
        
        # Test 5: Quantité négative
        print("\n6. Test: Ligne transaction avec quantité négative (devrait échouer)...")
        try:
            # Créer d'abord une transaction valide
            transaction = Transaction(
                date_transaction=date.today(),
                montant_total=Decimal("100.00"),
                est_actif=True,
                id_client=client.id_client,
                id_fournisseur=None,
                id_utilisateur_creation=user.id_utilisateur
            )
            db.add(transaction)
            db.flush()
            
            ligne = LigneTransaction(
                id_transaction=transaction.id_transaction,
                id_produit=produit.id_produit,
                quantite=-5
            )
            db.add(ligne)
            db.commit()
            print("   ✗ ÉCHEC: La ligne avec quantité négative a été acceptée!")
            db.delete(ligne)
            db.delete(transaction)
            db.commit()
        except IntegrityError as e:
            print(f"   ✓ SUCCÈS: Contrainte check_quantite_positive fonctionne")
            db.rollback()
        
        # Test 6: Quantité zéro
        print("\n7. Test: Ligne transaction avec quantité zéro (devrait échouer)...")
        try:
            # Créer d'abord une transaction valide
            transaction = Transaction(
                date_transaction=date.today(),
                montant_total=Decimal("100.00"),
                est_actif=True,
                id_client=client.id_client,
                id_fournisseur=None,
                id_utilisateur_creation=user.id_utilisateur
            )
            db.add(transaction)
            db.flush()
            
            ligne = LigneTransaction(
                id_transaction=transaction.id_transaction,
                id_produit=produit.id_produit,
                quantite=0
            )
            db.add(ligne)
            db.commit()
            print("   ✗ ÉCHEC: La ligne avec quantité zéro a été acceptée!")
            db.delete(ligne)
            db.delete(transaction)
            db.commit()
        except IntegrityError as e:
            print(f"   ✓ SUCCÈS: Contrainte check_quantite_positive fonctionne (quantité zéro)")
            db.rollback()
        
        # Test 7: Données valides (devrait réussir)
        print("\n8. Test: Données valides (devrait réussir)...")
        try:
            transaction = Transaction(
                date_transaction=date.today(),
                montant_total=Decimal("100.00"),
                est_actif=True,
                id_client=client.id_client,
                id_fournisseur=None,
                id_utilisateur_creation=user.id_utilisateur
            )
            db.add(transaction)
            db.flush()
            
            ligne = LigneTransaction(
                id_transaction=transaction.id_transaction,
                id_produit=produit.id_produit,
                quantite=5
            )
            db.add(ligne)
            db.commit()
            print(f"   ✓ SUCCÈS: Transaction valide créée (ID: {transaction.id_transaction})")
            print(f"   ✓ SUCCÈS: Ligne valide créée (ID: {ligne.id_ligne_transaction})")
            
            # Nettoyer
            db.delete(ligne)
            db.delete(transaction)
            db.commit()
        except Exception as e:
            print(f"   ✗ ÉCHEC: Erreur inattendue avec des données valides: {e}")
            db.rollback()
        
        # Nettoyer les données de test
        print("\n9. Nettoyage des données de test...")
        db.delete(produit)
        db.delete(fournisseur)
        db.delete(client)
        db.delete(user)
        db.commit()
        print("   ✓ Données de test supprimées")
        
        print("\n" + "=" * 60)
        print("TOUS LES TESTS TERMINÉS")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ ERREUR: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    test_constraints()

