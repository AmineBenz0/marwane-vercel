"""Read-only compatibility checks between deployed models and the database."""

from sqlalchemy import MetaData, inspect, select
from sqlalchemy.engine import Connection
from sqlalchemy.exc import SQLAlchemyError


def schema_issues(connection: Connection, metadata: MetaData) -> list[str]:
    """Return safe object names, never credentials, records, or SQL parameters.

    Extra columns are permitted for additive rollouts and retained audit history.
    LIMIT 0 probes verify runtime SELECT permissions without fetching user data.
    """
    inspector = inspect(connection)
    issues = []
    for table in sorted(metadata.tables.values(), key=lambda item: item.name):
        schema = table.schema or (
            "public" if connection.dialect.name == "postgresql" else None
        )
        if not inspector.has_table(table.name, schema=schema):
            issues.append(f"Missing table: {table.name}")
            continue
        actual = {item["name"] for item in inspector.get_columns(table.name, schema=schema)}
        missing = sorted({column.name for column in table.columns} - actual)
        issues.extend(f"Missing column: {table.name}.{name}" for name in missing)
        if missing:
            continue
        try:
            with connection.begin_nested():
                connection.execute(select(*table.columns).limit(0))
        except SQLAlchemyError:
            issues.append(f"Cannot read modeled columns: {table.name}")

        # This linkage is required for correctly distinguishing historical LC uses.
        if table.name == "cessions_lc":
            indexes = inspector.get_indexes(table.name, schema=schema)
            if not any(
                index.get("unique")
                and index.get("column_names") == ["id_cession_origine"]
                and index.get("dialect_options", {}).get("postgresql_where") is None
                for index in indexes
            ):
                issues.append("Missing unique reversal index: cessions_lc.id_cession_origine")
            foreign_keys = inspector.get_foreign_keys(table.name, schema=schema)
            if not any(
                key.get("constrained_columns") == ["id_cession_origine"]
                and key.get("referred_table") == "cessions_lc"
                and key.get("referred_columns") == ["id_cession"]
                for key in foreign_keys
            ):
                issues.append("Missing reversal foreign key: cessions_lc.id_cession_origine")
    return issues
