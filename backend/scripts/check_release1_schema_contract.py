"""Read-only release-1 correction dependency gate.

Run on a disposable PostgreSQL rehearsal database. Never applies migrations,
backfills data or prints connection credentials. An incomplete schema exits 2.
"""
import argparse
import os
import sys
from urllib.parse import urlparse

import psycopg2


FOUNDATION_COLUMNS = {
    "transactions": {"row_version"},
    "paiements": {"row_version"},
    "correction_operations": {"operation_id", "request_hash", "request_payload", "result_payload"},
    "entity_revisions": {"entity_type", "entity_id", "revision", "operation_id"},
}
INTEGRATED_COLUMNS = {
    "transactions": {"stock_revision", "quantite_annulee"},
    "paiements": {"nature"},
    "egg_sale_allocations": {"quantite_livree"},
}
REQUIRED_INTEGRATED_CHECKS = {
    "check_stock_revision_nonnegative",
    "check_quantite_annulee_bounded",
    "egg_allocation_delivered_bounded",
}


def collect_missing(cur, scope):
    cur.execute("""
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema='public'
    """)
    actual = {}
    for table, column in cur.fetchall():
        actual.setdefault(table, set()).add(column)
    missing = []
    required = {name: set(columns) for name, columns in FOUNDATION_COLUMNS.items()}
    if scope == "integrated":
        for table, columns in INTEGRATED_COLUMNS.items():
            required.setdefault(table, set()).update(columns)
    for table, columns in sorted(required.items()):
        for column in sorted(columns - actual.get(table, set())):
            missing.append(f"public.{table}.{column}")

    # Test the installed immutable audit foundation on both target tables.
    cur.execute("""
        SELECT c.relname, t.tgname
        FROM pg_trigger t
        JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN ('transactions','paiements')
          AND t.tgname IN ('trg_correction_version','trg_correction_capture')
          AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal
    """)
    found = set(cur.fetchall())
    for table in ("transactions", "paiements"):
        for trigger in ("trg_correction_version", "trg_correction_capture"):
            if (table, trigger) not in found:
                missing.append(f"trigger public.{table}.{trigger}")

    cur.execute("""
        SELECT c.relname, c.relrowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN ('correction_operations','entity_revisions')
    """)
    rls = dict(cur.fetchall())
    for table in ("correction_operations", "entity_revisions"):
        if rls.get(table) is not True:
            missing.append(f"RLS public.{table}")

    if scope == "integrated":
        cur.execute("""
            SELECT conname FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='public'
        """)
        constraints = {row[0] for row in cur.fetchall()}
        for name in sorted(REQUIRED_INTEGRATED_CHECKS - constraints):
            missing.append(f"constraint {name}")

        # The original payment identity function must be updated to authorize
        # only journal-linked correction operations. Do not infer readiness
        # merely from presence of the old legacy guard.
        cur.execute("""
            SELECT pg_get_functiondef(p.oid)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='protect_financial_identity'
              AND p.pronargs=0
        """)
        row = cur.fetchone()
        function_def = (row[0] if row else "").lower()
        if "app.correction_operation_id" not in function_def or "correction_operations" not in function_def:
            missing.append("audited cash/bank payment guard")

    return missing


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scope", choices=("foundation", "integrated"), default="integrated")
    parser.add_argument("--require-local", action="store_true",
                        help="Refuse remote hosts; always use in automated CI")
    args = parser.parse_args()
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        parser.error("Set TEST_DATABASE_URL (or DATABASE_URL) to a PostgreSQL test connection")
    host = urlparse(url).hostname
    if args.require_local and host not in ("localhost", "127.0.0.1", "::1"):
        print("REJECTED: automated correction schema checks require disposable local PostgreSQL")
        return 2
    if not host:
        print("REJECTED: a PostgreSQL URL with an explicit host is required")
        return 2
    try:
        with psycopg2.connect(url) as conn:
            with conn.cursor() as cur:
                cur.execute("SET TRANSACTION READ ONLY")
                missing = collect_missing(cur, args.scope)
                conn.rollback()
    except psycopg2.Error as exc:
        print("REJECTED: unable to inspect PostgreSQL correction prerequisites safely")
        print(type(exc).__name__)
        return 2

    if missing:
        print(f"NO-GO: {args.scope} correction schema prerequisites missing ({len(missing)})")
        for item in missing:
            print(f"- {item}")
        return 2
    print(f"PASS: {args.scope} correction schema requirements available (read-only)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
