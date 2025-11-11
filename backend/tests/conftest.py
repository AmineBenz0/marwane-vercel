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
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Configurer l'environnement de test AVANT d'importer app.database
# Cela évite que app.database essaie de se connecter à PostgreSQL
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app.database import Base, get_db
from app.main import app
from app.models.user import Utilisateur
from app.models.audit import AuditConnexion
from app.utils.security import hash_password
import bcrypt

# Inclure le router de test pour les tests de dépendances (une seule fois au niveau du module)
try:
    from tests.test_dependencies import test_router
    app.include_router(test_router)
except ImportError:
    # Si le module n'existe pas encore, on continue
    pass


# Base de données de test en mémoire SQLite
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
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
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function", autouse=True)
def reset_rate_limiter():
    """
    Réinitialise le rate limiter avant chaque test pour isoler les tests.
    """
    from limits.storage import MemoryStorage
    # Réinitialiser le storage du limiter attaché à l'app avant chaque test
    if hasattr(app.state, 'limiter'):
        # Créer un nouveau storage vide pour chaque test
        app.state.limiter._storage = MemoryStorage()
    yield
    # Nettoyer après le test aussi
    if hasattr(app.state, 'limiter'):
        app.state.limiter._storage = MemoryStorage()


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

