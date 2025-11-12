"""
Middleware FastAPI pour le logging structuré de toutes les requêtes.
Enregistre automatiquement toutes les requêtes avec leurs métadonnées.
"""
import time
import logging
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.config.logging_config import get_logger
from app.config import settings

logger = get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware FastAPI pour logger toutes les requêtes HTTP.
    
    Enregistre automatiquement:
    - Timestamp
    - User ID (si authentifié)
    - Endpoint
    - Méthode HTTP
    - Code de statut
    - Durée de la requête
    - Adresse IP
    """
    
    def __init__(self, app: ASGIApp):
        """
        Initialise le middleware de logging.
        
        Args:
            app: Application ASGI (FastAPI)
        """
        super().__init__(app)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Traite chaque requête et enregistre les informations de logging.
        
        Args:
            request: Requête HTTP entrante
            call_next: Fonction pour appeler le prochain middleware/handler
            
        Returns:
            Response: Réponse HTTP
        """
        # Ignorer les routes de santé et de documentation
        if request.url.path in ["/health", "/", "/docs", "/openapi.json", "/redoc"]:
            return await call_next(request)
        
        # Démarrer le chronomètre
        start_time = time.time()
        
        # Extraire les informations de base
        method = request.method
        endpoint = request.url.path
        client_ip = self._get_client_ip(request)
        
        # Initialiser les données de log
        user_id = None
        
        # Essayer d'extraire l'user_id depuis le token JWT si l'authentification est activée
        # On extrait uniquement depuis le payload pour éviter les requêtes DB dans le middleware
        if settings.ENABLE_AUTH:
            try:
                # Extraire le token depuis l'en-tête Authorization
                authorization = request.headers.get("Authorization")
                if authorization and authorization.startswith("Bearer "):
                    token = authorization.split(" ")[1]
                    # Décoder le token pour extraire l'user_id (sans validation complète pour performance)
                    from app.utils.security import decode_token
                    try:
                        payload = decode_token(token)
                        user_id_str = payload.get("sub")
                        if user_id_str:
                            # Convertir en int si possible
                            try:
                                user_id = int(user_id_str)
                            except (ValueError, TypeError):
                                pass
                    except Exception:
                        # Si l'extraction échoue, on continue sans user_id
                        pass
            except Exception:
                # Si l'authentification échoue, on continue sans user_id
                pass
        
        # Exécuter la requête
        response = None
        status_code = 500
        error_occurred = False
        
        try:
            response = await call_next(request)
            status_code = response.status_code
            
            # Si le statut est >= 400, c'est une erreur
            if status_code >= 400:
                error_occurred = True
                
        except Exception as e:
            # Capturer les exceptions non gérées
            error_occurred = True
            status_code = 500
            logger.error(
                f"Exception non gérée dans {endpoint}",
                exc_info=True,
                extra={
                    "endpoint": endpoint,
                    "method": method,
                    "user_id": user_id,
                    "ip_address": client_ip,
                    "status_code": status_code,
                }
            )
            # Ré-élever l'exception pour que FastAPI la gère
            raise
        
        finally:
            # Calculer la durée
            duration_ms = round((time.time() - start_time) * 1000, 2)
            
            # Préparer les métadonnées pour le log
            log_extra = {
                "user_id": user_id,
                "endpoint": endpoint,
                "method": method,
                "status_code": status_code,
                "duration_ms": duration_ms,
                "ip_address": client_ip,
            }
            
            # Logger selon le niveau
            if error_occurred:
                logger.error(
                    f"{method} {endpoint} - {status_code} - {duration_ms}ms",
                    extra=log_extra
                )
            else:
                logger.info(
                    f"{method} {endpoint} - {status_code} - {duration_ms}ms",
                    extra=log_extra
                )
        
        return response
    
    def _get_client_ip(self, request: Request) -> str:
        """
        Extrait l'adresse IP réelle du client depuis la requête.
        Prend en compte les proxies et load balancers.
        
        Args:
            request: Requête FastAPI
            
        Returns:
            str: Adresse IP du client
        """
        # Vérifier les en-têtes de proxy courants
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # Prendre la première IP (celle du client original)
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fallback sur l'adresse IP directe
        if request.client:
            return request.client.host
        
        return "unknown"

