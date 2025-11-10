"""
Configuration et fixtures communes pour les tests.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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
    Crée une session de base de données pour les tests.
    Les tables sont créées avant chaque test et supprimées après.
    """
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """
    Crée un client de test FastAPI avec une base de données de test.
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    # Réinitialiser le rate limiter pour chaque test en réinitialisant le storage
    from limits.storage import MemoryStorage
    # Réinitialiser le storage du limiter attaché à l'app
    if hasattr(app.state, 'limiter'):
        app.state.limiter._storage = MemoryStorage()
    
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()
    
    # Nettoyer le storage après le test
    if hasattr(app.state, 'limiter'):
        app.state.limiter._storage = MemoryStorage()


@pytest.fixture
def test_user(db_session):
    """
    Crée un utilisateur de test dans la base de données.
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
        role="admin"
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
        role="comptable"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

