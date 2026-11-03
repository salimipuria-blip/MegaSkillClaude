from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from _paths import REPO_ROOT, TOOLS_DIR
import owner_profile
from skill_presets import normalize_character


PROFILE = """# Owner profile: Tianyi

## Always-on summary

- Name: Tianyi
- Timezone: Asia/Shanghai
- Prefers short answers in Chinese.

## Work and projects

Maintains Distilly.
"""


class OwnerProfileTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.profile_source = self.tmp / "draft.md"
        self.profile_source.write_text(PROFILE, encoding="utf-8")
        self.home = self.tmp / "owner"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_self_aliases_resolve_to_owner(self) -> None:
        for alias in ("owner", "self", "yourself", "me"):
            self.assertEqual(normalize_character(alias), "owner")

    def test_extract_summary_stops_at_next_section(self) -> None:
        summary = owner_profile.extract_summary(PROFILE)
        self.assertIn("Prefers short answers", summary)
        self.assertNotIn("Maintains Distilly", summary)

    def test_chinese_summary_heading_is_accepted(self) -> None:
        text = "# 本人画像\n\n## 常驻摘要\n\n- 称呼：天一\n\n## 目标\n\n写代码\n"
        self.assertEqual(owner_profile.extract_summary(text), "- 称呼：天一")

    def test_missing_summary_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            owner_profile.extract_summary("# Owner\n\n## Goals\n\nShip it\n")

    def test_long_summary_is_rejected(self) -> None:
        text = "## Always-on summary\n\n" + "x" * 50 + "\n"
        with self.assertRaises(ValueError):
            owner_profile.check_profile(text, max_chars=20)

    def test_secrets_are_rejected(self) -> None:
        text = PROFILE + "\nkey: sk-abcdefghijklmnopqrstuvwxyz123456\n"
        with self.assertRaises(ValueError):
            owner_profile.check_profile(text)

    def test_save_keeps_previous_version(self) -> None:
        saved = owner_profile.save_profile(self.profile_source, home=self.home)
        self.assertEqual(saved.read_text(encoding="utf-8"), PROFILE)
        self.profile_source.write_text(PROFILE.replace("short", "detailed"), encoding="utf-8")
        owner_profile.save_profile(self.profile_source, home=self.home)
        versions = list((self.home / "versions").glob("profile-*.md"))
        self.assertEqual(len(versions), 1)
        self.assertIn("short", versions[0].read_text(encoding="utf-8"))

    def test_link_appends_block_and_keeps_existing_text(self) -> None:
        saved = owner_profile.save_profile(self.profile_source, home=self.home)
        target = self.tmp / "CLAUDE.md"
        target.write_text("# My rules\n\nUse tabs.\n", encoding="utf-8")

        updated, backup = owner_profile.link_profile(target, saved)

        self.assertTrue(updated.startswith("# My rules\n\nUse tabs.\n\n"))
        self.assertIn(owner_profile.BEGIN_MARKER, updated)
        self.assertIn("Prefers short answers", updated)
        self.assertNotIn("Maintains Distilly", updated)
        self.assertIn(str(saved), updated)
        self.assertEqual(target.read_text(encoding="utf-8"), updated)
        self.assertIsNotNone(backup)
        self.assertEqual(backup.read_text(encoding="utf-8"), "# My rules\n\nUse tabs.\n")

    def test_link_twice_replaces_block_in_place(self) -> None:
        saved = owner_profile.save_profile(self.profile_source, home=self.home)
        target = self.tmp / "USER.md"
        owner_profile.link_profile(target, saved)
        target.write_text(target.read_text(encoding="utf-8") + "\nAfter.\n", encoding="utf-8")

        saved.write_text(PROFILE.replace("short", "detailed"), encoding="utf-8")
        updated, _ = owner_profile.link_profile(target, saved)

        self.assertEqual(updated.count(owner_profile.BEGIN_MARKER), 1)
        self.assertIn("detailed", updated)
        self.assertNotIn("short answers", updated)
        self.assertTrue(updated.rstrip().endswith("After."))

    def test_link_unchanged_file_makes_no_backup(self) -> None:
        saved = owner_profile.save_profile(self.profile_source, home=self.home)
        target = self.tmp / "USER.md"
        owner_profile.link_profile(target, saved)
        _, backup = owner_profile.link_profile(target, saved)
        self.assertIsNone(backup)

    def test_dry_run_does_not_write(self) -> None:
        saved = owner_profile.save_profile(self.profile_source, home=self.home)
        target = self.tmp / "USER.md"
        updated, _ = owner_profile.link_profile(target, saved, dry_run=True)
        self.assertIn(owner_profile.BEGIN_MARKER, updated)
        self.assertFalse(target.exists())

    def test_unlink_removes_only_the_block(self) -> None:
        saved = owner_profile.save_profile(self.profile_source, home=self.home)
        target = self.tmp / "CLAUDE.md"
        target.write_text("# My rules\n", encoding="utf-8")
        owner_profile.link_profile(target, saved)

        updated, _ = owner_profile.unlink_profile(target)

        self.assertEqual(updated, "# My rules\n")
        self.assertEqual(target.read_text(encoding="utf-8"), "# My rules\n")

    def test_duplicate_markers_are_refused(self) -> None:
        block = owner_profile.render_block("- x", Path("/p.md"))
        with self.assertRaises(ValueError):
            owner_profile.apply_block(block + "\n" + block, block)

    def test_host_paths(self) -> None:
        with mock.patch.dict(os.environ, {"OPENCLAW_WORKSPACE_DIR": str(self.tmp / "ws")}):
            self.assertEqual(owner_profile.resolve_host_file("openclaw"), self.tmp / "ws" / "USER.md")
        with mock.patch.dict(os.environ, {"OPENCLAW_PROFILE": "work"}, clear=False):
            os.environ.pop("OPENCLAW_WORKSPACE_DIR", None)
            self.assertEqual(
                owner_profile.resolve_host_file("openclaw"),
                Path.home() / ".openclaw-work" / "workspace" / "USER.md",
            )
        self.assertEqual(owner_profile.resolve_host_file("claude"), Path.home() / ".claude" / "CLAUDE.md")
        with self.assertRaises(ValueError):
            owner_profile.resolve_host_file("codex")

    def test_summary_limit_per_host(self) -> None:
        self.assertEqual(owner_profile.summary_limit("openclaw"), 3000)
        self.assertEqual(owner_profile.summary_limit("claude"), 3000)
        self.assertEqual(owner_profile.summary_limit(None), owner_profile.DEFAULT_MAX_SUMMARY_CHARS)
        self.assertEqual(owner_profile.summary_limit("openclaw", 100), 100)
        with mock.patch.dict(owner_profile.HOST_SUMMARY_LIMITS, {"openclaw": 10}):
            self.assertEqual(owner_profile.summary_limit("openclaw"), 10)

    def test_cli_link_refuses_summary_over_host_limit(self) -> None:
        env = dict(os.environ, DISTILLY_OWNER_HOME=str(self.home))
        script = str(TOOLS_DIR / "owner_profile.py")
        subprocess.run(
            [sys.executable, script, "save", "--profile", str(self.profile_source)],
            check=True, env=env, capture_output=True,
        )
        result = subprocess.run(
            [sys.executable, script, "link", "--target", str(self.tmp / "USER.md"),
             "--max-summary-chars", "10"],
            env=env, capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("keep it under 10", result.stderr)
        self.assertFalse((self.tmp / "USER.md").exists())

    def test_cli_save_and_link(self) -> None:
        env = dict(os.environ, DISTILLY_OWNER_HOME=str(self.home))
        target = self.tmp / "USER.md"
        script = str(TOOLS_DIR / "owner_profile.py")
        subprocess.run(
            [sys.executable, script, "save", "--profile", str(self.profile_source)],
            check=True, env=env, capture_output=True,
        )
        result = subprocess.run(
            [sys.executable, script, "link", "--target", str(target)],
            check=True, env=env, capture_output=True, text=True,
        )
        self.assertIn("Updated:", result.stdout)
        self.assertIn("Prefers short answers", target.read_text(encoding="utf-8"))

    def test_skill_writer_refuses_owner(self) -> None:
        result = subprocess.run(
            [sys.executable, str(TOOLS_DIR / "skill_writer.py"), "--action", "create",
             "--character", "self", "--slug", "me"],
            cwd=self.tmp, capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("owner_profile.py", result.stderr)

    def test_root_skill_documents_owner_flow(self) -> None:
        router = (REPO_ROOT / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("prompts/flows/owner.md", router)
        content = (REPO_ROOT / "prompts" / "flows" / "owner.md").read_text(encoding="utf-8")
        self.assertIn("prompts/owner/intake.md", content)
        self.assertIn("tools/owner_profile.py", content)
        for prompt in ("intake.md", "profile_builder.md"):
            self.assertTrue((REPO_ROOT / "prompts" / "owner" / prompt).exists())

    def test_owner_prompts_document_sources(self) -> None:
        intake = (REPO_ROOT / "prompts" / "owner" / "intake.md").read_text(encoding="utf-8")
        builder = (REPO_ROOT / "prompts" / "owner" / "profile_builder.md").read_text(encoding="utf-8")
        self.assertIn("Step 0", intake)
        self.assertIn("memory or chat-history", intake)
        self.assertIn("never asks for API keys", intake)
        self.assertIn("## Sources", builder)
        # The Sources section must come after the summary so it is never linked.
        self.assertLess(builder.index("## Always-on summary"), builder.index("## Sources"))


if __name__ == "__main__":
    unittest.main()
