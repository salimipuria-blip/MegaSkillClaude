"""Regressions for the iPhone console (mobile/) and its repo skill."""
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOBILE = ROOT / "mobile"
SKILL = ROOT / "library/skills/online-vscode-mobile-coding/SKILL.md"


class MobileConsoleTests(unittest.TestCase):
    def test_console_files_exist(self):
        for name in ("index.html", "styles.css", "app.js", "search.mjs", "sw.js",
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
        self.assertIn('<script type="module" src="app.js">', html)
        self.assertIn("https://vscode.dev/github/", js)
        self.assertIn("escapeHtml", js)
        self.assertNotIn("sb_secret_", html + js)

    def test_project_cards_cover_each_doctor_project_and_count_is_current(self):
        app = (MOBILE / "app.js").read_text(encoding="utf-8")
        html = (MOBILE / "index.html").read_text(encoding="utf-8")
        manifest = json.loads((MOBILE / "manifest.webmanifest").read_text(encoding="utf-8"))
        project_ids = set(re.findall(r'id: "([a-z0-9-]+)"', app))
        doctor_ids = {
            "psk", "hermes", "fjcod", "lithos", "viking-team", "viking-motion",
            "bison-brand-book", "orchestrator", "router", "mobile", "brand-stickers", "brand-viking",
        }
        self.assertTrue(doctor_ids.issubset(project_ids))
        count = json.loads((MOBILE / "skills-index.json").read_text(encoding="utf-8"))["counts"]["routable_skills"]
        localized_count = f"{count:,}".translate(str.maketrans("0123456789,", "۰۱۲۳۴۵۶۷۸۹٬"))
        self.assertIn(localized_count, html)
        self.assertIn(localized_count, manifest["description"])

    def test_skills_index_and_service_worker_match_builder(self):
        result = subprocess.run(
            [sys.executable, str(MOBILE / "build-index.py"), "--check"],
            cwd=ROOT, text=True, capture_output=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("cache mega-mobile-v1-", result.stdout)

    def test_precached_asset_change_invalidates_service_worker_cache(self):
        with tempfile.TemporaryDirectory(prefix="mobile pwa ") as directory:
            root = Path(directory)
            mobile = root / "mobile"
            mobile.mkdir()
            (mobile / "build-index.py").write_bytes((MOBILE / "build-index.py").read_bytes())
            (mobile / "sw.js").write_bytes((MOBILE / "sw.js").read_bytes())

            asset_names = (
                "index.html", "styles.css", "app.js", "search.mjs", "manifest.webmanifest",
                "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png",
            )
            for name in asset_names:
                (mobile / name).write_text(f"fixture:{name}\n", encoding="utf-8")

            source = root / ".claude/skills/mega-skills-router/references/triggers.json"
            source.parent.mkdir(parents=True)
            source.write_text(json.dumps({"skills": [{
                "name": "fixture-skill", "domain": "general",
                "source_path": "psk/data/skills/fixture-skill/SKILL.md",
                "triggers": ["fixture"],
            }]}), encoding="utf-8")

            command = [sys.executable, str(mobile / "build-index.py")]
            built = subprocess.run(command, cwd=root, text=True, capture_output=True, timeout=30)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            old_cache = re.search(r'const CACHE = "(mega-mobile-v1-[a-f0-9]+)"', (mobile / "sw.js").read_text()).group(1)

            (mobile / "app.js").write_text("changed application shell\\n", encoding="utf-8")
            stale = subprocess.run(command + ["--check"], cwd=root, text=True, capture_output=True, timeout=30)
            self.assertEqual(stale.returncode, 2)
            self.assertIn("mobile/sw.js cache fingerprint is stale", stale.stderr)

            rebuilt = subprocess.run(command, cwd=root, text=True, capture_output=True, timeout=30)
            self.assertEqual(rebuilt.returncode, 0, rebuilt.stdout + rebuilt.stderr)
            new_cache = re.search(r'const CACHE = "(mega-mobile-v1-[a-f0-9]+)"', (mobile / "sw.js").read_text()).group(1)
            self.assertNotEqual(old_cache, new_cache)
            checked = subprocess.run(command + ["--check"], cwd=root, text=True, capture_output=True, timeout=30)
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)


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
