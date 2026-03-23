"""
Configuration et fixtures communes pour les tests backend.

Ce module configure l'environnement de test avec :
- Une base de données SQLite en mémoire pour l'isolation des tests
- Un client de test FastAPI pour les requêtes HTTP
- Des fixtures pour créer des utilisateurs de test
- Une réinitialisation automatique du rate limiter entre les tests

Toutes les fixtures utilisent une base de données isolée qui est créée
avant chaque test et supprimée après, garantissant l'isolation complète.
"""
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Configurer l'environnement de test AVANT d'importer app.database et app.main
os.environ["ENVIRONMENT"] = "testing"
os.environ["ENABLE_RATE_LIMITING"] = os.environ.get("ENABLE_RATE_LIMITING", "False")
os.environ["ENABLE_AUTH"] = os.environ.get("ENABLE_AUTH", "False")
# Par défaut SQLite en mémoire si non spécifié
TEST_DB_URL = os.environ.get("TEST_DATABASE_URL", "sqlite:///:memory:")
os.environ["DATABASE_URL"] = TEST_DB_URL

from app.database import Base, get_db
from app.main import app
from app.models.user import Utilisateur
from app.models.audit import AuditConnexion
from app.utils.security import hash_password
import bcrypt

# Moteur de base de données configuré selon l'URL (SQLite ou Postgres)
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False} if "sqlite" in TEST_DB_URL else {},
    poolclass=StaticPool if "sqlite" in TEST_DB_URL else None,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """
    Fixture pour la session de base de données de test.
    
    Crée une session SQLite en mémoire isolée pour chaque test.
    Les tables sont créées avant chaque test et supprimées après,
    garantissant une isolation complète entre les tests.
    
    Yields:
        Session: Session SQLAlchemy pour la base de données de test
    """
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Supprimer les objets dépendants (vues) qui empêchent le drop des tables sous Postgres
        if "postgresql" in str(engine.url):
            with engine.connect() as conn:
                conn.execute(text("DROP VIEW IF EXISTS Vue_Solde_Caisse CASCADE"))
                conn.execute(text("DROP MATERIALIZED VIEW IF EXISTS Vue_Solde_Caisse CASCADE"))
                conn.commit()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function", autouse=True)
def reset_rate_limiter():
    """
    Désactivé car ENABLE_RATE_LIMITING=False est défini,
    mais conservé pour compatibilité si réactivé.
    """
    yield


@pytest.fixture(scope="function")
def client(db_session):
    """
    Fixture pour le client de test FastAPI.
    
    Crée un client HTTP de test qui utilise la base de données de test
    au lieu de la base de données de production. Toutes les dépendances
    de base de données sont automatiquement remplacées.
    
    Args:
        db_session: Session de base de données de test (injectée automatiquement)
    
    Yields:
        TestClient: Client FastAPI pour effectuer des requêtes HTTP de test
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    # Inclure le router de test pour les tests de dépendances
    # On le fait ici pour éviter de modifier l'app globale au niveau du module
    try:
        from tests.test_dependencies import test_router
        if not any(r.path == "/test/current-user" for r in app.routes):
            app.include_router(test_router)
    except ImportError:
        pass

    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session):
    """
    Fixture pour créer un utilisateur de test admin.
    
    Crée un utilisateur de test avec le rôle 'admin' dans la base de données.
    Le mot de passe est 'TestPass123!' et peut être utilisé pour les tests
    d'authentification.
    
    Args:
        db_session: Session de base de données de test (injectée automatiquement)
    
    Returns:
        Utilisateur: Instance de l'utilisateur de test créé
    """
    # Utiliser bcrypt directement pour éviter le problème de détection de bug passlib
    password = "TestPass123!"
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    password_hash = bcrypt.hashpw(password_bytes, salt).decode('utf-8')
    
    user = Utilisateur(
        nom_utilisateur="Test User",
        email="test@example.com",
        mot_de_passe_hash=password_hash,
        role="admin",
        est_actif=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_user_comptable(db_session):
    """
    Crée un utilisateur comptable de test.
    """
    # Utiliser bcrypt directement pour éviter le problème de détection de bug passlib
    password = "ComptablePass123!"
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    password_hash = bcrypt.hashpw(password_bytes, salt).decode('utf-8')
    
    user = Utilisateur(
        nom_utilisateur="Comptable User",
        email="comptable@example.com",
        mot_de_passe_hash=password_hash,
        role="comptable",
        est_actif=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def admin_token(test_user):
    """
    Crée un token d'accès pour l'utilisateur admin de test sans passer par le login.
    Évite les problèmes de rate limiting dans les tests.
    """
    from app.utils.security import create_access_token
    token_data = {
        "sub": str(test_user.id_utilisateur),
        "email": test_user.email,
        "role": test_user.role
    }
    return create_access_token(token_data)


@pytest.fixture(scope="function")
def auth_headers(client, test_user):
    """
    Fixture pour obtenir les headers d'authentification selon ENABLE_AUTH.
    Si auth est activée, effectue un login et retourne le Bearer token.
    Si auth est désactivée, retourne un dictionnaire vide.
    """
    from app.config import settings
    headers = {}
    if settings.ENABLE_AUTH:
        from fastapi import status
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        if login_response.status_code == status.HTTP_200_OK:
            token = login_response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
    return headers


@pytest.fixture
def test_produit(db_session, test_user):
    """
    Crée un produit de test global utilisable par tous les tests.
    """
    from app.models.produit import Produit
    produit = Produit(
        nom_produit="Produit Test Global",
        est_actif=True,
        pour_clients=True,
        pour_fournisseurs=True
    )
    db_session.add(produit)
    db_session.commit()
    db_session.refresh(produit)
    return produit

