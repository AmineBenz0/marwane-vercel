"""Tests des endpoints opérationnels de l'API."""
from sqlalchemy.exc import OperationalError

from app.database import get_db
from app.main import app


def test_liveness_does_not_require_database(client):
    response = client.get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "api"}
    assert response.headers["cache-control"] == "no-store"


def test_readiness_checks_database(client):
    response = client.get("/api/v1/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "reachable"}
    assert response.headers["cache-control"] == "no-store"


def test_readiness_returns_safe_503_when_database_is_unavailable(client):
    def broken_get_db():
        raise OperationalError("SELECT 1", {}, ConnectionError("database offline"))
        yield  # pragma: no cover

    app.dependency_overrides[get_db] = broken_get_db
    try:
        response = client.get("/api/v1/health/ready")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 503
    assert response.json()["code"] == "DATABASE_UNAVAILABLE"
    assert response.json()["detail"] == "Service temporairement indisponible. Réessayez dans quelques instants."
    assert response.headers["x-request-id"]
