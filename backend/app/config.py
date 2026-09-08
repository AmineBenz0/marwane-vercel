"""
Configuration de l'application.
Gère les variables d'environnement et les paramètres de configuration.
"""
from pydantic_settings import BaseSettings
from pydantic import ConfigDict, model_validator
from typing import List, Optional
import os
from urllib.parse import urlparse

DEFAULT_LOCAL_DATABASE_URL = (
    "postgresql://comptabilite_user:change_me_in_production"
    "@127.0.0.1:5432/comptabilite_db"
)
DEFAULT_SECRET_KEY = "your-secret-key-change-this-in-production"
RUNTIME_DATABASE_ROLE = "app_runtime"
MIGRATION_DATABASE_ROLE = "app_migrator"
DEFAULT_ENVIRONMENT = (
    os.getenv("VERCEL_ENV")
    or os.getenv("ENVIRONMENT")
    or "development"
)


def _is_local_database_url(database_url: str) -> bool:
    """Retourne True pour les URLs locales ou les valeurs d'exemple."""
    parsed = urlparse(database_url)
    return (
        parsed.hostname in {"127.0.0.1", "localhost", "postgres"}
        or "change_me_in_production" in database_url
    )


def _database_username(database_url: Optional[str]) -> Optional[str]:
    """Return the database role encoded in a connection URL."""
    if not database_url:
        return None
    return urlparse(database_url).username


class Settings(BaseSettings):
    """Configuration de l'application via variables d'environnement."""
    
    # Database Configuration
    # La valeur locale est conservée pour le développement uniquement.
    # En production, le validateur ci-dessous refuse toute valeur d'exemple.
    DATABASE_URL: str = DEFAULT_LOCAL_DATABASE_URL
    # Optional migration-only credential. Alembic uses this value when set;
    # the running API never reads from it.
    MIGRATION_DATABASE_URL: Optional[str] = None
    
    # PostgreSQL Connection (for docker-compose)
    POSTGRES_DB: str = "comptabilite_db"
    POSTGRES_USER: str = "comptabilite_user"
    POSTGRES_PASSWORD: str = "change_me_in_production"
    POSTGRES_PORT: int = 5432
    
    # JWT Configuration
    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Application Configuration
    ENVIRONMENT: str = DEFAULT_ENVIRONMENT
    DEBUG: bool = DEFAULT_ENVIRONMENT.lower() != "production"
    API_V1_PREFIX: str = "/api/v1"
    
    # CORS Configuration
    # Origines autorisées pour les requêtes CORS (séparées par des virgules)
    # Ports courants : 3000 (React), 3002 (React alternatif), 5173 (Vite), 8080 (Vue CLI), 4200 (Angular), 5174 (Vite alternatif)
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3002,http://localhost:5173,http://localhost:8080,http://localhost:4200,http://localhost:5174,http://127.0.0.1:3000,http://127.0.0.1:3002,http://127.0.0.1:5173,http://127.0.0.1:8080,http://127.0.0.1:4200,http://127.0.0.1:5174"
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    
    # Development Flags - Désactivation temporaire pour faciliter le développement
    # IMPORTANT: En production, mettre ENABLE_AUTH=True et ENABLE_RATE_LIMITING=True
    ENABLE_AUTH: bool = DEFAULT_ENVIRONMENT.lower() in {"production", "preview"}
    ENABLE_RATE_LIMITING: bool = DEFAULT_ENVIRONMENT.lower() in {"production", "preview"}

    # Secret utilisé exclusivement par les routes de tâches planifiées.
    CRON_SECRET: str = ""
    
    model_config = ConfigDict(env_file=".env", case_sensitive=True, extra="ignore")
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Retourne la liste des origines CORS."""
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]

    @model_validator(mode="after")
    def validate_deployment_configuration(self):
        """Refuse les valeurs dangereuses lorsqu'une instance est déployée."""
        if self.ENVIRONMENT.lower() not in {"production", "preview"}:
            return self

        configuration_errors = []

        if not self.DATABASE_URL or _is_local_database_url(self.DATABASE_URL):
            configuration_errors.append("DATABASE_URL must point to a managed production database")

        if not self.SECRET_KEY or self.SECRET_KEY == DEFAULT_SECRET_KEY or len(self.SECRET_KEY) < 32:
            configuration_errors.append("SECRET_KEY must be a unique value of at least 32 characters")

        if self.DEBUG:
            configuration_errors.append("DEBUG must be false outside development")

        if not self.ENABLE_AUTH:
            configuration_errors.append("ENABLE_AUTH must be true outside development")

        if not self.ENABLE_RATE_LIMITING:
            configuration_errors.append("ENABLE_RATE_LIMITING must be true outside development")

        if not self.CRON_SECRET or len(self.CRON_SECRET) < 32:
            configuration_errors.append("CRON_SECRET must be a unique value of at least 32 characters")

        migration_url = self.MIGRATION_DATABASE_URL
        runtime_role = _database_username(self.DATABASE_URL)
        migration_role = _database_username(migration_url)
        privileged_runtime_roles = {"postgres", "supabase_admin", "service_role"}

        if not migration_url or _is_local_database_url(migration_url):
            configuration_errors.append(
                "MIGRATION_DATABASE_URL must point to a separate managed migration database"
            )
        elif migration_url == self.DATABASE_URL or (
            runtime_role and migration_role and runtime_role == migration_role
        ):
            configuration_errors.append(
                "MIGRATION_DATABASE_URL must use a different database role from DATABASE_URL"
            )

        if runtime_role != RUNTIME_DATABASE_ROLE:
            configuration_errors.append(
                f"DATABASE_URL must use the dedicated {RUNTIME_DATABASE_ROLE} role"
            )

        if migration_role != MIGRATION_DATABASE_ROLE:
            configuration_errors.append(
                f"MIGRATION_DATABASE_URL must use the dedicated {MIGRATION_DATABASE_ROLE} role"
            )

        if runtime_role in privileged_runtime_roles:
            configuration_errors.append(
                "DATABASE_URL must use a least-privilege application database role"
            )

        origins = self.cors_origins_list
        local_origins = {
            origin
            for origin in origins
            if origin.startswith("http://localhost")
            or origin.startswith("http://127.0.0.1")
        }
        if not origins or "*" in origins:
            configuration_errors.append(
                "CORS_ORIGINS must contain explicit origins outside development"
            )
        elif local_origins == set(origins):
            configuration_errors.append(
                "CORS_ORIGINS must include the deployed application origin outside development"
            )

        if configuration_errors:
            raise ValueError("Invalid deployment configuration: " + "; ".join(configuration_errors))

        return self


# Instance globale des settings
settings = Settings()
