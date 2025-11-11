"""
Configuration de l'application.
Gère les variables d'environnement et les paramètres de configuration.
"""
from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import List
import os


def detect_postgres_host():
    """
    Détecte automatiquement l'hôte PostgreSQL qui fonctionne.
    Essaie 127.0.0.1 d'abord (fonctionne mieux avec WSL), puis localhost.
    """
    # Si DATABASE_URL est déjà défini dans l'environnement, ne pas détecter
    if os.getenv("DATABASE_URL"):
        return None  # Utiliser la valeur de l'environnement
    
    # Essayer de détecter automatiquement (127.0.0.1 en premier car fonctionne mieux avec WSL)
    hosts_to_try = ["127.0.0.1", "localhost"]
    
    for host in hosts_to_try:
        try:
            import psycopg2
            conn = psycopg2.connect(
                f"postgresql://comptabilite_user:change_me_in_production@{host}:5432/comptabilite_db",
                connect_timeout=2
            )
            conn.close()
            return host
        except Exception:
            continue
    
    # Par défaut, utiliser 127.0.0.1 (fonctionne mieux avec WSL)
    return "127.0.0.1"


class Settings(BaseSettings):
    """Configuration de l'application via variables d'environnement."""
    
    # Database Configuration
    # Détection automatique de l'hôte PostgreSQL si non spécifié
    # Par défaut, utiliser 127.0.0.1 qui fonctionne mieux avec WSL/Docker
    DATABASE_URL: str = "postgresql://comptabilite_user:change_me_in_production@127.0.0.1:5432/comptabilite_db"
    
    # PostgreSQL Connection (for docker-compose)
    POSTGRES_DB: str = "comptabilite_db"
    POSTGRES_USER: str = "comptabilite_user"
    POSTGRES_PASSWORD: str = "change_me_in_production"
    POSTGRES_PORT: int = 5432
    
    # JWT Configuration
    SECRET_KEY: str = "your-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Application Configuration
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    
    # CORS Configuration
    # Origines autorisées pour les requêtes CORS (séparées par des virgules)
    # Ports courants : 3000 (React), 5173 (Vite), 8080 (Vue CLI), 4200 (Angular), 5174 (Vite alternatif)
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:8080,http://localhost:4200,http://localhost:5174"
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    
    # Development Flags - Désactivation temporaire pour faciliter le développement
    # TODO: Réactiver en production (mettre à False)
    ENABLE_AUTH: bool = False  # Désactive l'authentification si False
    ENABLE_RATE_LIMITING: bool = False  # Désactive le rate limiting si False
    
    model_config = ConfigDict(env_file=".env", case_sensitive=True)
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Retourne la liste des origines CORS."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


# Instance globale des settings
settings = Settings()

