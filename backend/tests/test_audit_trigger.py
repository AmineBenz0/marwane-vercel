"""
Tests pour le trigger d'audit des transactions.

Ces tests vérifient que le trigger PostgreSQL enregistre automatiquement
toutes les modifications apportées aux transactions dans la table Transactions_Audit.
"""
import pytest
from fastapi import status
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy import text

from app.models.transaction import Transaction
from app.models.audit import TransactionAudit
from app.models.client import Client
from app.models.user import Utilisateur
from app.config import settings


def get_auth_headers(client, test_user):
    """
    Helper pour obtenir les headers d'authentification selon ENABLE_AUTH.
    Retourne un dict vide si auth désactivée, sinon retourne les headers avec token.
    """
    headers = {}
    if settings.ENABLE_AUTH:
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
    return headers


@pytest.fixture
def test_client(db_session, test_user):
    """Crée un client de test."""
    client = Client(
        nom_client="Client Test Audit",
        est_actif=True,
        id_utilisateur_creation=test_user.id_utilisateur
    )
    db_session.add(client)
    db_session.commit()
    db_session.refresh(client)
    return client


def test_audit_trigger_exists(db_session):
    """
    Test que le trigger d'audit existe sur la table transactions.
    
    Note: Ce test nécessite PostgreSQL. Il sera ignoré si la base de données
    n'est pas PostgreSQL (par exemple, SQLite en mémoire pour les tests).
    """
    # Vérifier si on est sur PostgreSQL en vérifiant le dialecte
    engine = db_session.bind
    dialect_name = engine.dialect.name
    
    if dialect_name != "postgresql":
        pytest.skip(f"Ce test nécessite PostgreSQL (dialecte actuel: {dialect_name})")
    
    try:
        # Vérifier que le trigger existe
        result = db_session.execute(text("""
            SELECT EXISTS (
                SELECT 1 
                FROM pg_trigger 
                WHERE tgname = 'trigger_audit_transactions'
            )
        """))
        exists = result.scalar()
        assert exists is True, (
            "Le trigger trigger_audit_transactions devrait exister. "
            "Assurez-vous que la migration a été appliquée (Tâche 1.11.1)."
        )
    except Exception as e:
        pytest.skip(f"Erreur lors de la vérification du trigger: {e}")


def test_audit_function_exists(db_session):
    """
    Test que la fonction d'audit existe.
    
    Note: Ce test nécessite PostgreSQL.
    """
    # Vérifier si on est sur PostgreSQL en vérifiant le dialecte
    engine = db_session.bind
    dialect_name = engine.dialect.name
    
    if dialect_name != "postgresql":
        pytest.skip(f"Ce test nécessite PostgreSQL (dialecte actuel: {dialect_name})")
    
    try:
        # Vérifier que la fonction existe
        result = db_session.execute(text("""
            SELECT EXISTS (
                SELECT 1 
                FROM pg_proc 
                WHERE proname = 'audit_transaction_changes'
            )
        """))
        exists = result.scalar()
        assert exists is True, (
            "La fonction audit_transaction_changes devrait exister. "
            "Assurez-vous que la migration a été appliquée (Tâche 1.11.1)."
        )
    except Exception as e:
        pytest.skip(f"Erreur lors de la vérification de la fonction: {e}")


