"""Dependency-free integrity checks for the static team application."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).parents[1]
HTML = (ROOT / "team/index.html").read_text()
JS = (ROOT / "team/app.js").read_text()
CSS = (ROOT / "team/styles.css").read_text()
SQL = (ROOT / "sql/viking_supabase_schema.sql").read_text()


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.views = set()
        self.controls = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if "data-view" in attrs:
            self.controls.add(attrs["data-view"])
        if attrs.get("id", "").startswith("view-"):
            self.views.add(attrs["id"].removeprefix("view-"))


class StaticAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = Document()
        cls.document.feed(HTML)

    def test_ids_are_unique_and_javascript_targets_exist(self):
        self.assertEqual(len(self.document.ids), len(set(self.document.ids)))
        targets = set(re.findall(r"\$\('([^']+)'\)", JS))
        self.assertFalse(targets - set(self.document.ids), f"missing IDs: {targets - set(self.document.ids)}")

    def test_every_navigation_target_has_a_view(self):
        self.assertFalse(self.document.controls - self.document.views)
        self.assertTrue({"home", "trips", "tasks", "gallery", "reports", "settings"} <= self.document.views)

    def test_mobile_and_reduced_motion_rules_exist(self):
        self.assertIn("@media(max-width:700px)", CSS)
        self.assertIn("prefers-reduced-motion:reduce", CSS)
        self.assertIn("env(safe-area-inset-bottom", CSS)

    def test_private_storage_and_rls_are_declared(self):
        self.assertIn("public=false", SQL)
        self.assertIn("enable row level security", SQL)
        self.assertIn("viking_is_active_member()", SQL)
        self.assertIn("file_size_limit", SQL)

    def test_no_server_secret_is_committed_to_team_client(self):
        self.assertNotIn("service_role", JS.lower())
        self.assertNotIn("sb_secret_", JS.lower())


if __name__ == "__main__":
    unittest.main()
