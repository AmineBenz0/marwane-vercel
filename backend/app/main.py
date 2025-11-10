"""
Point d'entrée principal de l'application FastAPI.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.database import engine, Base
from app.routers import auth
from app.utils.rate_limit import limiter

# Création de l'application FastAPI
app = FastAPI(
    title="API Comptabilité",
    description="API pour la digitalisation du processus de comptabilité",
    version="1.0.0",
    debug=settings.DEBUG,
)

# Attacher le limiter à l'application
app.state.limiter = limiter

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

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Événement déclenché au démarrage de l'application."""
    # Créer les tables si elles n'existent pas (dev uniquement)
    # En production, utiliser Alembic pour les migrations
    if settings.ENVIRONMENT == "development":
        Base.metadata.create_all(bind=engine)


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

