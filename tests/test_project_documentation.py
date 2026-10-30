"""Keep per-project progress books, directives, and doctor IDs discoverable."""
from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

PROJECTS = {
    "psk": ("psk/PROGRESS.md", "psk/README.md", "docs/directives/01-psk-mega-skills.md"),
    "hermes": ("hermes/PROGRESS.md", "hermes/README.md", "docs/directives/02-hermes.md"),
    "fjcod": ("fjcod/PROGRESS.md", "fjcod/README.md", "docs/directives/03-fjcod-cham.md"),
    "lithos": ("lithos/PROGRESS.md", "lithos/README.md", "docs/directives/04-lithos.md"),
    "viking-team": ("viking-team/PROGRESS.md", "viking-team/README.md", "docs/directives/05-viking-team.md"),
    "viking-motion": (
        "viking-team/motion/PROGRESS.md",
        "viking-team/motion/README_FA.md",
        "docs/directives/12-viking-motion-study.md",
    ),
    "bison-brand-book": (
        "bison-brand-book/PROGRESS.md",
        "bison-brand-book/README.md",
        "docs/directives/06-bison-brand-book.md",
    ),
    "orchestrator": (
        "orchestrator/PROGRESS.md",
        "orchestrator/README.md",
        "docs/directives/07-orchestrator.md",
    ),
    "router": (
        "plugins/mega-skills-router/PROGRESS.md",
        "plugins/mega-skills-router/README.md",
        "docs/directives/08-skills-library-router.md",
    ),
    "brand-stickers": (
        "brands/viking-offroad/PROGRESS.md",
        "brands/viking-offroad/stickers/README.md",
        "docs/directives/09-viking-brand-assets.md",
    ),
    "brand-viking": (
        "brand/viking/PROGRESS.md",
        "brand/viking/README.md",
        "docs/directives/10-viking-content-renderer.md",
    ),
    "mobile": ("mobile/PROGRESS.md", "mobile/README.md", "docs/directives/11-mobile-console.md"),
    "apex": ("apex-agent/PROGRESS.md", "apex-agent/README.md", "docs/directives/13-apex-agent.md"),
}


class ProjectDocumentationTests(unittest.TestCase):
    def test_monorepo_has_a_separate_cross_project_progress_book(self):
        progress = (ROOT / "PROGRESS.md").read_text(encoding="utf-8")
        self.assertIn("آخرین به‌روزرسانی", progress)
        self.assertIn("لاگ جریان", progress)
        self.assertIn("دفتر جریان ریشه", (ROOT / "README.md").read_text(encoding="utf-8"))

    def test_each_project_has_readme_progress_and_directive(self):
        for project, (progress, readme, directive) in PROJECTS.items():
            with self.subTest(project=project):
                for relative in (progress, readme, directive):
                    path = ROOT / relative
                    self.assertTrue(path.is_file(), f"{project}: missing {relative}")
                    self.assertGreater(path.stat().st_size, 0, f"{project}: empty {relative}")

                progress_text = (ROOT / progress).read_text(encoding="utf-8")
                self.assertRegex(progress_text, r"آخرین به‌روزرسانی")
                self.assertRegex(progress_text, r"لاگ جریان")

    def test_central_indexes_link_each_progress_book_and_directive(self):
        root_readme = (ROOT / "README.md").read_text(encoding="utf-8")
        directive_index = (ROOT / "docs/directives/README.md").read_text(encoding="utf-8")
        doctor = (ROOT / "scripts/doctor.mjs").read_text(encoding="utf-8")

        for project, (progress, _readme, directive) in PROJECTS.items():
            with self.subTest(project=project):
                self.assertIn(f"{progress})", root_readme)
                self.assertIn(f"node scripts/doctor.mjs {project}", root_readme)
                self.assertIn(Path(directive).name, directive_index)
                self.assertRegex(doctor, rf"id:\s*['\"]{re.escape(project)}['\"]")

    def test_router_counts_match_canonical_indexes_and_bootstrap_copies(self):
        router_index = json.loads(
            (ROOT / ".claude/skills/mega-skills-router/references/triggers.json").read_text(encoding="utf-8")
        )
        github_index = json.loads((ROOT / "library/github-skills/INDEX.json").read_text(encoding="utf-8"))
        project_skills = [
            skill for skill in router_index["skills"]
            if skill["source_path"].startswith("library/skills/")
        ]
        counts = router_index["counts"]

        self.assertEqual(counts["skills"], len(router_index["skills"]))
        self.assertEqual(counts["incomplete_skills"], 0)
        self.assertEqual(counts["routable_skills"], counts["skills"] - counts["incomplete_skills"])
        self.assertEqual(len(project_skills), 18)
        self.assertEqual(len(github_index), 2946)

        docs = {
            "plugin README": (ROOT / "plugins/mega-skills-router/README.md").read_text(encoding="utf-8"),
            "library README": (ROOT / "library/README.md").read_text(encoding="utf-8"),
            "GitHub library README": (ROOT / "library/github-skills/README.md").read_text(encoding="utf-8"),
            "router directive": (ROOT / "docs/directives/08-skills-library-router.md").read_text(encoding="utf-8"),
        }
        for label in ("plugin README", "library README", "router directive"):
            with self.subTest(document=label):
                self.assertIn(f"{counts['skills']:,}", docs[label])
                self.assertIn(f"{counts['routable_skills']:,}", docs[label])
                self.assertIn(f"{counts['incomplete_skills']}", docs[label])
                self.assertIn(f"{counts['triggers']:,}", docs[label])
        self.assertIn(f"{len(github_index):,}", docs["GitHub library README"])
        self.assertIn(f"{counts['incomplete_skills']}", docs["GitHub library README"])
        self.assertIn(f"{len(project_skills)}", docs["library README"])

        def description(relative):
            text = (ROOT / relative).read_text(encoding="utf-8")
            return next(line for line in text.splitlines() if line.startswith("description:"))

        canonical = description(".claude/skills/mega-skills-router/SKILL.md")
        portable = description("plugins/mega-skills-router/skills/mega-skills-router/SKILL.md")
        self.assertEqual(canonical, portable)

    def test_shared_context_and_status_are_marked_as_separate_from_live_validation(self):
        directives = (ROOT / "docs/directives/README.md").read_text(encoding="utf-8")
        roadmap = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
        self.assertIn("همان نوبت", directives)
        self.assertIn("تأیید سرویس زنده", directives)
        self.assertIn("تست محلی", roadmap)
        self.assertIn("deployment", roadmap)


if __name__ == "__main__":
    unittest.main()
