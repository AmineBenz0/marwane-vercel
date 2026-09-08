"""
Point d'entrée principal de l'application FastAPI.
"""
import logging
from uuid import uuid4
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import InterfaceError, OperationalError
from app.config import settings
from app.config.logging_config import setup_logging
from app.routers import (
    auth, users, clients, fournisseurs, produits, 
    transactions, caisse, paiements, lettres_credit, cessions_lc,
    batiments, productions, cycles_production, charges, comptes_bancaires, tasks,
    health, financials, alerts, jobs, product_boms, transformations, stock, search, reports,
)
from app.utils.rate_limit import limiter
from app.middleware.logging_middleware import LoggingMiddleware

# Création de l'application FastAPI
app = FastAPI(
    title="API Comptabilité",
    description="API pour la digitalisation du processus de comptabilité",
    version="1.0.0",
    debug=settings.DEBUG,
)

# Attacher le limiter à l'application
app.state.limiter = limiter


def _request_id(request: Request) -> str:
    """Retourne l'identifiant de corrélation fourni ou en crée un."""
    return request.headers.get("X-Request-ID") or uuid4().hex


async def database_error_handler(request: Request, exc: Exception):
    """Convertit les pannes DB en réponse stable et non sensible."""
    request_id = _request_id(request)
    logging.getLogger(__name__).exception(
        "Database unavailable",
        exc_info=(type(exc), exc, exc.__traceback__),
        extra={
            "endpoint": request.url.path,
            "method": request.method,
            "request_id": request_id,
        },
    )
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Service temporairement indisponible. Réessayez dans quelques instants.",
            "code": "DATABASE_UNAVAILABLE",
            "request_id": request_id,
        },
        headers={
            "Cache-Control": "no-store",
            "Retry-After": "5",
            "X-Request-ID": request_id,
        },
    )


app.add_exception_handler(OperationalError, database_error_handler)
app.add_exception_handler(InterfaceError, database_error_handler)

# Personnaliser le gestionnaire d'erreur pour retourner le format FastAPI standard
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc):
    """
    Gestionnaire personnalisé pour les erreurs de rate limiting.
    Retourne une réponse au format FastAPI standard avec 'detail'.
    """
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"}
    )

# Configuration CORS (Cross-Origin Resource Sharing)
# Permet au frontend de faire des requêtes vers l'API depuis différents ports
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,  # Origines autorisées (localhost:3000, localhost:5173, etc.)
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Authorization", "Content-Type", "X-Request-ID"],
)

# Middleware de logging structuré (après CORS pour capturer toutes les requêtes)
app.add_middleware(LoggingMiddleware)


@app.on_event("startup")
async def startup_event():
    """Événement déclenché au démarrage de l'application."""
    logger = logging.getLogger(__name__)
    
    # Configurer le système de logging
    setup_logging(
        log_dir="logs",
        max_bytes=100 * 1024 * 1024,  # 100MB
        backup_count=30,  # Garder 30 jours de logs
        log_level="INFO" if not settings.DEBUG else "DEBUG"
    )
    
    # Afficher la configuration CORS
    logger.info(f"CORS configured with origins: {settings.cors_origins_list}")
    
    # Créer les tables si elles n'existent pas (dev uniquement)
    # En production, utiliser Alembic pour les migrations
    # if settings.ENVIRONMENT == "development":
    #     try:
    #         # Désactivé pour forcer l'utilisation d'alembic et éviter les conflits
    #         # Base.metadata.create_all(bind=engine)
    #         logger.info("Alembic is managing database tables")
    #     except Exception as e:
    #         logger.warning(
    #             f"Failed to connect to database during startup: {e}. "
    #             "The application will start, but database operations will fail until the database is available."
    #         )


@app.get("/")
async def root():
    """
    Route de test principale.
    Retourne un message de bienvenue.
    """
    return {
        "message": "API Comptabilité - Backend",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """
    Route de vérification de santé de l'API.
    Utilisée pour vérifier que l'API est opérationnelle.
    """
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT
    }


# Enregistrement des routers
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(clients.router, prefix=settings.API_V1_PREFIX)
app.include_router(fournisseurs.router, prefix=settings.API_V1_PREFIX)
app.include_router(produits.router, prefix=settings.API_V1_PREFIX)
app.include_router(financials.router, prefix=settings.API_V1_PREFIX)
app.include_router(transactions.router, prefix=settings.API_V1_PREFIX)
app.include_router(paiements.router, prefix=settings.API_V1_PREFIX)
app.include_router(alerts.router, prefix=settings.API_V1_PREFIX)
app.include_router(jobs.router, prefix=settings.API_V1_PREFIX)
app.include_router(product_boms.router, prefix=settings.API_V1_PREFIX)
app.include_router(transformations.router, prefix=settings.API_V1_PREFIX)
app.include_router(stock.router, prefix=settings.API_V1_PREFIX)
app.include_router(search.router, prefix=settings.API_V1_PREFIX)
app.include_router(reports.router, prefix=settings.API_V1_PREFIX)
app.include_router(caisse.router, prefix=settings.API_V1_PREFIX)
app.include_router(lettres_credit.router, prefix=settings.API_V1_PREFIX)
app.include_router(cessions_lc.router, prefix=settings.API_V1_PREFIX)
app.include_router(batiments.router, prefix=settings.API_V1_PREFIX)
app.include_router(productions.router, prefix=settings.API_V1_PREFIX)
app.include_router(cycles_production.router, prefix=settings.API_V1_PREFIX)
app.include_router(charges.router, prefix=settings.API_V1_PREFIX)
app.include_router(comptes_bancaires.router, prefix=settings.API_V1_PREFIX)
app.include_router(tasks.router, prefix=settings.API_V1_PREFIX)
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
