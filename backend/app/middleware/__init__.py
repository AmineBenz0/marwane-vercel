"""
Middleware pour l'application FastAPI.
"""
from app.middleware.logging_middleware import LoggingMiddleware

__all__ = ["LoggingMiddleware"]

