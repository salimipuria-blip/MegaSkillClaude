"""Guard for `scripts/check_commit_identity.py` (backlog task 98).

Two failure modes matter here and the tests cover both directions:
  * a message that attributes the change to a model must be caught — including the exact trailer that
    this repository's inherited history is full of (181 hits over 235 commits, measured with
    `--all-history`), otherwise the checker is decoration;
  * a message that merely talks *about* AI products must stay clean, because this repo legitimately
    mentions `claude.ai` builds, `.claude/skills`, `CLAUDE.md`, `GEMINI_API_KEY` and provider model
    ids such as `openai/gpt-4.1`. A checker that flags those gets switched off within a week.
"""
import contextlib
import importlib.util
import io
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/check_commit_identity.py"


def _load_checker():
    spec = importlib.util.spec_from_file_location("check_commit_identity", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


checker = _load_checker()

# (label, message). Each one is a way a model identity leaks into a commit or a pull request.
ATTRIBUTION = (
    ("the trailer this repo's history actually carries",
     "fix: typo in the sticker manifest\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"),
    ("a plain co-author trailer",
     "feat: add the router index\n\nCo-authored-by: Claude <noreply@anthropic.com>"),
    ("vendor domain without a product name",
     "chore: bump lockfiles\n\nCo-Authored-By: Someone <bots@anthropic.com>"),
    ("generated-with an assistant",
     "docs: rewrite the setup guide\n\n\U0001f916 Generated with a coding assistant"),
    ("AI-generated marker",
     "feat: new endpoint\n\nAI-generated patch, reviewed by hand before merging"),
    ("model named as the author",
     "fix: migration order\n\nClaude wrote the migration and the tests for it"),
    ("written by a product",
     "docs: meeting notes\n\nWritten by ChatGPT from the transcript"),
    ("speaking as an AI",
     "chore: notes\n\nI am an AI assistant, so I cannot run this locally"),
    ("signed-off by a bot",
     "feat: ci step\n\nSigned-off-by: Copilot <copilot@github.com>"),
)

# Real subjects/bodies from this repository, including the commit that added the checker itself.
CLEAN = (
    "feat(repo): execute the backlog batch — router aliases, guarded counters, reproducible stickers, "
    "Supabase readiness, claude.ai skill zips",
    "feat(repo): build the claude.ai skill zips from the router index (full 16.8 MB, lite 3.2 MB)",
    "docs(router): keep .claude/skills and the plugin copy of CLAUDE.md in sync",
    "fix(hermes): actionable /status text when GEMINI_API_KEY is invalid or the catalog is empty",
    "feat(hermes): park a provider in KV for an hour after three 401/403 responses",
    "chore(providers): refresh the free model list (openai/gpt-4.1, meta/Llama-3.3-70B-Instruct)",
    "test(hermes): the prompt budget keeps memory and project knowledge for every provider",
    "docs: add viking-team/SETUP.md, the owner's Supabase checklist",
    "ci: run the mocked Supabase readiness checker in the repo-health job",
)


def run_main(argv, stdin_text=None):
    """Run the checker's main() with captured stdout, optionally feeding stdin."""
    out, err = io.StringIO(), io.StringIO()
    original_stdin = None
    if stdin_text is not None:
        import sys
        original_stdin = sys.stdin
        sys.stdin = io.StringIO(stdin_text)
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = checker.main(argv)
    finally:
        if original_stdin is not None:
            import sys
            sys.stdin = original_stdin
    return code, out.getvalue(), err.getvalue()


def dangling_commit(message: str) -> str:
    """Create a commit object that no ref points at: real git input, no branch and no history touched."""
    result = subprocess.run(["git", "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", message],
                            cwd=ROOT, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


class CommitIdentityTests(unittest.TestCase):
    def test_every_attribution_form_is_flagged(self):
        for label, message in ATTRIBUTION:
            with self.subTest(case=label):
                claims = checker.find_identity_claims(message)
                self.assertTrue(claims, f"not flagged: {label}")
                self.assertTrue(all(claim["pattern"] for claim in claims))

    def test_talking_about_ai_products_is_not_an_identity_claim(self):
        for message in CLEAN:
            with self.subTest(subject=message[:48]):
                self.assertEqual(checker.find_identity_claims(message), [],
                                 f"a legitimate message was flagged: {message!r}")

    def test_a_planted_trailer_in_a_real_commit_object_turns_the_check_red(self):
        """The mutation the backlog asks for, at git level: a bad message must fail, a good one pass."""
        bad = dangling_commit("fix: planted for the identity guard\n\n"
                              "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")
        good = dangling_commit("fix: planted for the identity guard\n\nNo trailer here.")
        for sha, expected in ((bad, 1), (good, 0)):
            with self.subTest(expected=expected):
                code, out, _ = run_main(["--range", f"{sha}^..{sha}", "--json"])
                payload = json.loads(out)
                self.assertEqual(code, expected)
                self.assertEqual(payload["scanned"], 1, "exactly the planted commit must be scanned")
                if expected:
                    self.assertEqual(payload["findings"][0]["pattern"], "co-author trailer")
                    self.assertIn("anthropic.com", payload["findings"][0]["context"])

    def test_the_work_under_review_is_clean(self):
        """The range CI uses; it falls back to HEAD when the base ref was not fetched (shallow clone)."""
        code, out, _ = run_main(["--range", "origin/main...HEAD", "--json"])
        payload = json.loads(out)
        self.assertEqual(code, 0, f"this branch carries an identity claim: {payload['findings']}")
        self.assertGreaterEqual(payload["scanned"], 1, "scanning nothing must not be reported as a pass")

    def test_scanning_nothing_is_a_usage_error_unless_it_is_declared_optional(self):
        code, _, err = run_main(["--stdin", "pull request"], stdin_text="   \n")
        self.assertEqual(code, 2)
        self.assertIn("refusing to report a pass", err)
        code, out, _ = run_main(["--stdin", "pull request", "--allow-empty"], stdin_text="")
        self.assertEqual(code, 0)
        self.assertIn("--allow-empty", out)

    def test_a_pull_request_text_is_scanned_as_one_message(self):
        code, out, _ = run_main(["--stdin", "pull request #98", "--json"],
                                stdin_text="feat: nothing to see\n\nGenerated with an AI assistant")
        self.assertEqual(code, 1)
        payload = json.loads(out)
        self.assertEqual(payload["scanned"], 1)
        self.assertEqual(payload["findings"][0]["commit"], "pull request #98")

    def test_the_inherited_history_is_measurable_and_not_silently_dropped(self):
        """`--all-history` is an audit mode: it must see every commit, clean or not."""
        result = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=ROOT,
                                capture_output=True, text=True, timeout=60)
        reachable = int(result.stdout.strip() or 0)
        code, out, _ = run_main(["--all-history", "--json"])
        payload = json.loads(out)
        self.assertEqual(payload["scanned"], reachable)
        self.assertIn(code, (0, 1), "the audit mode reports findings, it does not crash")
        # Remediation of what it finds means rewriting published history: owner approval, not this test.


if __name__ == "__main__":
    unittest.main()
