"""
Tests pour vérifier que les contraintes métier fonctionnent correctement.
Ces tests vérifient que les contraintes CHECK empêchent l'insertion de données invalides via PostgreSQL.
"""
import os
import pytest
import uuid
from sqlalchemy.exc import IntegrityError
from datetime import date
from decimal import Decimal

from app.database import SessionLocal
from app.models import Transaction, Client, Fournisseur, Produit, Utilisateur

# Marquer tous les tests de ce fichier comme nécessitant PostgreSQL
# Ils sont ignorés si on utilise SQLite (qui ne supporte pas toutes les contraintes CHECK de la même manière)
pytestmark = pytest.mark.skipif(
    "postgresql" not in os.environ.get("DATABASE_URL", "sqlite"),
    reason="Ces tests nécessitent PostgreSQL pour valider les contraintes CHECK complexes"
)


# Use global db_session from conftest.py


@pytest.fixture(scope="function")
def setup_test_data(db_session):
    """Créer des données de test nécessaires avec des identifiants uniques."""
    unique_id = str(uuid.uuid4())[:8]
    
    user = Utilisateur(
        nom_utilisateur=f"test_user_{unique_id}",
        email=f"test_{unique_id}@example.com",
        mot_de_passe_hash="dummy_hash",
        role="admin"
    )
    db_session.add(user)
    db_session.flush()
    
    client = Client(
        nom_client=f"Client Test {unique_id}",
        est_actif=True,
        id_utilisateur_creation=user.id_utilisateur
    )
    db_session.add(client)
    db_session.flush()
    
    fournisseur = Fournisseur(
        nom_fournisseur=f"Fournisseur Test {unique_id}",
        est_actif=True,
        id_utilisateur_creation=user.id_utilisateur
    )
    db_session.add(fournisseur)
    db_session.flush()
    
    produit = Produit(
        nom_produit=f"Produit Test {unique_id}",
        est_actif=True
    )
    db_session.add(produit)
    db_session.flush()
    
    db_session.commit()
    
    yield {
        "user": user,
        "client": client,
        "fournisseur": fournisseur,
        "produit": produit
    }
    
    # Cleanup
    try:
        db_session.delete(produit)
        db_session.delete(fournisseur)
        db_session.delete(client)
        db_session.delete(user)
        db_session.commit()
    except Exception:
        db_session.rollback()


def test_check_montant_positif_fails_with_negative_or_zero(db_session, setup_test_data):
    """Test que l'insertion d'une transaction avec un montant négatif ou zéro échoue."""
    data = setup_test_data
    
    for invalid_val in [Decimal("-100.00"), Decimal("0.00")]:
        transaction = Transaction(
            date_transaction=date.today(),
            id_produit=data["produit"].id_produit,
            quantite=10,
            prix_unitaire=Decimal("10.00"),
            montant_total=invalid_val,  # Invalide
            est_actif=True,
            id_client=data["client"].id_client,
            id_utilisateur_creation=data["user"].id_utilisateur
        )
        db_session.add(transaction)
        with pytest.raises(IntegrityError) as exc_info:
            db_session.commit()
        assert "check_montant_positif" in str(exc_info.value).lower()
        db_session.rollback()


def test_check_quantite_positive_fails_with_negative_or_zero(db_session, setup_test_data):
    """Test que l'insertion d'une transaction avec une quantité négative ou zéro échoue."""
    data = setup_test_data
    
    for invalid_val in [-5, 0]:
        transaction = Transaction(
            date_transaction=date.today(),
            id_produit=data["produit"].id_produit,
            quantite=invalid_val,  # Invalide
            prix_unitaire=Decimal("10.00"),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=data["client"].id_client,
            id_utilisateur_creation=data["user"].id_utilisateur
        )
        db_session.add(transaction)
        with pytest.raises(IntegrityError) as exc_info:
            db_session.commit()
        assert "check_quantite_positive" in str(exc_info.value).lower()
        db_session.rollback()


def test_check_prix_unitaire_positive_fails_with_negative_or_zero(db_session, setup_test_data):
    """Test que l'insertion d'une transaction avec un prix unitaire négatif ou zéro échoue."""
    data = setup_test_data
    
    for invalid_val in [Decimal("-10.00"), Decimal("0.00")]:
        transaction = Transaction(
            date_transaction=date.today(),
            id_produit=data["produit"].id_produit,
            quantite=10,
            prix_unitaire=invalid_val,  # Invalide
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=data["client"].id_client,
            id_utilisateur_creation=data["user"].id_utilisateur
        )
        db_session.add(transaction)
        with pytest.raises(IntegrityError) as exc_info:
            db_session.commit()
        assert "check_prix_unitaire_positive" in str(exc_info.value).lower()
        db_session.rollback()


def test_check_client_ou_fournisseur_fails(db_session, setup_test_data):
    """Test l'exclusion mutuelle client/fournisseur."""
    data = setup_test_data
    
    # Cas 1: Les deux à la fois
    transaction = Transaction(
        date_transaction=date.today(),
        id_produit=data["produit"].id_produit,
        quantite=10,
        prix_unitaire=Decimal("10.00"),
        montant_total=Decimal("100.00"),
        id_client=data["client"].id_client,
        id_fournisseur=data["fournisseur"].id_fournisseur,
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    db_session.add(transaction)
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    assert "check_client_ou_fournisseur" in str(exc_info.value).lower()
    db_session.rollback()

    # Cas 2: Aucun des deux
    transaction = Transaction(
        date_transaction=date.today(),
        id_produit=data["produit"].id_produit,
        quantite=10,
        prix_unitaire=Decimal("10.00"),
        montant_total=Decimal("100.00"),
        id_client=None,
        id_fournisseur=None,
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    db_session.add(transaction)
    with pytest.raises(IntegrityError) as exc_info:
        db_session.commit()
    assert "check_client_ou_fournisseur" in str(exc_info.value).lower()
    db_session.rollback()


def test_valid_transaction_succeeds(db_session, setup_test_data):
    """Test qu'une transaction valide passe sans problème."""
    data = setup_test_data
    
    transaction = Transaction(
        date_transaction=date.today(),
        id_produit=data["produit"].id_produit,
        quantite=10,
        prix_unitaire=Decimal("10.00"),
        montant_total=Decimal("100.00"),
        id_client=data["client"].id_client,
        id_utilisateur_creation=data["user"].id_utilisateur
    )
    db_session.add(transaction)
    db_session.commit()
    assert transaction.id_transaction is not None
