"""Block deployments whose runtime database cannot serve the current models.

Run with DATABASE_URL for the least-privilege runtime role. This command never
applies migrations or writes application data, and never prints secrets.
"""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> int:
    try:
        from sqlalchemy import create_engine, text
        from sqlalchemy.pool import NullPool
        from app.config import settings
        from app.database import Base, engine
        import app.models  # noqa: F401
        from app.services.database_schema import schema_issues

        if engine.dialect.name != "postgresql":
            print("Database schema preflight requires PostgreSQL.", file=sys.stderr)
            return 1
        check_engine = create_engine(
            engine.url,
            poolclass=NullPool,
            connect_args={
                "connect_timeout": 10,
                "sslmode": "require" if settings.ENVIRONMENT in {"production", "preview"} else "prefer",
            },
        )
        try:
            with check_engine.connect() as connection:
                connection.execute(text("SET TRANSACTION READ ONLY"))
                connection.execute(text("SET LOCAL statement_timeout = '15s'"))
                connection.execute(text("SET LOCAL lock_timeout = '5s'"))
                issues = schema_issues(connection, Base.metadata)
                connection.rollback()
        finally:
            check_engine.dispose()
        if issues:
            print("Database schema preflight failed:", file=sys.stderr)
            for issue in issues:
                print(f"- {issue}", file=sys.stderr)
            print("Apply the reviewed migrations to this database before deploying.", file=sys.stderr)
            return 1
        columns = sum(len(table.columns) for table in Base.metadata.tables.values())
        print(f"Database schema preflight passed: {len(Base.metadata.tables)} tables, {columns} columns.")
        return 0
    except Exception as error:
        # Driver/config exceptions may contain a connection URL or password.
        print(f"Database schema preflight could not complete ({type(error).__name__}).", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
