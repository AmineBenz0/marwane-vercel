"""Tests des garde-fous de configuration des déploiements."""
import pytest

from app.config import settings


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
        DATABASE_URL="postgresql://user:password@db.example.com:5432/app?sslmode=require",
        SECRET_KEY="a" * 64,
        DEBUG=False,
        ENABLE_AUTH=True,
        ENABLE_RATE_LIMITING=True,
    )

    assert configured.ENVIRONMENT == "production"
    assert configured.DEBUG is False
    assert configured.ENABLE_AUTH is True
    assert configured.ENABLE_RATE_LIMITING is True
