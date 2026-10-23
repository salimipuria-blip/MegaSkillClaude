from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from _paths import REPO_ROOT, TOOLS_DIR
import owner_sources


class ClassifyTest(unittest.TestCase):
    def test_known_names(self) -> None:
        cases = {
            "gmail": "mail",
            "google-calendar": "calendar",
            "x": "social",
            "x-mcp": "social",
            "TwitterAPI": "social",
            "notion": "docs",
            "github": "code",
            "slack": "chat",
            "spotify": "media",
            "mem0": "ai_memory",
            "strava": "health",
            "plaid": "finance",
        }
        for name, category in cases.items():
            self.assertEqual(owner_sources.classify(name), category, name)

    def test_token_match_avoids_substrings(self) -> None:
        self.assertEqual(owner_sources.classify("xero"), "unknown")
        self.assertEqual(owner_sources.classify("weather"), "unknown")
        self.assertEqual(owner_sources.classify("local-files"), "unknown")

    def test_sensitive_categories_are_flagged(self) -> None:
        self.assertTrue(owner_sources.describe("health")["sensitive"])
        self.assertTrue(owner_sources.describe("finance")["sensitive"])
        self.assertFalse(owner_sources.describe("mail")["sensitive"])
        self.assertIn("inspect", owner_sources.describe("unknown")["read"])


class DiscoverTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.home = Path(self._tmp.name)
        self.env = mock.patch.dict(os.environ, {"HOME": str(self.home)})
        self.env.start()
        os.environ.pop("OPENCLAW_WORKSPACE_DIR", None)
        os.environ.pop("OPENCLAW_PROFILE", None)

    def tearDown(self) -> None:
        self.env.stop()
        self._tmp.cleanup()

    def write(self, relative: str, text: str) -> Path:
        path = self.home / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def test_empty_home(self) -> None:
        report = owner_sources.discover()
        self.assertEqual(report, {"user_files": [], "connectors": [], "skills": [], "exports": []})

    def test_finds_files_connectors_skills_and_exports_by_name_only(self) -> None:
        self.write(".claude/CLAUDE.md", "# My rules\n")
        self.write(".openclaw/workspace/USER.md", "- likes tea\n")
        self.write(".claude.json", json.dumps({
            "mcpServers": {"gmail": {"command": "gmail-mcp", "env": {"TOKEN": "secret-value-123"}}},
            "projects": {"/p": {"mcpServers": {"google-calendar": {"command": "cal"}}}},
        }))
        self.write(".codex/config.toml", '[mcp_servers.github]\ncommand = "gh-mcp"\n[mcp_servers."notion"]\n')
        self.write(".hermes/config.yaml", "model: x\nmcp_servers:\n  spotify:\n    command: s\n  weather:\n    url: u\nother: 1\n")
        self.write(".openclaw/workspace/skills/x-posts/SKILL.md", "name: x-posts\n")
        self.write(".openclaw/workspace/skills/calc/SKILL.md", "name: calc\n")
        self.write("Downloads/twitter-2026-01-01.zip", "zip")
        self.write("Downloads/takeout-20260101.zip", "zip")
        self.write("Downloads/holiday.jpg", "jpg")

        report = owner_sources.discover()

        files = {Path(item["path"]).name for item in report["user_files"]}
        self.assertEqual(files, {"CLAUDE.md", "USER.md"})
        connectors = {item["name"]: item["category"] for item in report["connectors"]}
        self.assertEqual(connectors, {
            "gmail": "mail", "google-calendar": "calendar", "github": "code",
            "notion": "docs", "spotify": "media", "weather": "unknown",
        })
        self.assertEqual([item["name"] for item in report["skills"]], ["x-posts"])
        self.assertEqual({item["kind"] for item in report["exports"]}, {"X / Twitter archive", "Google Takeout"})
        self.assertNotIn("secret-value-123", json.dumps(report))
        self.assertNotIn("gmail-mcp", json.dumps(report))

    def test_malformed_configs_do_not_stop_discovery(self) -> None:
        self.write(".claude.json", json.dumps({"mcpServers": ["gmail"], "projects": []}))
        (self.home / ".codex").mkdir()
        (self.home / ".codex" / "config.toml").write_bytes(b"\xff\xfe")
        self.write(".hermes/config.yaml", "mcp_servers:\n  slack:\n    command: s\n")

        report = owner_sources.discover()

        self.assertEqual([item["name"] for item in report["connectors"]], ["slack"])

    def test_cli_json(self) -> None:
        self.write(".claude.json", json.dumps({"mcpServers": {"x": {}}}))
        result = subprocess.run(
            [sys.executable, str(TOOLS_DIR / "owner_sources.py"), "discover", "--json"],
            env=dict(os.environ, HOME=str(self.home)), cwd=self.home,
            capture_output=True, text=True, check=True,
        )
        data = json.loads(result.stdout)
        self.assertEqual(data["connectors"][0]["category"], "social")

    def test_cli_classify(self) -> None:
        result = subprocess.run(
            [sys.executable, str(TOOLS_DIR / "owner_sources.py"), "classify", "mcp__gmail__search", "weather"],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(result.stdout)
        self.assertEqual([item["category"] for item in data], ["mail", "unknown"])


class IntakeDocsTest(unittest.TestCase):
    def test_intake_discovers_instead_of_enumerating(self) -> None:
        intake = (REPO_ROOT / "prompts" / "owner" / "intake.md").read_text(encoding="utf-8")
        self.assertIn("Inventory your own session", intake)
        self.assertIn("owner_sources.py\" discover", intake)
        self.assertIn("Is there anything else I should look at?", intake)
        self.assertIn("Only read what the owner picks", intake)


if __name__ == "__main__":
    unittest.main()
