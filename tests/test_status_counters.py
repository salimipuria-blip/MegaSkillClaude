"""Lock the *current-status* numbers of the central docs to their canonical sources.

Why this guard exists: counters in `PROGRESS.md` and the directives drifted silently
(6,019/5,738/30,080 and "59 root tests" stayed behind `triggers.json` and the real
`unittest` discovery) because the pre-existing guard in `test_project_documentation.py`
only covers four documents.

Rules enforced here:
  * Numbers in a **current status** section must equal the canonical source
    (`.claude/skills/mega-skills-router/references/triggers.json`, `scripts/doctor.mjs`,
    the static count of `tests/test_*.py`, `mobile/skills-index.json`).
  * Numbers inside a **dated heading section** are a historical snapshot: they are left
    untouched and deliberately not compared (the repo convention keeps history as-is).
  * A stale counter may therefore only survive inside a dated section, never in prose
    that claims to describe today.

Everything runs offline: no dependency installation, no network, no nested test run
(`test_no_python_test_spawns_a_nested_unittest_discovery` enforces the last part).
"""
from __future__ import annotations

import ast
import gzip
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TRIGGERS = ROOT / ".claude/skills/mega-skills-router/references/triggers.json"
GITHUB_INDEX = ROOT / "library/github-skills/INDEX.json"
DOCTOR = ROOT / "scripts/doctor.mjs"
MOBILE_INDEX = ROOT / "mobile/skills-index.json"
ROOT_PROGRESS = ROOT / "PROGRESS.md"
ROADMAP = ROOT / "ROADMAP.md"
MOBILE_DIRECTIVE = ROOT / "docs/directives/11-mobile-console.md"

# Same digit mapping the mobile console test already uses, so the guard reads the
# Persian-digit docs exactly the way they are written (including the ٬ separator).
FA_TABLE = str.maketrans("0123456789,", "۰۱۲۳۴۵۶۷۸۹٬")

# Sections whose heading carries a date are snapshots of that round, not today's state.
DATED_HEADING = re.compile(
    r"^##\s.*(?:\d{4}-\d{2}-\d{2}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|"
    r"[۰-۹٠-٩]{4}[-/][۰-۹٠-٩]{1,2}[-/][۰-۹٠-٩]{1,2})",
    re.MULTILINE,
)
ROOT_TEST_COUNT = re.compile(r"\*\*([۰-۹٠-٩,]+)\s+تست\s+(?:پایتون\s+)?ریشه\*\*")


def fa(number: int) -> str:
    """Render an integer the way these docs do: grouped, Persian digits."""
    return f"{number:,}".translate(FA_TABLE)


