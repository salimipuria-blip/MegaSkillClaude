"""Regressions for the iPhone console (mobile/) and its repo skill."""
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOBILE = ROOT / "mobile"
SKILL = ROOT / "library/skills/online-vscode-mobile-coding/SKILL.md"


class MobileConsoleTests(unittest.TestCase):
    def test_console_files_exist(self):
        for name in ("index.html", "styles.css", "app.js", "sw.js",
                     "manifest.webmanifest", "skills-index.json", "icon.svg"):
            self.assertTrue((MOBILE / name).is_file(), name)

    def test_manifest_is_valid_pwa(self):
        manifest = json.loads((MOBILE / "manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual(manifest["display"], "standalone")
        self.assertTrue(manifest["icons"])

    def test_console_links_to_online_vscode(self):
        html = (MOBILE / "index.html").read_text(encoding="utf-8")
        js = (MOBILE / "app.js").read_text(encoding="utf-8")
        self.assertIn("manifest.webmanifest", html)
        self.assertIn("https://vscode.dev/github/", js)
        self.assertNotIn("sb_secret_", html + js)

    def test_skills_index_matches_builder(self):
        result = subprocess.run(
            [sys.executable, str(MOBILE / "build-index.py"), "--check"],
            cwd=ROOT, text=True, capture_output=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


class OnlineVscodeSkillTests(unittest.TestCase):
    def test_skill_registered_and_routable(self):
        self.assertTrue(SKILL.is_file())
        index = json.loads(
            (ROOT / ".claude/skills/mega-skills-router/references/triggers.json")
            .read_text(encoding="utf-8"))
        entry = [s for s in index["skills"] if s["name"] == "online-vscode-mobile-coding"]
        self.assertEqual(len(entry), 1)
        self.assertEqual(entry[0]["source_path"],
                         "library/skills/online-vscode-mobile-coding/SKILL.md")

    def test_router_finds_the_skill(self):
        result = subprocess.run(
            [sys.executable,
             str(ROOT / ".claude/skills/mega-skills-router/scripts/route.py"),
             "کدنویسی آنلاین با vscode از آیفون"],
            cwd=ROOT, text=True, capture_output=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)[0]["name"],
                         "online-vscode-mobile-coding")


if __name__ == "__main__":
    unittest.main()
