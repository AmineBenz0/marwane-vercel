"""Read-only PostgreSQL security inventory for the release gate.

Usage from ``backend/``::

    python scripts/check_database_security.py

The command inventories public tables, RLS state, public/anonymous grants,
views, security-definer functions, roles, and current connections. It does
not change database state.
"""

import json
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402


def _rows(db, query: str) -> list[dict]:
    return [dict(row) for row in db.execute(text(query)).mappings().all()]


def main() -> int:
    db = SessionLocal()
    try:
        if db.bind.dialect.name != "postgresql":
            print(json.dumps({"ok": False, "error": "PostgreSQL is required"}, indent=2))
            return 2

        tables = _rows(db, """
            SELECT schemaname, tablename, rowsecurity
            FROM pg_catalog.pg_tables
            WHERE schemaname = 'public' AND tablename <> 'alembic_version'
            ORDER BY tablename
        """)
        grants = _rows(db, """
            SELECT table_name, grantee, privilege_type
            FROM information_schema.table_privileges
            WHERE table_schema = 'public'
              AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'app_runtime', 'app_migrator')
            ORDER BY table_name, grantee, privilege_type
        """)
        views = _rows(db, """
            SELECT v.schemaname, v.viewname,
                   COALESCE(c.reloptions, ARRAY[]::text[]) AS reloptions,
                   ('security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::text[])))
                       AS security_invoker
            FROM pg_catalog.pg_views AS v
            JOIN pg_catalog.pg_class AS c
              ON c.relname = v.viewname
            JOIN pg_catalog.pg_namespace AS n
              ON n.oid = c.relnamespace AND n.nspname = v.schemaname
            WHERE v.schemaname = 'public'
            ORDER BY v.viewname
        """)
        security_definer_functions = _rows(db, """
            SELECT n.nspname AS schemaname,
                   p.proname,
                   pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
                   p.proconfig
            FROM pg_catalog.pg_proc AS p
            JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prosecdef
            ORDER BY p.proname, arguments
        """)
        policies = _rows(db, """
            SELECT schemaname, tablename, policyname, permissive, roles, cmd
            FROM pg_catalog.pg_policies
            WHERE schemaname = 'public'
            ORDER BY tablename, policyname
        """)
        roles = _rows(db, """
            SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
            FROM pg_catalog.pg_roles
            WHERE rolname IN ('anon', 'authenticated', 'service_role', 'app_runtime', 'app_migrator')
            ORDER BY rolname
        """)
        connections = _rows(db, """
            SELECT usename, application_name, state, count(*) AS connection_count
            FROM pg_catalog.pg_stat_activity
            WHERE datname = current_database()
            GROUP BY usename, application_name, state
            ORDER BY usename, application_name, state
        """)
    except SQLAlchemyError:
        # Keep operational failures machine-readable and avoid leaking a
        # database DSN into CI logs.
        print(json.dumps({
            "ok": False,
            "error": "Unable to connect to or inspect the PostgreSQL target",
            "code": "DATABASE_SECURITY_TARGET_UNAVAILABLE",
        }, indent=2))
        return 3
    finally:
        db.close()

    rls_gaps = [row["tablename"] for row in tables if not row["rowsecurity"]]
    policy_tables = {row["tablename"] for row in policies}
    policy_gaps = [row["tablename"] for row in tables if row["tablename"] not in policy_tables]
    missing_roles = [role for role in ("app_runtime", "app_migrator") if role not in {row["rolname"] for row in roles}]
    insecure_views = [row["viewname"] for row in views if not row["security_invoker"]]
    unsafe_grants = [
        row for row in grants if row["grantee"] in {"PUBLIC", "anon"}
    ]
    result = {
        "ok": not rls_gaps and not unsafe_grants and not policy_gaps and not missing_roles and not insecure_views and not security_definer_functions,
        "tables": tables,
        "rls_disabled_tables": rls_gaps,
        "policyless_tables": policy_gaps,
        "grants": grants,
        "public_or_anon_grants": unsafe_grants,
        "policies": policies,
        "views": views,
        "insecure_views": insecure_views,
        "security_definer_functions": security_definer_functions,
        "roles": roles,
        "missing_required_roles": missing_roles,
        "connections": connections,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
