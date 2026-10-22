"""
Configuration de la base de données SQLAlchemy.
Gère la connexion et la session de base de données.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool
from time import perf_counter
from app.config import settings
from app.utils.request_timing import instrument_engine, request_timing

# Création du moteur SQLAlchemy
# SQLAlchemy 1.4+ nécessite le préfixe postgresql:// au lieu de postgres://
database_url = settings.DATABASE_URL
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

if not database_url:
    raise RuntimeError("DATABASE_URL must be configured")

engine_options = {"echo": settings.DEBUG}

# Les fonctions serverless utilisent le transaction pooler Supabase (port 6543).
# Chaque invocation ouvre puis ferme sa connexion SQLAlchemy ; Supavisor gère
# le pool partagé et évite qu'un pool local reste bloqué entre invocations.
is_sqlite = database_url.startswith("sqlite")
is_supabase_transaction_pooler = (
    ".pooler.supabase.com" in database_url.lower()
    and ":6543/" in database_url
)
is_serverless = settings.ENVIRONMENT.lower() in {"production", "preview"}

if not is_sqlite:
    if is_serverless and is_supabase_transaction_pooler:
        engine_options["poolclass"] = NullPool
    else:
        # Connexions persistantes ou fournisseurs sans pooler externe :
        # garder un pool local borné, jamais un pool illimité.
        engine_options.update(
            {
                "pool_pre_ping": True,
                "pool_recycle": 300,
            }
        )
        if is_serverless:
            engine_options.update(
                {
                    "pool_size": 1,
                    "max_overflow": 0,
                    "pool_timeout": 10,
                }
            )

    if "sslmode=" not in database_url.lower() and not is_sqlite:
        engine_options["connect_args"] = {"sslmode": "require"}

engine = create_engine(database_url, **engine_options)
instrument_engine(engine)

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
        timing = request_timing.get()
        if timing is not None:
            # Measure checkout/connection setup independently of route queries.
            started = perf_counter()
            try:
                db.connection()
            finally:
                timing.db_acquire_ms += (perf_counter() - started) * 1000
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

