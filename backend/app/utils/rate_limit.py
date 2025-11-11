"""
Configuration du rate limiting avec slowapi.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import settings

# Créer le limiter global
limiter = Limiter(key_func=get_remote_address)


def conditional_rate_limit(limit: str):
    """
    Décorateur conditionnel pour le rate limiting.
    
    Si ENABLE_RATE_LIMITING est False, retourne un décorateur no-op.
    Sinon, applique le rate limiting.
    
    Args:
        limit: Limite de rate (ex: "5/minute")
        
    Returns:
        Décorateur de rate limiting ou no-op
    """
    if settings.ENABLE_RATE_LIMITING:
        return limiter.limit(limit)
    else:
        # Décorateur no-op qui retourne la fonction inchangée
        def noop_decorator(func):
            return func
        return noop_decorator

