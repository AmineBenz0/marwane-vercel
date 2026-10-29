"""Read-only readiness report for the owner-correction rollout.

Run from backend with PYTHONPATH=. and the configured staging DATABASE_URL:
  python scripts/check_correction_baseline.py --expected-project-ref <staging-ref>

JSON goes to stdout or --output. Financial aggregates are private operational
data: never commit a generated report to the repository. Exit 2 means review is
required; the tool never repairs, backfills, or adjusts a balance.
"""
import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path


SQL_PATH = Path(__file__).parent / "sql" / "correction_baseline.sql"
NOTICE_ONLY = {"canceled_payment_before_transaction"}
ISSUE_CODES = {"bank_balance_mismatches": "BANK_BALANCE_MISMATCH"}


def readiness(snapshot):
    findings = [
        {"code": ISSUE_CODES.get(key, key.upper()), "count": count, "action": "review_required"}
        for key, count in snapshot["issues"].items()
        if count and key not in NOTICE_ONLY
    ]
    money = snapshot["money"]
    canonical = Decimal(str(money["cash_active_excluding_cessions"]))
    for field in ("cash_view", "cash_latest_snapshot"):
        if money.get(field) is not None and abs(Decimal(str(money[field])) - canonical) > Decimal("0.01"):
            findings.append({"code": field.upper() + "_MISMATCH", "action": "review_required"})
    legacy = snapshot.get("legacy", {}).get("active_unlinked_ordinary_sales", 0)
    if legacy:
        findings.append({"code": "LEGACY_SALE_SOURCE_UNKNOWN", "count": legacy, "action": "preserve_and_review_before_source_correction"})
    return {
        "status": "review_required" if findings else "checks_passed",
        "findings": findings,
        "scope": "aggregate money and stock checks; catalog, runtime-role, and migration validation are separate gates",
        "automatic_repairs": False,
    }


def matches_project(url, expected):
    """Verify destination identity without exposing a connection string."""
    return url.host == f"db.{expected}.supabase.co" or (
        (url.host or "").endswith(".pooler.supabase.com")
        and (url.username or "").endswith("." + expected)
    )


def collect(connection, query=None):
    """Guarantee read-only execution and rollback, including on query failure."""
    transaction = connection.begin()
    try:
        connection.exec_driver_sql("SET TRANSACTION READ ONLY")
        if connection.exec_driver_sql("SHOW transaction_read_only").scalar_one() != "on":
            raise RuntimeError("Read-only transaction was not established")
        connection.exec_driver_sql("SET LOCAL statement_timeout = '15s'")
        snapshot = connection.exec_driver_sql(query or SQL_PATH.read_text()).scalar_one()
        if not isinstance(snapshot, dict):
            raise TypeError("Expected a PostgreSQL JSON report")
        return {"baseline": snapshot, "readiness": readiness(snapshot)}
    finally:
        transaction.rollback()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-project-ref", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        from app.database import engine
        if not matches_project(engine.url, args.expected_project_ref):
            raise RuntimeError("Configured database does not match expected project")
        with engine.connect() as connection:
            report = collect(connection)
        serialized = json.dumps(report, ensure_ascii=False, indent=2, default=str) + "\n"
        if args.output:
            args.output.write_text(serialized)
        else:
            print(serialized, end="")
        return 2 if report["readiness"]["findings"] else 0
    except Exception as exc:
        # Exception text may contain connection details; print the type only.
        print(f"Correction baseline failed ({type(exc).__name__}).", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
