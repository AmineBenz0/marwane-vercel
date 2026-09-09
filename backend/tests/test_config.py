"""Tests des garde-fous de configuration des déploiements."""
import pytest

from app.config import get_migration_database_url, settings


Settings = type(settings)


def test_production_configuration_rejects_local_defaults():
    with pytest.raises(ValueError, match="Invalid deployment configuration"):
        Settings(
            ENVIRONMENT="production",
            DATABASE_URL="postgresql://user:password@localhost:5432/app",
            SECRET_KEY="short-secret",
            DEBUG=True,
            ENABLE_AUTH=False,
            ENABLE_RATE_LIMITING=False,
        )


def test_production_configuration_accepts_managed_database_and_secure_flags():
    configured = Settings(
        ENVIRONMENT="production",
        DATABASE_URL="postgresql://app_runtime:password@db.example.com:5432/app?sslmode=require",
        MIGRATION_DATABASE_URL="postgresql://app_migrator:password@db.example.com:5432/app?sslmode=require",
        SECRET_KEY="a" * 64,
        DEBUG=False,
        ENABLE_AUTH=True,
        ENABLE_RATE_LIMITING=True,
        CRON_SECRET="c" * 64,
        CORS_ORIGINS="https://app.example.com",
    )

    assert configured.ENVIRONMENT == "production"
    assert configured.DEBUG is False
    assert configured.ENABLE_AUTH is True
    assert configured.ENABLE_RATE_LIMITING is True


def test_runtime_configuration_does_not_require_migration_credential():
    configured = Settings(
        ENVIRONMENT="production",
        DATABASE_URL="postgresql://app_runtime:password@db.example.com:5432/app?sslmode=require",
        SECRET_KEY="a" * 64,
        DEBUG=False,
        ENABLE_AUTH=True,
        ENABLE_RATE_LIMITING=True,
        CRON_SECRET="c" * 64,
        CORS_ORIGINS="https://app.example.com",
    )

    assert configured.MIGRATION_DATABASE_URL is None


def test_migration_credential_is_validated_only_when_alembic_runs(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "DATABASE_URL", "postgresql://app_runtime:password@db.example.com:5432/app")
    monkeypatch.setattr(settings, "MIGRATION_DATABASE_URL", None)

    with pytest.raises(RuntimeError, match="MIGRATION_DATABASE_URL"):
        get_migration_database_url()

    migration_url = "postgresql://app_migrator:password@db.example.com:5432/app"
    monkeypatch.setattr(settings, "MIGRATION_DATABASE_URL", migration_url)
    assert get_migration_database_url() == migration_url


def test_production_configuration_rejects_shared_or_privileged_database_roles():
    with pytest.raises(ValueError, match="least-privilege application database role"):
        Settings(
            ENVIRONMENT="production",
            DATABASE_URL="postgresql://postgres:password@db.example.com:5432/app?sslmode=require",
            MIGRATION_DATABASE_URL="postgresql://postgres:password@db.example.com:5432/app?sslmode=require",
            SECRET_KEY="a" * 64,
            DEBUG=False,
            ENABLE_AUTH=True,
            ENABLE_RATE_LIMITING=True,
            CRON_SECRET="c" * 64,
            CORS_ORIGINS="https://app.example.com",
        )


def test_production_configuration_rejects_unrecognized_database_roles():
    with pytest.raises(ValueError, match="dedicated app_runtime role"):
        Settings(
            ENVIRONMENT="production",
            DATABASE_URL="postgresql://runtime_user:password@db.example.com:5432/app?sslmode=require",
            MIGRATION_DATABASE_URL="postgresql://migration_user:password@db.example.com:5432/app?sslmode=require",
            SECRET_KEY="a" * 64,
            DEBUG=False,
            ENABLE_AUTH=True,
            ENABLE_RATE_LIMITING=True,
            CRON_SECRET="c" * 64,
            CORS_ORIGINS="https://app.example.com",
        )


def test_production_configuration_rejects_local_only_cors_origins():
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        Settings(
            ENVIRONMENT="production",
            DATABASE_URL="postgresql://app_runtime:password@db.example.com:5432/app?sslmode=require",
            MIGRATION_DATABASE_URL="postgresql://app_migrator:password@db.example.com:5432/app?sslmode=require",
            SECRET_KEY="a" * 64,
            DEBUG=False,
            ENABLE_AUTH=True,
            ENABLE_RATE_LIMITING=True,
            CRON_SECRET="c" * 64,
            CORS_ORIGINS="http://localhost:5173",
        )
