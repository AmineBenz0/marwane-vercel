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

if not database_url:
    raise RuntimeError("DATABASE_URL must be configured")

engine_options = {"echo": settings.DEBUG}

# Vercel peut conserver une instance de fonction entre deux invocations.
# Pour PostgreSQL, recycle les connexions inactives et limite le nombre de
# connexions ouvertes par instance. Les tests SQLite n'acceptent pas ces
# options de pool, d'où la condition explicite.
if not database_url.startswith("sqlite"):
    engine_options.update(
        {
            "pool_pre_ping": True,
            "pool_recycle": 300,
        }
    )

    if settings.ENVIRONMENT.lower() in {"production", "preview"}:
        engine_options.update(
            {
                "pool_size": 1,
                "max_overflow": 0,
                "pool_timeout": 10,
            }
        )
        if "sslmode=" not in database_url.lower():
            engine_options["connect_args"] = {"sslmode": "require"}

engine = create_engine(database_url, **engine_options)

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
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    """
    Initialise la base de données en créant toutes les tables.
    À utiliser avec Alembic en production.
    """
    Base.metadata.create_all(bind=engine)

