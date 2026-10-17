"""Ranking tests for both copies of the Mega Skills Router (project skill and plugin)."""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COPIES = {
    "project": ROOT / ".claude/skills/mega-skills-router",
    "plugin": ROOT / "plugins/mega-skills-router/skills/mega-skills-router",
}


def _load(skill_dir: Path):
    spec = importlib.util.spec_from_file_location(f"route_{skill_dir.parent.name}", skill_dir / "scripts" / "route.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RouterRankingTest(unittest.TestCase):
    def search(self, copy: str, query: str) -> list[str]:
        skill_dir = COPIES[copy]
        results = _load(skill_dir).search_index(skill_dir / "references" / "triggers.json", query)
        return [item["name"] for item in results]

    def test_exact_skill_name_ranks_first(self):
        for copy in COPIES:
            with self.subTest(copy=copy):
                self.assertEqual(self.search(copy, "react performance")[0], "react-performance")

    def test_inflected_words_match_skill_names(self):
        for copy in COPIES:
            with self.subTest(copy=copy):
                self.assertIn(self.search(copy, "write a python test")[0], {"python-testing", "python-testing-patterns"})

    def test_persian_query_routes(self):
        for copy in COPIES:
            with self.subTest(copy=copy):
                # «لوگو» folds to "logo", so Persian and English logo skills compete on equal terms.
                results = self.search(copy, "طراحی لوگو")
                self.assertEqual(results[0], "pro-brand-identity")
                self.assertIn("visual-design-brief", results[:10])

    def test_pro_pack_routes_persian_and_english_intents(self):
        expected = {
            "بازبینی کد": "pro-code-review", "دیباگ": "pro-debugging", "write tests": "pro-testing-strategy",
            "react typescript": "pro-frontend-engineering", "امنیت سایت": "pro-security-review",
            "دیزاین سیستم": "pro-ui-design-system", "طراحی تجربه کاربری": "pro-ux-design",
            "هویت بصری": "pro-brand-identity", "حل تعارض گیت": "pro-git-workflow",
        }
        for copy in COPIES:
            for query, name in expected.items():
                with self.subTest(copy=copy, query=query):
                    self.assertEqual(self.search(copy, query)[0], name)
        for name in set(expected.values()) | {"pro-backend-api-design"}:
            self.assertTrue((ROOT / "library/skills" / name / "SKILL.md").is_file(), name)

    def test_copies_return_the_same_ranking(self):
        for query in ("instagram content", "excel dashboard", "تحلیل داده فروش"):
            with self.subTest(query=query):
                self.assertEqual(self.search("project", query), self.search("plugin", query))

    def test_incomplete_skills_are_opt_in_only(self):
        for copy, directory in COPIES.items():
            with self.subTest(copy=copy):
                module = _load(directory)
                path = directory / "references/triggers.json"
                default = module.search_index(path, "configure-ecc")
                self.assertNotIn("configure-ecc", [s["name"] for s in default])
                reviewed = module.search_index(path, "configure-ecc", include_incomplete=True)
                self.assertEqual(reviewed[0]["name"], "configure-ecc")

    def test_both_indexes_mirror_the_canonical_incomplete_flags(self):
        github = json.loads((ROOT / "library/github-skills/INDEX.json").read_text())
        expected = {s["name"] for s in github if s.get("incomplete")}
        self.assertEqual(len(expected), 281)
        for directory in COPIES.values():
            index = json.loads((directory / "references/triggers.json").read_text())
            self.assertEqual({s["name"] for s in index["skills"] if s.get("incomplete")}, expected)
            self.assertEqual(index["counts"]["routable_skills"], len(index["skills"]) - len(expected))

    def test_matt_pocock_pack_survives_canonical_portable_synchronization(self):
        github = json.loads((ROOT / "library/github-skills/INDEX.json").read_text())
        pack = {s["name"] for s in github if s["repo"] == "mattpocock/skills"}
        self.assertGreaterEqual(len(pack), 31)
        self.assertTrue({"ask-matt", "mp-code-review", "tdd", "to-tickets"} <= pack)
        for directory in COPIES.values():
            index = json.loads((directory / "references/triggers.json").read_text())
            self.assertTrue(pack <= {s["name"] for s in index["skills"]})
        for name in pack:
            canonical = ROOT / "library/github-skills" / name / "SKILL.md"
            portable = COPIES["plugin"] / "references/skills" / name / "INSTRUCTIONS.md"
            self.assertEqual(canonical.read_bytes(), portable.read_bytes())
        license_name = "mattpocock__skills__LICENSE"
        self.assertEqual((ROOT / "library/github-skills/_licenses" / license_name).read_bytes(),
                         (COPIES["plugin"] / "references/licenses" / license_name).read_bytes())

    def test_phrase_match_is_word_bounded(self):
        """A short query used to substring-match unrelated triggers ("ai" in "maintain", "art" in "start")."""
        for copy, directory in COPIES.items():
            module = _load(directory)
            path = directory / "references/triggers.json"
            for query in ("ai", "art", "test"):
                with self.subTest(copy=copy, query=query):
                    results = module.search_index(path, query)
                    self.assertTrue(results)
                    for item in results:
                        self.assertTrue(module._tokens(query) & module._tokens(item["matched_trigger"]), item)

    def test_multiword_and_zwnj_aliases_fold(self):
        for copy, directory in COPIES.items():
            module = _load(directory)
            with self.subTest(copy=copy):
                self.assertEqual(module._tokens("برنامه‌نویسی"), {"code"})
                self.assertEqual(module._tokens("برنامه نویسی"), {"code"})
                self.assertEqual(module._tokens("کسب و کار"), {"business"})
                self.assertEqual(module._tokens("کسب‌وکار"), {"business"})
                self.assertEqual(module._tokens("اينستاگرام"), {"instagram"})

    def test_rare_words_outweigh_generic_ones(self):
        """In "سئو سایت" a skill that only matches the generic "site" must not pass as an SEO match."""
        for copy, directory in COPIES.items():
            module = _load(directory)
            with self.subTest(copy=copy):
                results = module.search_index(directory / "references/triggers.json", "سئو سایت")
                self.assertEqual(results[0]["name"], "seo")
                for item in results:
                    matched = module._tokens(item["matched_trigger"]) | module._tokens(item["name"])
                    self.assertIn("seo", matched, item)

    def test_cli_falls_back_to_partial_matches(self):
        import contextlib
        import io
        query = "کپشن اینستاگرام تور آفرود"
        for copy, directory in COPIES.items():
            module = _load(directory)
            path = directory / "references/triggers.json"
            with self.subTest(copy=copy):
                self.assertEqual(module.search_index(path, query), [])
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    module.main([query, "--index", str(path)])
                self.assertTrue(json.loads(out.getvalue()))
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    module.main([query, "--index", str(path), "--min-score", "0.5"])
                self.assertEqual(json.loads(out.getvalue()), [])

    def test_cli_limits_output(self):
        import contextlib
        import io
        for copy, directory in COPIES.items():
            module = _load(directory)
            with self.subTest(copy=copy):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    module.main(["ai", "--limit", "3", "--index", str(directory / "references/triggers.json")])
                self.assertEqual(len(json.loads(out.getvalue())), 3)
                with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
                    module.main(["ai", "--index", str(directory / "missing.json")])

    def test_indexed_paths_exist(self):
        project = _load(COPIES["project"])
        results = project.search_index(COPIES["project"] / "references" / "triggers.json", "code", min_score=0.0)
        self.assertTrue(results)
        for item in results[:200]:
            self.assertTrue(Path(item["path"]).is_file(), item["path"])


if __name__ == "__main__":
    unittest.main()
