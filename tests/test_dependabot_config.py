"""Guard for .github/dependabot.yml.

Keeps two decisions from silently regressing:
- every update entry groups minor/patch bumps (one PR instead of one per package);
- Remotion and its CLI are bumped together, because viking-team/motion pins them to the same
  version (tests/composition.test.mjs). A split bump turns CI red.

Stdlib-only on purpose: CI runs unittest without PyYAML, so the file is checked as text blocks.
"""

import pathlib
import unittest

CONFIG = pathlib.Path(__file__).resolve().parents[1] / ".github" / "dependabot.yml"


def blocks(text):
    """Split the updates list into one text block per `- package-ecosystem` entry."""
    parts = text.split("\n  - package-ecosystem:")
    return parts[1:]


class DependabotConfigTest(unittest.TestCase):
    def setUp(self):
        self.text = CONFIG.read_text(encoding="utf-8")
        self.entries = blocks(self.text)

    def test_every_entry_groups_minor_and_patch(self):
        self.assertTrue(self.entries, "no update entries found")
        for block in self.entries:
            with self.subTest(entry=block.splitlines()[0]):
                self.assertIn("groups:", block)
                self.assertIn('update-types: ["minor", "patch"]', block)

    def test_motion_groups_remotion_and_cli_together(self):
        motion = next(b for b in self.entries if "/viking-team/motion" in b)
        self.assertIn('- "remotion"', motion)
        self.assertIn('- "@remotion/*"', motion)
        self.assertIn('- "react"', motion)

    def test_npm_directories_are_the_runnable_manifests(self):
        for directory in ["/psk", "/lithos", "/fjcod", "/bison-brand-book", "/hermes", "/viking-team/motion"]:
            self.assertTrue(any(f'directory: "{directory}"' in b for b in self.entries), directory)


if __name__ == "__main__":
    unittest.main()
