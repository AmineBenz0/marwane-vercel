"""
Configuration de la base de données SQLAlchemy.
Gère la connexion et la session de base de données.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# Création du moteur SQLAlchemy
engine = create_engine(
    settings.DATABASE_URL,
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

