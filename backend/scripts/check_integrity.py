"""Run the read-only integrity audit.

Usage from backend/: python scripts/check_integrity.py
The command never mutates data. Repairs require a separately reviewed
migration or reversal operation.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402
from app.services.reconciliation import run_integrity_check  # noqa: E402


def main() -> int:
    db = SessionLocal()
    try:
        issues = run_integrity_check(db)
    finally:
        db.close()
    print(json.dumps({"ok": not issues, "issue_count": len(issues), "issues": issues}, ensure_ascii=False, indent=2, default=str))
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())

