"""
Configuration du rate limiting avec slowapi.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Créer le limiter global
limiter = Limiter(key_func=get_remote_address)

