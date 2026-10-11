"""Tests for the project statusline (.claude/statusline): live action, secrets, width."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUSLINE = ROOT / ".claude/statusline"
ANSI = re.compile(r"\x1b\[[0-9;]*m")


@unittest.skipUnless(shutil.which("node"), "node is required")
class StatuslineTest(unittest.TestCase):
    def setUp(self):
        self.state_dir = tempfile.mkdtemp()
        self.env = {**os.environ, "MEGA_STATUSLINE_DIR": self.state_dir, "CLAUDE_CONFIG_DIR": self.state_dir}
        self.env.pop("ECC_STATUSLINE_MAX_WIDTH", None)

    def tearDown(self):
        shutil.rmtree(self.state_dir, ignore_errors=True)

    def run_node(self, script: str, payload, **env) -> subprocess.CompletedProcess:
        text = payload if isinstance(payload, str) else json.dumps(payload)
        return subprocess.run(
            ["node", str(STATUSLINE / script)], input=text, capture_output=True, text=True,
            env={**self.env, **env}, timeout=20, check=False,
        )

    def record(self, tool: str, tool_input: dict) -> None:
        result = self.run_node("record-action.js", {"session_id": "s1", "tool_name": tool, "tool_input": tool_input})
        self.assertEqual(result.returncode, 0, result.stderr)

    def line(self, payload: dict, **env) -> str:
        result = self.run_node("statusline.js", payload, **env)
        self.assertEqual(result.returncode, 0, result.stderr)
        return ANSI.sub("", result.stdout)

    def test_shows_model_context_action_and_metrics(self):
        self.record("Edit", {"file_path": "/repo/src/app.js"})
        out = self.line({"session_id": "s1", "model": {"display_name": "Opus"},
                         "context_window": {"remaining_percentage": 60}, "cost": {"total_cost_usd": 1.5},
                         "workspace": {"current_dir": "/x/MegaSkillClaude"}}, COLUMNS="160")
        for part in ("Opus", "ctx", "48%", "▸ Edit app.js", "$1.50", "1t", "1f", "MegaSkillClaude"):
            self.assertIn(part, out)

    def test_command_secrets_never_shown(self):
        self.record("Bash", {"command": "API_KEY=s3cret curl https://example.com"})
        out = self.line({"session_id": "s1", "context_window": {"remaining_percentage": 90}}, COLUMNS="160")
        self.assertIn("▸ Bash curl", out)
        self.assertNotIn("s3cret", out)
        self.assertNotIn("example.com", out)

    def test_narrow_width_keeps_context_on_one_line(self):
        self.record("Read", {"file_path": "/repo/README.md"})
        out = self.line({"session_id": "s1", "model": {"display_name": "Opus"},
                         "context_window": {"remaining_percentage": 60}}, ECC_STATUSLINE_MAX_WIDTH="30")
        self.assertIn("48%", out)
        self.assertNotIn("\n", out)
        self.assertLessEqual(len(out), 30)

    def test_bad_input_never_fails(self):
        self.assertEqual(self.run_node("record-action.js", "not json").returncode, 0)
        result = self.run_node("statusline.js", "not json")
        self.assertEqual((result.returncode, result.stdout), (0, ""))


if __name__ == "__main__":
    unittest.main()
