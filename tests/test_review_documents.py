"""Contract tests for the two 2026-10-29 documents that claim code-level facts.

`docs/HARDENING_BACKLOG_2026-10-29.md` cites `path:line` plus an exact code fragment for
every finding, and `docs/REVIEW_3_PROJECTS_AI_GUIDE_2026-10-29.md` claims the guide ships
47 offline tests.  Both are checked here, so neither document can rot silently: if the code
moves, or a test count changes, these tests go red and the documents must be re-measured.

No subprocesses, no network, no dependency installs — pure static reads.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HARDENING = ROOT / "docs" / "HARDENING_BACKLOG_2026-10-29.md"
REVIEW = ROOT / "docs" / "REVIEW_3_PROJECTS_AI_GUIDE_2026-10-29.md"
GUIDE = ROOT / "docs" / "guides" / "ai-projects-3"

# `| H-01 | P2 | `hermes/auth.mjs:75` | `export async function changePassword` | … |`
ROW = re.compile(r"^\|\s*(H-\d{2})\s*\|\s*(P[1-3])\s*\|\s*`([^`:]+):(\d+)`\s*\|\s*`([^`]+)`\s*\|(.*)\|\s*$")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def rows() -> list[tuple[str, str, str, int, str, str]]:
    found = []
    for line in read(HARDENING).splitlines():
        match = ROW.match(line.strip())
        if match:
            found.append((match.group(1), match.group(2), match.group(3), int(match.group(4)),
                          match.group(5), match.group(6)))
    return found


class HardeningBacklogTests(unittest.TestCase):
    def test_document_exists_and_is_referenced_from_the_directive_index(self):
        self.assertTrue(HARDENING.is_file(), "the hardening backlog was deleted")
        index = read(ROOT / "docs" / "PROFESSIONAL_GUIDES_INDEX.md")
        self.assertIn("HARDENING_BACKLOG_2026-10-29.md", index)

    def test_every_finding_row_is_parsable_and_unique(self):
        found = rows()
        self.assertGreaterEqual(len(found), 9, "findings disappeared instead of being fixed")
        ids = [r[0] for r in found]
        self.assertEqual(ids, sorted(ids), "ids must stay in order")
        self.assertEqual(len(ids), len(set(ids)), "duplicate finding id")
        for ident, _, _, _, snippet, rest in found:
            self.assertTrue(snippet.strip(), f"{ident}: empty evidence fragment")
            self.assertRegex(rest, r"\w", f"{ident}: the row has no problem/remedy text")

    def test_every_cited_file_line_still_carries_the_quoted_code(self):
        """The whole point: a citation is only worth something if the code is still there."""
        for ident, _, path, line, snippet, _ in rows():
            target = ROOT / path
            with self.subTest(finding=ident, file=path, line=line):
                self.assertTrue(target.is_file(), f"{ident}: {path} does not exist")
                lines = read(target).splitlines()
                self.assertGreaterEqual(len(lines), line, f"{ident}: {path} has {len(lines)} lines")
                self.assertIn(snippet, lines[line - 1],
                              f"{ident}: {path}:{line} no longer contains {snippet!r}")

    def test_severities_stay_inside_the_declared_scale(self):
        doc = read(HARDENING)
        for level in ("P1", "P2", "P3"):
            self.assertIn(f"**{level}**", doc, f"severity {level} is not explained in the legend")
        self.assertNotIn("**P0**", doc, "a P0 finding must be fixed, not filed")


class GuideReviewTests(unittest.TestCase):
    def test_review_exists_and_points_at_the_guide_it_reviews(self):
        self.assertTrue(REVIEW.is_file())
        doc = read(REVIEW)
        self.assertIn("guides/ai-projects-3/README.md", doc)
        self.assertIn("docs/guides/ai-projects-3", read(ROOT / "docs" / "PROFESSIONAL_GUIDES_INDEX.md"))

    def test_the_claim_table_is_complete_and_numbered_once(self):
        """§3 is quoted in the summary as '19 measurable claims'; keep the count honest."""
        doc = read(REVIEW)
        table = doc.split("## ۳)", 1)[1].split("## ۴)", 1)[0]
        numbered = re.findall(r"^\|\s*(\d+)\s*\|", table, re.M)
        self.assertEqual([int(n) for n in numbered], list(range(1, 20)),
                         "the claim table must be rows 1..19 in order")

    def test_the_advertised_total_matches_the_suites_on_disk(self):
        tests = {"project-1-browser-summarizer/summarizer-core.test.mjs": 11,
                 "project-2-news-automation/feed-to-telegram.test.mjs": 15,
                 "project-3-rag-agent/test_rag.py": 21}
        for relative, expected in tests.items():
            with self.subTest(file=relative):
                body = read(GUIDE / relative)
                if relative.endswith(".py"):
                    found = len(re.findall(r"^\s*def (test_\w+)", body, re.M))
                else:
                    found = len(re.findall(r"^\s*(?:test|it)\(", body, re.M))
                self.assertEqual(found, expected)
        total = sum(tests.values())
        self.assertEqual(total, 47)
        persian_total = str(total).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
        for doc in (REVIEW, GUIDE / "README.md", GUIDE / "index.html"):
            with self.subTest(doc=doc.name):
                self.assertIn(persian_total, read(doc), f"{doc.name} does not advertise {persian_total} tests")


if __name__ == "__main__":
    unittest.main()