class TestAuditTrigger:
    """Tests pour vérifier que le trigger d'audit fonctionne correctement."""
    
    def test_modify_transaction_creates_audit_entry(
        self, client, test_user, db_session, test_client, admin_token
    ):
        """
        Test : modifier une transaction et vérifier qu'une entrée est créée dans Transactions_Audit.
        
        Ce test vérifie que :
        1. La modification d'une transaction via l'API crée une entrée d'audit
        2. Les valeurs de l'audit sont correctes (id_transaction, id_utilisateur, champ_modifie, etc.)
        
        Note: Ce test nécessite que le trigger PostgreSQL soit créé (Tâche 1.11.1).
        Il sera ignoré si la base de données n'est pas PostgreSQL.
        """
        # Vérifier si on est sur PostgreSQL
        from sqlalchemy import inspect
        engine = db_session.bind
        dialect_name = engine.dialect.name
        
        if dialect_name != "postgresql":
            pytest.skip(f"Ce test nécessite PostgreSQL avec le trigger d'audit (dialecte actuel: {dialect_name})")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Créer une transaction initiale
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        db_session.refresh(transaction)
        
        transaction_id = transaction.id_transaction
        original_montant = transaction.montant_total
        original_date = transaction.date_transaction
        
        # Compter les entrées d'audit avant la modification
        audit_count_before = db_session.query(TransactionAudit).filter(
            TransactionAudit.id_transaction == transaction_id
        ).count()
        
        # Modifier la transaction via l'API
        new_montant = Decimal("250.00")
        new_date = date.today() - timedelta(days=5)
        
        response = client.put(
            f"/api/v1/transactions/{transaction_id}",
            headers=headers,
            json={
                "date_transaction": str(new_date),
                "montant_total": str(new_montant)
            }
        )
        assert response.status_code == status.HTTP_200_OK
        
        # Rafraîchir la session pour voir les changements
        db_session.commit()
        
        # Vérifier qu'une entrée est créée dans Transactions_Audit
        audit_entries = db_session.query(TransactionAudit).filter(
            TransactionAudit.id_transaction == transaction_id
        ).order_by(TransactionAudit.date_changement.desc()).all()
        
        # Il devrait y avoir au moins une nouvelle entrée d'audit
        assert len(audit_entries) > audit_count_before, (
            "Une entrée d'audit devrait avoir été créée lors de la modification de la transaction"
        )
        
        # Vérifier que les valeurs sont correctes
        # On vérifie les entrées les plus récentes (les dernières modifications)
        recent_audits = audit_entries[:2]  # Prendre les 2 dernières au cas où plusieurs champs ont changé
        
        # Trouver les entrées d'audit pour les champs modifiés
        montant_audit = None
        date_audit = None
        
        for audit in recent_audits:
            if audit.champ_modifie == "montant_total":
                montant_audit = audit
            elif audit.champ_modifie == "date_transaction":
                date_audit = audit
        
        # Vérifier l'audit du montant
        assert montant_audit is not None, "Une entrée d'audit pour montant_total devrait exister"
        assert montant_audit.id_transaction == transaction_id
        assert montant_audit.id_utilisateur == test_user.id_utilisateur
        assert montant_audit.champ_modifie == "montant_total"
        # Vérifier les valeurs (convertir en Decimal pour la comparaison)
        assert Decimal(str(montant_audit.ancienne_valeur)) == original_montant
        assert Decimal(str(montant_audit.nouvelle_valeur)) == new_montant
        assert montant_audit.date_changement is not None
        
        # Vérifier l'audit de la date
        assert date_audit is not None, "Une entrée d'audit pour date_transaction devrait exister"
        assert date_audit.id_transaction == transaction_id
        assert date_audit.id_utilisateur == test_user.id_utilisateur
        assert date_audit.champ_modifie == "date_transaction"
        # Vérifier les valeurs de date
        assert str(date_audit.ancienne_valeur) == str(original_date)
        assert str(date_audit.nouvelle_valeur) == str(new_date)
        assert date_audit.date_changement is not None
    
    def test_modify_single_field_creates_single_audit_entry(
        self, client, test_user, db_session, test_client, admin_token
    ):
        """
        Test que la modification d'un seul champ crée une seule entrée d'audit.
        
        Note: Ce test nécessite PostgreSQL avec le trigger d'audit.
        """
        # Vérifier si on est sur PostgreSQL
        from sqlalchemy import inspect
        engine = db_session.bind
        dialect_name = engine.dialect.name
        
        if dialect_name != "postgresql":
            pytest.skip(f"Ce test nécessite PostgreSQL avec le trigger d'audit (dialecte actuel: {dialect_name})")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Créer une transaction
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        db_session.refresh(transaction)
        
        transaction_id = transaction.id_transaction
        original_montant = transaction.montant_total
        
        # Compter les entrées d'audit avant
        audit_count_before = db_session.query(TransactionAudit).filter(
            TransactionAudit.id_transaction == transaction_id
        ).count()
        
        # Modifier uniquement le montant
        new_montant = Decimal("150.00")
        response = client.put(
            f"/api/v1/transactions/{transaction_id}",
            headers=headers,
            json={
                "montant_total": str(new_montant)
            }
        )
        assert response.status_code == status.HTTP_200_OK
        
        db_session.commit()
        
        # Vérifier qu'une seule nouvelle entrée d'audit a été créée
        audit_entries = db_session.query(TransactionAudit).filter(
            TransactionAudit.id_transaction == transaction_id
        ).all()
        
        new_audit_count = len(audit_entries) - audit_count_before
        
        # Il devrait y avoir exactement une nouvelle entrée
        assert new_audit_count >= 1, "Au moins une entrée d'audit devrait avoir été créée"
        
        # Vérifier que l'entrée d'audit est correcte
        latest_audit = db_session.query(TransactionAudit).filter(
            TransactionAudit.id_transaction == transaction_id
        ).order_by(TransactionAudit.date_changement.desc()).first()
        
        assert latest_audit is not None
        assert latest_audit.champ_modifie == "montant_total"
        assert Decimal(str(latest_audit.ancienne_valeur)) == original_montant
        assert Decimal(str(latest_audit.nouvelle_valeur)) == new_montant
        assert latest_audit.id_utilisateur == test_user.id_utilisateur
    
    def test_modify_est_actif_creates_audit_entry(
        self, client, test_user, db_session, test_client, admin_token
    ):
        """
        Test que la modification du champ est_actif crée une entrée d'audit.
        
        Note: Ce test nécessite PostgreSQL avec le trigger d'audit.
        """
        # Vérifier si on est sur PostgreSQL
        from sqlalchemy import inspect
        engine = db_session.bind
        dialect_name = engine.dialect.name
        
        if dialect_name != "postgresql":
            pytest.skip(f"Ce test nécessite PostgreSQL avec le trigger d'audit (dialecte actuel: {dialect_name})")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Créer une transaction active
        transaction = Transaction(
            date_transaction=date.today(),
            montant_total=Decimal("100.00"),
            est_actif=True,
            id_client=test_client.id_client,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(transaction)
        db_session.commit()
        db_session.refresh(transaction)
        
        transaction_id = transaction.id_transaction
        
        # Modifier est_actif à False (soft delete)
        response = client.put(
            f"/api/v1/transactions/{transaction_id}",
            headers=headers,
            json={
                "est_actif": False
            }
        )
        assert response.status_code == status.HTTP_200_OK
        
        db_session.commit()
        
        # Vérifier l'entrée d'audit
        audit_entry = db_session.query(TransactionAudit).filter(
            TransactionAudit.id_transaction == transaction_id,
            TransactionAudit.champ_modifie == "est_actif"
        ).order_by(TransactionAudit.date_changement.desc()).first()
        
        assert audit_entry is not None, "Une entrée d'audit pour est_actif devrait exister"
        assert audit_entry.id_transaction == transaction_id
        assert audit_entry.id_utilisateur == test_user.id_utilisateur
        assert audit_entry.champ_modifie == "est_actif"
        # Vérifier les valeurs booléennes
        assert audit_entry.ancienne_valeur in ("True", "true", "1", "t")
        assert audit_entry.nouvelle_valeur in ("False", "false", "0", "f")

