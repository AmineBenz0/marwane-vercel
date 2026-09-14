"""Endpoints de liveness et readiness pour le déploiement."""
from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db


router = APIRouter(prefix="/health", tags=["Health"])


def _disable_cache(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


@router.get("/live")
def liveness(response: Response):
    """Vérifie que la fonction FastAPI est chargée, sans dépendre de la DB."""
    _disable_cache(response)
    return {"status": "ok", "service": "api"}


@router.get("/ready")
def readiness(response: Response, db: Session = Depends(get_db)):
    """Vérifie que l'API peut réellement exécuter une requête DB."""
    _disable_cache(response)
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}
