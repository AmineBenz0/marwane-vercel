"""
Configuration de la base de données SQLAlchemy.
Gère la connexion et la session de base de données.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# Création du moteur SQLAlchemy
# SQLAlchemy 1.4+ nécessite le préfixe postgresql:// au lieu de postgres://
database_url = settings.DATABASE_URL
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    database_url,
    pool_pre_ping=True,  # Vérifie la connexion avant utilisation
    echo=settings.DEBUG,  # Affiche les requêtes SQL en mode debug
)

# Session locale
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base pour les modèles
Base = declarative_base()


def get_db():
    """
    Dépendance FastAPI pour obtenir une session de base de données.
    Usage:
        @app.get("/items")
        def read_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialise la base de données en créant toutes les tables.
    À utiliser avec Alembic en production.
    """
    Base.metadata.create_all(bind=engine)

