"""Regressions for tasks/apply_hermes_tasks.py (plan-only, never merges).

Dependency-free; never invokes gh: every subprocess case exits before any
PR-creation path (validation, dry-run, forbidden-flag and task-count guards).
"""
import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLANNER = ROOT / "tasks" / "apply_hermes_tasks.py"

spec = importlib.util.spec_from_file_location("apply_hermes_tasks", PLANNER)
planner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(planner)


def run_planner(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(PLANNER), *args],
        cwd=ROOT, text=True, capture_output=True, timeout=60,
    )


class SanitizeTests(unittest.TestCase):
    def test_html_entities_decoded(self):
        self.assertEqual(planner.sanitize_text("header &amp; safety"), "header & safety")

    def test_markdown_link_pollution_removed_from_path(self):
        self.assertEqual(
            planner.sanitize_path("hermes/[setup.sh](http://setup.sh)"),
            "hermes/setup.sh",
        )

    def test_unsafe_paths_rejected(self):
        for bad in ("/etc/passwd", "~/secret", "../outside", "https://evil.example/x"):
            with self.assertRaises(ValueError, msg=bad):
                planner.sanitize_path(bad)


class PlannerCliTests(unittest.TestCase):
    def test_canonical_v2_manifest_validates(self):
        result = run_planner("--manifest", "tasks/hermes_tasks.json", "--validate-only")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("manifest: OK (100 task(s), schema hermes-tasks/v2)", result.stdout)

    def test_legacy_sample_validates(self):
        result = run_planner(
            "--manifest", "tasks/hermes_tasks.legacy.sample.json", "--validate-only")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("manifest: OK (2 task(s), schema legacy/v1)", result.stdout)

    def test_dry_run_is_read_only_plan(self):
        before = sorted(p.name for p in (ROOT / "tasks").iterdir())
        result = run_planner("--manifest", "tasks/hermes_tasks.legacy.sample.json")
        after = sorted(p.name for p in (ROOT / "tasks").iterdir())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("DRY-RUN", result.stdout)
        self.assertEqual(before, after)

    def test_only_filter_works_on_canonical_v2_manifest(self):
        # Regression: validation must run on the full 100-task manifest,
        # before --only filtering, or this always failed spuriously.
        result = run_planner("--manifest", "tasks/hermes_tasks.json", "--only", "1")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("#1", result.stdout)
        self.assertNotIn("#2 ", result.stdout)

    def test_forbidden_modes_fail_loudly(self):
        for flag in ("--apply", "--auto-merge"):
            result = run_planner(flag)
            self.assertEqual(result.returncode, 2, flag)
            self.assertIn("forbidden", result.stderr)

    def test_apply_pr_requires_exactly_one_task(self):
        result = run_planner(
            "--manifest", "tasks/hermes_tasks.legacy.sample.json",
            "--only", "1,2", "--apply-pr")
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("exactly one task", result.stderr)

    def test_missing_manifest_fails_cleanly(self):
        result = run_planner("--manifest", "tasks/does-not-exist.json", "--validate-only")
        self.assertEqual(result.returncode, 2)
        self.assertIn("ERROR: cannot load manifest", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
