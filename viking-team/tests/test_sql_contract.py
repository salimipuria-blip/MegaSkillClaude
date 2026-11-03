"""Contract tests for the Supabase SQL that is the real authorization boundary.

These are static checks, not a live RLS test: they run offline in CI and catch the mistakes that
silently disable row level security in production (a new table without `enable row level security`,
a policy granted to `anon`, a `security definer` function without a pinned `search_path`).
A green run here is NOT proof that the staging project is configured - apply sql/ to a staging
project and test with a real session for that.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).parents[1]
SCHEMA = (ROOT / "sql/viking_supabase_schema.sql").read_text()
LIMIT = (ROOT / "sql/viking_limit_five_active_members.sql").read_text()

STRIP_COMMENTS = re.compile(r"--[^\n]*")
TABLE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)", re.IGNORECASE)
RLS = re.compile(r"alter\s+table\s+public\.(\w+)\s+enable\s+row\s+level\s+security", re.IGNORECASE)
POLICY = re.compile(
    r"create\s+policy\s+\"([^\"]+)\"\s+on\s+(?:public\.)?(\w+)\s+for\s+(\w+)\s+to\s+([\w, ]+)",
    re.IGNORECASE,
)
FUNCTION = re.compile(
    r"create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\(\)([\s\S]*?)\$\$;", re.IGNORECASE
)


def code(sql: str) -> str:
    """SQL with line comments removed, so prose cannot satisfy a structural assertion."""
    return STRIP_COMMENTS.sub("", sql)


class SchemaContract(unittest.TestCase):
    def setUp(self):
        self.schema = code(SCHEMA)
        self.limit = code(LIMIT)

    def test_every_declared_table_has_row_level_security_enabled(self):
        tables = set(TABLE.findall(self.schema))
        self.assertTrue(tables, "no public.viking_* table found - did the schema move?")
        self.assertEqual(tables, set(RLS.findall(self.schema)),
                         "a table without RLS is readable with the anon key")

    def test_every_table_has_at_least_one_policy(self):
        tables = set(TABLE.findall(self.schema))
        covered = {table for _, table, _, _ in POLICY.findall(self.schema)}
        self.assertEqual(tables - covered, set(), f"tables without any policy: {tables - covered}")

    def test_no_policy_is_granted_to_anon_or_public(self):
        for name, table, _command, roles in POLICY.findall(self.schema):
            granted = {r.strip().lower() for r in roles.split(",")}
            self.assertNotIn("anon", granted, f"policy {name!r} on {table} would expose data to anon")
            self.assertNotIn("public", granted, f"policy {name!r} on {table} would expose data to public")

    def test_every_policy_gates_on_membership(self):
        for name, table, command, _roles in POLICY.findall(self.schema):
            with self.subTest(policy=name):
                self.assertRegex(
                    self.schema,
                    rf"create policy \"{re.escape(name)}\"[\s\S]*?public\.viking_is_(active_member|admin)\(\)",
                    f"policy {name!r} on {table}.{command} must call a membership helper",
                )

    def test_security_definer_functions_pin_search_path_and_are_revoked(self):
        functions = FUNCTION.findall(self.schema)
        self.assertTrue(functions, "no public.viking_* function found")
        for name, body in functions:
            with self.subTest(function=name):
                if re.search(r"security\s+definer", body, re.IGNORECASE):
                    self.assertRegex(body, r"set\s+search_path\s*=", 
                                     f"{name} is security definer without a pinned search_path")
                self.assertRegex(
                    SCHEMA,
                    rf"revoke\s+all\s+on\s+function\s+public\.{re.escape(name)}\(\)\s+from[^;]*anon",
                    f"{name} is still executable by anon",
                )

    def test_private_storage_bucket_stays_private_and_type_limited(self):
        self.assertIn("'viking-private'", self.schema)
        self.assertRegex(self.schema, r"values\s*\('viking-private','viking-private',\s*false")
        self.assertIn("file_size_limit", self.schema)
        self.assertIn("8388608", self.schema)  # 8 MB, the same ceiling as the client
        self.assertIn("'image/heic'", self.schema)

    def test_five_member_cap_locks_before_counting(self):
        # Without the advisory lock two concurrent inserts can both read "4" and admit a 6th member.
        self.assertIn("pg_advisory_xact_lock", self.limit)
        self.assertIn("raise exception", self.limit)
        self.assertIn("23514", self.limit)
        self.assertRegex(self.limit, r"before\s+insert\s+or\s+update\s+of\s+active,\s*email")

    def test_trigger_function_runs_as_invoker_and_is_revoked(self):
        self.assertRegex(self.limit, r"security\s+invoker")
        self.assertRegex(self.limit, r"set\s+search_path\s*=")
        self.assertRegex(
            self.limit,
            r"revoke\s+all\s+on\s+function\s+public\.viking_enforce_five_active_members\(\)\s+from[^;]*anon",
        )

    def test_schema_is_idempotent_and_never_destroys_data(self):
        # Re-running must converge: no drop table, no truncate, no delete without a policy drop first.
        self.assertNotRegex(self.schema, r"\bdrop\s+table\b", )
        self.assertNotRegex(self.schema, r"\btruncate\b")
        for name, _table, _command, _roles in POLICY.findall(self.schema):
            self.assertIn(f'drop policy if exists "{name}"', SCHEMA,
                          f"policy {name!r} is created without a matching drop - re-running will fail")

    def test_no_member_email_is_committed(self):
        self.assertNotRegex(SCHEMA, r"[\w.+-]+@[\w-]+\.\w+", "never seed or commit a real member email")
        self.assertNotRegex(LIMIT, r"[\w.+-]+@[\w-]+\.\w+")


if __name__ == "__main__":
    unittest.main()