def read(path: Path) -> str:
    self_assert(path.is_file(), f"missing document: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def self_assert(condition: bool, message: str) -> None:
    """A guard must fail loudly when its own preconditions break."""
    if not condition:
        raise AssertionError(message)


def status_section(text: str, path: Path, heading: str = r"^##\s*۱\)\s*وضعیت مشترک\s*$") -> str:
    """Body of one `##` section, so a *current status* claim is never confused with a dated log."""
    match = re.search(heading, text, re.MULTILINE)
    self_assert(match is not None, f"{path.relative_to(ROOT)}: section matching {heading!r} not found")
    rest = text[match.end():]
    nxt = re.search(r"^##\s", rest, re.MULTILINE)
    return rest[: nxt.start()] if nxt else rest


def undated_lines(path: Path) -> list[tuple[int, str]]:
    """Lines that are NOT inside a dated-heading section, with 1-based line numbers."""
    lines = read(path).splitlines()
    dated: list[bool] = [False] * len(lines)
    active = False
    for index, line in enumerate(lines):
        if line.startswith("##"):
            active = bool(DATED_HEADING.match(line))
        dated[index] = active
    return [(index + 1, line) for index, line in enumerate(lines) if not dated[index]]


def where(path: Path, needle: str) -> list[int]:
    return [number for number, line in undated_lines(path) if needle in line]


def router_counts() -> dict[str, int]:
    data = json.loads(read(TRIGGERS))
    skills = data["skills"]
    counts = data["counts"]
    breakdown = {"core": 0, "project": 0, "github": 0}
    for skill in skills:
        source = skill.get("source_path", "")
        if source.startswith("library/skills/"):
            breakdown["project"] += 1
        elif source.startswith("library/github-skills/"):
            breakdown["github"] += 1
        else:
            breakdown["core"] += 1

    # Cross-check the index against itself before trusting any document.
    self_assert(counts["skills"] == len(skills), "triggers.json: counts.skills disagrees with len(skills)")
    self_assert(
        counts["routable_skills"] == counts["skills"] - counts["incomplete_skills"],
        "triggers.json: routable != skills - incomplete",
    )
    self_assert(sum(breakdown.values()) == counts["skills"], "triggers.json: breakdown does not add up")
    github_index = json.loads(read(GITHUB_INDEX))
    self_assert(
        len(github_index) == breakdown["github"],
        f"library/github-skills/INDEX.json ({len(github_index)}) disagrees with triggers.json github skills",
    )
    return {**counts, **breakdown}


def doctor_shape() -> tuple[int, int]:
    """(domains, steps) as declared in scripts/doctor.mjs — static, no subprocess."""
    text = read(DOCTOR)
    domains = re.findall(r"\bid:\s*'([^']+)'", text)
    steps = re.findall(r"\{\s*name:\s*'([^']+)'[^}]*?cmd:", text, re.S)
    self_assert(len(domains) > 0 and len(steps) > 0, "doctor.mjs: could not parse domains/steps")
    self_assert(len(set(domains)) == len(domains), "doctor.mjs: duplicate project id")
    return len(domains), len(steps)


def python_test_methods() -> int:
    """Static count of TestCase.test_* methods under tests/ — mirrors unittest discovery.

    Deliberately static: spawning `unittest discover` from inside a discovered test would
    recurse, and the number must stay deterministic and offline.
    """
    total = 0
    files = sorted((ROOT / "tests").glob("test_*.py"))
    self_assert(len(files) > 0, "tests/: no python test module found")
    for path in files:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            bases = [getattr(base, "id", getattr(base, "attr", "")) for base in node.bases]
            if "TestCase" not in bases:
                continue
            total += sum(
                1
                for item in node.body
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
                and item.name.startswith("test")
            )
    return total


class StatusCounterTests(unittest.TestCase):
    def test_router_counters_in_root_progress_match_canonical_index(self):
        counts = router_counts()
        section = status_section(read(ROOT_PROGRESS), ROOT_PROGRESS)

        for label, value in (
            ("skills", counts["skills"]),
            ("routable_skills", counts["routable_skills"]),
            ("incomplete_skills", counts["incomplete_skills"]),
            ("triggers", counts["triggers"]),
            ("core", counts["core"]),
            ("project", counts["project"]),
            ("github", counts["github"]),
        ):
            with self.subTest(counter=label):
                self.assertIn(fa(value), section)

        # A superseded counter may only live in a dated snapshot, never in today's status.
        stale = {"۶٬۰۱۹", "۵٬۷۳۸", "۳۰٬۰۸۰", "+ ۸ پروژه"}
        for needle in sorted(stale & set(re.findall(r"[۰-۹٬]+(?:\s*پروژه)?", section)) | stale):
            if needle in section:
                self.fail(f"PROGRESS.md «وضعیت مشترک» still carries the stale counter {needle!r}")

    def test_doctor_scope_counters_match_declared_gates(self):
        domains, steps = doctor_shape()
        section = status_section(read(ROOT_PROGRESS), ROOT_PROGRESS)
        with self.subTest(scope="domains"):
            self.assertIn(fa(domains), section)
        with self.subTest(scope="steps"):
            self.assertIn(fa(steps), section)

    def test_root_python_test_count_matches_discoverable_tests(self):
        expected = python_test_methods()
        section = status_section(read(ROOT_PROGRESS), ROOT_PROGRESS)
        found = [int(match.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٬", "0123456789,")))
                 for match in ROOT_TEST_COUNT.findall(section)]
        self.assertTrue(found, "PROGRESS.md «وضعیت مشترک» must state the current root python test count")
        self.assertEqual(found, [expected] * len(found))

    def test_no_python_test_spawns_a_nested_unittest_discovery(self):
        """Anti-recursion guard, earned the hard way.

        The first version of this module shelled out to
        `python3 -m unittest discover -s tests -p test_status_counters.py`. Because that
        pattern re-discovers *this* module, every run nested into itself (3 levels and
        ~46s observed) before failing. Counting tests must stay static; nothing under
        `tests/` may launch a python unittest discovery subprocess.
        """
        offenders: list[str] = []
        for path in sorted((ROOT / "tests").glob("test_*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                argv = node.args[0] if node.args else None
                if not isinstance(argv, (ast.List, ast.Tuple)):
                    continue
                parts = [el.value for el in argv.elts if isinstance(el, ast.Constant) and isinstance(el.value, str)]
                if "unittest" in parts and ("discover" in parts or "-m" in parts):
                    offenders.append(f"{path.name}:{node.lineno}: {' '.join(parts)}")
        self.assertEqual(offenders, [], "nested unittest discovery would recurse: " + "; ".join(offenders))

    def test_mobile_counters_are_current_outside_dated_snapshots(self):
        counts = router_counts()
        index = json.loads(read(MOBILE_INDEX))
        entries = index["skills"] if isinstance(index, dict) else index
        self.assertEqual(
            len(entries), counts["routable_skills"],
            "mobile/skills-index.json is stale: run `python3 mobile/build-index.py`",
        )

        for path, needles in (
            (MOBILE_DIRECTIVE, ["5738", "2237308", "408497"]),
            (ROADMAP, ["۵٬۷۳۸"]),
        ):
            for needle in needles:
                with self.subTest(document=path.name, stale=needle):
                    self.assertEqual(where(path, needle), [],
                                     f"{path.relative_to(ROOT)}: stale {needle} outside a dated section")

        self.assertIn(fa(counts["routable_skills"]), read(MOBILE_DIRECTIVE))

        # The directive must carry a measured CURRENT status, not only a dated snapshot.
        # The weight is recomputed from the committed artifact, so a stale byte count in
        # the doc fails on its own — nothing is hardcoded from a past run.
        current = status_section(read(MOBILE_DIRECTIVE), MOBILE_DIRECTIVE,
                                 heading=r"^##\s*وضعیتِ جاری\s*$")
        raw = MOBILE_INDEX.stat().st_size
        gzipped = len(gzip.compress(MOBILE_INDEX.read_bytes(), 9))
        for label, value in (("raw", raw), ("gzip", gzipped), ("budget", 3 * 1024 * 1024)):
            with self.subTest(weight=label):
                self.assertIn(fa(value), current)
        cache = re.search(r'const CACHE = "(mega-mobile-v1-[a-f0-9]+)"', read(ROOT / "mobile/sw.js"))
        self_assert(cache is not None, "mobile/sw.js: generated cache fingerprint line not found")
        self.assertIn(cache.group(1), current)

    def test_current_status_rule_is_written_in_the_directives_index(self):
        """The rule itself must be discoverable, not only enforced in code.

        Root cause of the original drift: nothing told a contributor that a number in a
        *current status* section has to come from a canonical source. Enforcing that only
        in a test file leaves the rule invisible to humans editing the docs.
        """
        index = read(ROOT / "docs/directives/README.md")
        for needle in ("منبع canonical", __file__.split("/")[-1], "تاریخ‌دار"):
            with self.subTest(requirement=needle):
                self.assertIn(needle, index)

    def test_directive_doctor_ids_and_index_links_stay_resolvable(self):
        """Every `doctor.mjs <id>` reference in the directives must be a real gate id,
        and every documented project id must have a matching directive file."""
        doctor_ids = set(re.findall(r"\bid:\s*'([^']+)'", read(DOCTOR)))
        self_assert(len(doctor_ids) >= 10, "doctor.mjs: suspiciously few ids parsed")

        for path in sorted((ROOT / "docs/directives").glob("*.md")):
            text = path.read_text(encoding="utf-8")
            for ref in set(re.findall(r"doctor\.mjs\s+([a-z][a-z0-9-]*)", text)):
                with self.subTest(directive=path.name, ref=ref):
                    self.assertIn(ref, doctor_ids, f"unknown doctor id referenced: {ref}")

        # Index <-> disk must agree in BOTH directions, so a new directive cannot be
        # orphaned and a renamed one cannot leave a dead link behind.
        index_path = ROOT / "docs/directives/README.md"
        index = read(index_path)
        linked = set(re.findall(r"\]\((\d{2}-[a-z0-9-]+\.md)\)", index))
        on_disk = {path.name for path in (ROOT / "docs/directives").glob("*.md")} - {"README.md"}

        for name in sorted(linked):
            with self.subTest(link=name):
                self.assertTrue((index_path.parent / name).is_file(), f"dead directive link: {name}")
        self.assertEqual(sorted(on_disk - linked), [], "directive file(s) missing from the index")

        # Every backticked project folder in the index table must exist on disk.
        for folder in sorted(set(re.findall(r"`([A-Za-z0-9_.\-]+(?:/[A-Za-z0-9_.\-]+)*/)`", index))):
            with self.subTest(folder=folder):
                self.assertTrue((ROOT / folder).is_dir(), f"index points at a missing folder: {folder}")

    def test_per_project_counters_in_roadmap_cite_a_dated_source(self):
        """Tier-B claims are quoted from each project book, so they must stay attributable."""
        text = read(ROADMAP)
        psk_line = next(line for line in text.splitlines() if "`psk/`" in line and "تست" in line)
        cham_line = next(line for line in text.splitlines() if "`fjcod/`" in line and "تست" in line)

        psk_book = read(ROOT / "psk/PROGRESS.md")
        cham_book = read(ROOT / "fjcod/PROGRESS.md")

        for line, book, label in ((psk_line, psk_book, "psk"), (cham_line, cham_book, "fjcod")):
            with self.subTest(project=label):
                self.assertIn("psk/PROGRESS.md" if label == "psk" else "fjcod/PROGRESS.md", line)
                # Every counter quoted in the roadmap row must exist in the project book.
                quoted = re.findall(r"([۰-۹٠-٩]+)\s*(?:تست|٪)", line)
                self.assertTrue(quoted, f"{label}: roadmap row lost its counters")
                for number in quoted:
                    self.assertIn(number, book, f"{label}: roadmap claims {number} which its book does not")


if __name__ == "__main__":
    unittest.main()
