"""
Tests pour vérifier que les contraintes métier fonctionnent correctement.
Ces tests vérifient que les contraintes CHECK empêchent l'insertion de données invalides.

IMPORTANT: Ces tests nécessitent PostgreSQL avec les contraintes CHECK.
Ils sont désactivés avec SQLite (tests unitaires).
"""
import pytest

# Marquer tous les tests de ce fichier comme nécessitant PostgreSQL
pytestmark = pytest.mark.skipif(
    True,  # Toujours skip avec SQLite par défaut
    reason="Ces tests nécessitent PostgreSQL avec contraintes CHECK"
)
import uuid
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from datetime import date
from decimal import Decimal

from app.database import SessionLocal, engine
from app.models import Transaction, LigneTransaction, Client, Fournisseur, Produit, Utilisateur


@pytest.fixture(scope="function")
def db_session():
    """Créer une session de base de données pour les tests."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="function")
def setup_test_data(db_session):
    """Créer des données de test nécessaires avec des identifiants uniques."""
    # Générer un identifiant unique pour éviter les conflits entre tests
    unique_id = str(uuid.uuid4())[:8]
    
    # Créer un utilisateur de test avec email unique
    user = Utilisateur(
        nom_utilisateur=f"test_user_{unique_id}",
        email=f"test_{unique_id}@example.com",
        mot_de_passe_hash="dummy_hash",
        role="admin"
    )
    db_session.add(user)
    db_session.flush()
    
    # Créer un client de test
    client = Client(
        nom_client=f"Client Test {unique_id}",
        est_actif=True,
        id_utilisateur_creation=user.id_utilisateur
    )
    db_session.add(client)
    db_session.flush()
    
    # Créer un fournisseur de test
    fournisseur = Fournisseur(
        nom_fournisseur=f"Fournisseur Test {unique_id}",
        est_actif=True,
        id_utilisateur_creation=user.id_utilisateur
    )
    db_session.add(fournisseur)
    db_session.flush()
    
    # Créer un produit de test
    produit = Produit(
        nom_produit=f"Produit Test {unique_id}",
        est_actif=True
    )
    db_session.add(produit)
    db_session.flush()
    
    db_session.commit()
    
    # Utiliser yield pour permettre le cleanup après le test
    yield {
        "user": user,
        "client": client,
        "fournisseur": fournisseur,
        "produit": produit
    }
    
    # Cleanup : supprimer les données de test après chaque test
    try:
        db_session.delete(produit)
        db_session.delete(fournisseur)
        db_session.delete(client)
        db_session.delete(user)
        db_session.commit()
    except Exception:
        db_session.rollback()


def test_check_montant_positif_fails_with_negative(db_session, setup_test_data):
    """Test que l'insertion d'une transaction avec un montant négatif échoue."""
    data = setup_test_data
    
    transaction = Transaction(
        date_transaction=date.today(),
        montant_total=Decimal("-100.00"),  # Montant négatif - devrait échouer
        est_actif=True,
        id_client=data["client"].id_client,
        id_fournisseur=None,
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    
    db_session.add(transaction)
    
    # La contrainte devrait empêcher l'insertion
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    
    # Vérifier que l'erreur concerne bien la contrainte
    assert "check_montant_positif" in str(exc_info.value).lower() or "montant" in str(exc_info.value).lower()


def test_check_montant_positif_fails_with_zero(db_session, setup_test_data):
    """Test que l'insertion d'une transaction avec un montant zéro échoue."""
    data = setup_test_data
    
    transaction = Transaction(
        date_transaction=date.today(),
        montant_total=Decimal("0.00"),  # Montant zéro - devrait échouer
        est_actif=True,
        id_client=data["client"].id_client,
        id_fournisseur=None,
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    
    db_session.add(transaction)
    
    # La contrainte devrait empêcher l'insertion
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    
    # Vérifier que l'erreur concerne bien la contrainte
    assert "check_montant_positif" in str(exc_info.value).lower() or "montant" in str(exc_info.value).lower()


def test_check_montant_positif_succeeds_with_positive(db_session, setup_test_data):
    """Test que l'insertion d'une transaction avec un montant positif réussit."""
    data = setup_test_data
    
    transaction = Transaction(
        date_transaction=date.today(),
        montant_total=Decimal("100.00"),  # Montant positif - devrait réussir
        est_actif=True,
        id_client=data["client"].id_client,
        id_fournisseur=None,
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    
    db_session.add(transaction)
    db_session.commit()
    
    # Vérifier que la transaction a été créée
    assert transaction.id_transaction is not None
    db_session.delete(transaction)
    db_session.commit()


def test_check_client_ou_fournisseur_fails_with_both(db_session, setup_test_data):
    """Test que l'insertion d'une transaction avec client ET fournisseur échoue."""
    data = setup_test_data
    
    transaction = Transaction(
        date_transaction=date.today(),
        montant_total=Decimal("100.00"),
        est_actif=True,
        id_client=data["client"].id_client,
        id_fournisseur=data["fournisseur"].id_fournisseur,  # Les deux - devrait échouer
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    
    db_session.add(transaction)
    
    # La contrainte devrait empêcher l'insertion
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    
    # Vérifier que l'erreur concerne bien la contrainte
    assert "check_client_ou_fournisseur" in str(exc_info.value).lower() or "client" in str(exc_info.value).lower()


def test_check_client_ou_fournisseur_fails_with_neither(db_session, setup_test_data):
    """Test que l'insertion d'une transaction sans client ni fournisseur échoue."""
    data = setup_test_data
    
    transaction = Transaction(
        date_transaction=date.today(),
        montant_total=Decimal("100.00"),
        est_actif=True,
        id_client=None,
        id_fournisseur=None,  # Aucun des deux - devrait échouer
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    
    db_session.add(transaction)
    
    # La contrainte devrait empêcher l'insertion
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    
    # Vérifier que l'erreur concerne bien la contrainte
    assert "check_client_ou_fournisseur" in str(exc_info.value).lower() or "client" in str(exc_info.value).lower()


def test_check_client_ou_fournisseur_succeeds_with_client_only(db_session, setup_test_data):
    """Test que l'insertion d'une transaction avec seulement un client réussit."""
    data = setup_test_data
    
    transaction = Transaction(
        date_transaction=date.today(),
        montant_total=Decimal("100.00"),
        est_actif=True,
        id_client=data["client"].id_client,
        id_fournisseur=None,  # Seulement client - devrait réussir
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    
    db_session.add(transaction)
    db_session.commit()
    
    # Vérifier que la transaction a été créée
    assert transaction.id_transaction is not None
    db_session.delete(transaction)
    db_session.commit()


def test_check_client_ou_fournisseur_succeeds_with_fournisseur_only(db_session, setup_test_data):
    """Test que l'insertion d'une transaction avec seulement un fournisseur réussit."""
    data = setup_test_data
    
    transaction = Transaction(
        date_transaction=date.today(),
        montant_total=Decimal("100.00"),
        est_actif=True,
        id_client=None,
        id_fournisseur=data["fournisseur"].id_fournisseur,  # Seulement fournisseur - devrait réussir
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    
    db_session.add(transaction)
    db_session.commit()
    
    # Vérifier que la transaction a été créée
    assert transaction.id_transaction is not None
    db_session.delete(transaction)
    db_session.commit()


def test_check_quantite_positive_fails_with_negative(db_session, setup_test_data):
    """Test que l'insertion d'une ligne de transaction avec une quantité négative échoue."""
    data = setup_test_data
    
    # Créer d'abord une transaction valide
    transaction = Transaction(
        date_transaction=date.today(),
        montant_total=Decimal("100.00"),
        est_actif=True,
        id_client=data["client"].id_client,
        id_fournisseur=None,
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    db_session.add(transaction)
    db_session.flush()
    
    # Créer une ligne avec quantité négative
    ligne = LigneTransaction(
        id_transaction=transaction.id_transaction,
        id_produit=data["produit"].id_produit,
        quantite=-5  # Quantité négative - devrait échouer
    )
    
    db_session.add(ligne)
    
    # La contrainte devrait empêcher l'insertion
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    
    # Vérifier que l'erreur concerne bien la contrainte
    assert "check_quantite_positive" in str(exc_info.value).lower() or "quantite" in str(exc_info.value).lower()
    
    db_session.rollback()


def test_check_quantite_positive_fails_with_zero(db_session, setup_test_data):
    """Test que l'insertion d'une ligne de transaction avec une quantité zéro échoue."""
    data = setup_test_data
    
    # Créer d'abord une transaction valide
    transaction = Transaction(
        date_transaction=date.today(),
        montant_total=Decimal("100.00"),
        est_actif=True,
        id_client=data["client"].id_client,
        id_fournisseur=None,
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    db_session.add(transaction)
    db_session.flush()
    
    # Créer une ligne avec quantité zéro
    ligne = LigneTransaction(
        id_transaction=transaction.id_transaction,
        id_produit=data["produit"].id_produit,
        quantite=0  # Quantité zéro - devrait échouer
    )
    
    db_session.add(ligne)
    
    # La contrainte devrait empêcher l'insertion
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    
    # Vérifier que l'erreur concerne bien la contrainte
    assert "check_quantite_positive" in str(exc_info.value).lower() or "quantite" in str(exc_info.value).lower()
    
    db_session.rollback()


def test_check_quantite_positive_succeeds_with_positive(db_session, setup_test_data):
    """Test que l'insertion d'une ligne de transaction avec une quantité positive réussit."""
    data = setup_test_data
    
    # Créer d'abord une transaction valide
    transaction = Transaction(
        date_transaction=date.today(),
        montant_total=Decimal("100.00"),
        est_actif=True,
        id_client=data["client"].id_client,
        id_fournisseur=None,
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    db_session.add(transaction)
    db_session.flush()
    
    # Créer une ligne avec quantité positive
    ligne = LigneTransaction(
        id_transaction=transaction.id_transaction,
        id_produit=data["produit"].id_produit,
        quantite=5  # Quantité positive - devrait réussir
    )
    
    db_session.add(ligne)
    db_session.commit()
    
    # Vérifier que la ligne a été créée
    assert ligne.id_ligne_transaction is not None
    db_session.delete(ligne)
    db_session.delete(transaction)
    db_session.commit()

