"""The private migration map is exempt only while access remains denied."""

import pytest

from scripts.check_database_security import _policy_gaps


ROLES = [
    {"rolname": name}
    for name in ("anon", "authenticated", "service_role", "app_runtime", "app_migrator")
]
MAP = "independent_lot_migration_map"


def test_private_migration_metadata_is_reported_separately():
    tables = [{"tablename": MAP, "rowsecurity": True},
              {"tablename": "business_table", "rowsecurity": True}]
    assert _policy_gaps(tables, [], ROLES, [], []) == (["business_table"], [MAP])


@pytest.mark.parametrize("failure", ["no_rls", "missing_role", "inherited_access", "public_grant"])
def test_private_metadata_exception_fails_closed(failure):
    tables = [{"tablename": MAP, "rowsecurity": failure != "no_rls"}]
    roles = ROLES[:-1] if failure == "missing_role" else ROLES
    access = [{"tablename": MAP, "rolname": "app_runtime"}] if failure == "inherited_access" else []
    grants = [{"table_name": MAP, "grantee": "PUBLIC"}] if failure == "public_grant" else []
    assert _policy_gaps(tables, [], roles, access, grants) == ([MAP], [])
