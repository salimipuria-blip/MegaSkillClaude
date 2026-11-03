"""The local CI gate (scripts/verify.mjs) must cover exactly what .github/workflows/ci.yml runs.

The gate reads the workflow instead of copying its commands, so the danger is not stale commands
but a parser that quietly drops a step, or a new job the gate cannot place. Both would turn the
gate into a false green, which is worse than no gate. These tests pin it to the workflow text.
"""
from __future__ import annotations

import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CI = ROOT / ".github/workflows/ci.yml"


def plan() -> dict:
    result = subprocess.run(
        ["node", "scripts/verify.mjs", "--plan", "--json"],
        cwd=ROOT, capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        raise AssertionError(f"verify --plan exited {result.returncode}: {result.stderr or result.stdout}")
    return json.loads(result.stdout)


def job_blocks(text: str) -> dict[str, str]:
    body = text.split("\njobs:\n", 1)[1]
    parts = re.split(r"^  ([\w-]+):\n", body, flags=re.MULTILINE)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts) - 1, 2)}


class VerifyGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = plan()
        cls.blocks = job_blocks(CI.read_text(encoding="utf-8"))

    def test_every_ci_job_is_placed_and_nothing_extra(self):
        self.assertEqual(self.plan["problems"], [], "a CI job the gate cannot place would be silently unverified")
        self.assertEqual({j["id"] for j in self.plan["jobs"]}, set(self.blocks))

    def test_every_run_step_is_extracted(self):
        steps = {j["id"]: j["steps"] for j in self.plan["jobs"]}
        for job, block in self.blocks.items():
            with self.subTest(job=job):
                # Step-level `run:` keys only; `defaults: run: working-directory` is not a step.
                expected = len(re.findall(r"^ {6}- run:|^ {8}run:", block, flags=re.MULTILINE))
                self.assertEqual(steps[job], expected, f"{job}: parser dropped or invented a step")

    def test_repo_wide_jobs_always_run(self):
        selected = {j["id"] for j in self.plan["jobs"] if j["selected"]}
        for job in ("repo-health", "router", "commit-identity"):
            self.assertIn(job, selected)

    def test_project_jobs_are_scoped_to_their_folder(self):
        scopes = {j["id"]: j["scope"] for j in self.plan["jobs"]}
        self.assertEqual(scopes["infinity"], "infinity-mega-skill")
        self.assertEqual(scopes["hermes"], "hermes")
        self.assertEqual(scopes["viking-motion"], "viking-team/motion")
        for job, scope in scopes.items():
            with self.subTest(job=job):
                self.assertTrue((ROOT / scope).is_dir(), f"{job}: scope {scope} is not a folder")


if __name__ == "__main__":
    unittest.main()
