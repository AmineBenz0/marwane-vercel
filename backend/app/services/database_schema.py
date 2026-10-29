"""Read-only compatibility checks between deployed models and the database."""

from sqlalchemy import MetaData, inspect, select, text
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
    if connection.dialect.name == "postgresql" and "entity_revisions" in metadata.tables:
        # Models alone cannot detect a missing trigger after an incomplete rollout.
        expected = {
            "transactions": {"trg_correction_version", "trg_correction_capture"},
            "paiements": {"trg_correction_version", "trg_correction_capture"},
            **{name: {"trg_correction_history_immutable", "trg_correction_history_no_truncate"}
               for name in ("correction_operations", "entity_revisions", "transactions_audit")},
        }
        installed = set(connection.execute(text("""
            SELECT c.relname,t.tgname FROM pg_catalog.pg_trigger t
            JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
            JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='O'
        """)).tuples())
        for table, triggers in expected.items():
            issues.extend(f"Missing enabled trigger: {table}.{name}" for name in sorted(triggers)
                          if (table, name) not in installed)
        for table in ("correction_operations", "entity_revisions", "transactions_audit"):
            state = connection.execute(text("""
                SELECT c.relrowsecurity,
                    CASE WHEN current_user='app_runtime' THEN
                        has_table_privilege(current_user,c.oid,'SELECT')
                        AND has_table_privilege(current_user,c.oid,'INSERT')
                        AND NOT has_table_privilege(current_user,c.oid,'UPDATE,DELETE,TRUNCATE')
                    ELSE true END
                FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relname=:table
            """), {"table": table}).first()
            if state is not None and not all(state):
                issues.append(f"Unsafe correction history permissions: {table}")
    return issues

