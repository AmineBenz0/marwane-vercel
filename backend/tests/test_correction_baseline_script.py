"""Guard the diagnostic's read-only behavior and review decisions."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location("correction_baseline", Path(__file__).parents[1] / "scripts" / "check_correction_baseline.py")
baseline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline)


def snapshot():
    return {"issues": {}, "money": {"cash_active_excluding_cessions": 10, "cash_view": 10, "cash_latest_snapshot": 10}, "legacy": {}}


class FakeConnection:
    def __init__(self, fail=False, read_only=True):
        self.calls = []
        self.fail = fail
        self.read_only = read_only
        self.rolled_back = False

    def begin(self):
        return SimpleNamespace(rollback=lambda: setattr(self, "rolled_back", True))

    def exec_driver_sql(self, sql):
        self.calls.append(sql)
        if sql == "SHOW transaction_read_only":
            return SimpleNamespace(scalar_one=lambda: "on" if self.read_only else "off")
        if sql == "SELECT diagnostic":
            if self.fail:
                raise RuntimeError("Injected query failure")
            return SimpleNamespace(scalar_one=snapshot)
        return None


class CorrectionBaselineTests(unittest.TestCase):
    def test_establishes_read_only_before_query_and_rolls_back(self):
        connection = FakeConnection()
        report = baseline.collect(connection, "SELECT diagnostic")
        self.assertEqual(report["readiness"]["status"], "checks_passed")
        self.assertEqual(connection.calls[0], "SET TRANSACTION READ ONLY")
        self.assertTrue(connection.rolled_back)

    def test_query_failure_still_rolls_back(self):
        connection = FakeConnection(fail=True)
        with self.assertRaises(RuntimeError):
            baseline.collect(connection, "SELECT diagnostic")
        self.assertTrue(connection.rolled_back)

    def test_refuses_to_query_if_read_only_is_not_confirmed(self):
        connection = FakeConnection(read_only=False)
        with self.assertRaises(RuntimeError):
            baseline.collect(connection, "SELECT diagnostic")
        self.assertNotIn("SELECT diagnostic", connection.calls)
        self.assertTrue(connection.rolled_back)

    def test_bank_gap_is_a_review_not_a_fabricated_opening_balance(self):
        data = snapshot()
        data["issues"]["bank_balance_mismatches"] = 1
        report = baseline.readiness(data)
        self.assertEqual(report["status"], "review_required")
        self.assertEqual(report["findings"][0]["code"], "BANK_BALANCE_MISMATCH")
        self.assertFalse(report["automatic_repairs"])

    def test_separates_legacy_source_review_from_valid_stock(self):
        data = snapshot()
        data["legacy"]["active_unlinked_ordinary_sales"] = 2
        self.assertEqual(baseline.readiness(data)["findings"][0]["code"], "LEGACY_SALE_SOURCE_UNKNOWN")

    def test_cash_view_and_snapshot_are_checked_against_canonical_cash(self):
        data = snapshot()
        data["money"]["cash_view"] = 8
        self.assertEqual([f["code"] for f in baseline.readiness(data)["findings"]], ["CASH_VIEW_MISMATCH"])

    def test_matching_balances_do_not_hide_real_payment_or_stock_issues(self):
        data = snapshot()
        data["issues"] = {"negative_general_inventory": 1, "effective_payment_movement_count": 1}
        self.assertEqual(len(baseline.readiness(data)["findings"]), 2)

    def test_historical_canceled_dates_are_notice_only(self):
        data = snapshot()
        data["issues"]["canceled_payment_before_transaction"] = 1
        self.assertEqual(baseline.readiness(data)["status"], "checks_passed")

    def test_database_destination_is_checked_for_direct_and_pooled_urls(self):
        self.assertTrue(baseline.matches_project(SimpleNamespace(host="db.stage.supabase.co", username="app_runtime"), "stage"))
        self.assertTrue(baseline.matches_project(SimpleNamespace(host="aws-0-eu.pooler.supabase.com", username="app_runtime.stage"), "stage"))
        self.assertFalse(baseline.matches_project(SimpleNamespace(host="db.production.supabase.co", username="app_runtime"), "stage"))
        self.assertFalse(baseline.matches_project(SimpleNamespace(host="untrusted.example", username="app_runtime.stage"), "stage"))


if __name__ == "__main__":
    unittest.main()
