"""Choose the Supabase connection mode appropriate for runtime traffic."""
from sqlalchemy.engine import make_url


def runtime_database_url(database_url: str, environment: str) -> str:
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    if not database_url or environment.lower() not in {"preview", "production"}:
        return database_url
    url = make_url(database_url)
    if (url.get_backend_name() == "postgresql"
            and (url.host or "").lower().endswith(".pooler.supabase.com")
            and url.port == 5432):
        # Shared Supavisor uses the same project and credentials on both ports.
        # Serverless instances must release backend connections per transaction,
        # rather than pinning one of the small session pool's connections.
        return url.set(port=6543).render_as_string(hide_password=False)
    return database_url
