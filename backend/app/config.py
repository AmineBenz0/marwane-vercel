"""
Configuration de l'application.
Gère les variables d'environnement et les paramètres de configuration.
"""
from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import List


class Settings(BaseSettings):
    """Configuration de l'application via variables d'environnement."""
    
    # Database Configuration
    DATABASE_URL: str = "postgresql://comptabilite_user:change_me_in_production@localhost:5432/comptabilite_db"
    
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
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    
    model_config = ConfigDict(env_file=".env", case_sensitive=True)
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Retourne la liste des origines CORS."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


# Instance globale des settings
settings = Settings()

