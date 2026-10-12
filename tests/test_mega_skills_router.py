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
                self.assertEqual(self.search(copy, "طراحی لوگو")[0], "visual-design-brief")

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
            self.assertEqual(index["counts"]["routable_skills"], 5705)

    def test_indexed_paths_exist(self):
        project = _load(COPIES["project"])
        results = project.search_index(COPIES["project"] / "references" / "triggers.json", "code", min_score=0.0)
        self.assertTrue(results)
        for item in results[:200]:
            self.assertTrue(Path(item["path"]).is_file(), item["path"])


if __name__ == "__main__":
    unittest.main()
