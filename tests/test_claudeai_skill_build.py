"""Acceptance tests for `scripts/build_claudeai_skill.py` (backlog task 6).

The backlog accepts this task only if (a) every `path` a router result returns exists in *both*
zips and (b) the lite build stays under 5 MB. Both are checked here against complete builds — no
sampling — because a sampled zip would prove membership for files that are easy to ship and stay
silent about the 2,946 GitHub-skill entries that make the full variant heavy.
"""
import hashlib
import importlib.util
import io
import json
import shutil
import subprocess
import sys
import contextlib
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts/build_claudeai_skill.py"
PLUGIN_ROUTE = ROOT / "plugins/mega-skills-router/skills/mega-skills-router/scripts/route.py"
CANONICAL_INDEX = ROOT / ".claude/skills/mega-skills-router/references/triggers.json"

# Task 5's acceptance query: the Persian form must route inside the packaged build too.
QUERIES = {
    "lite": ["کپشن خنده دار هالووین", "caption funny halloween"],
    "full": ["telegram bot builder"],
}


def _load_builder():
    spec = importlib.util.spec_from_file_location("build_claudeai_skill", BUILDER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = _load_builder()


def _run_router(skill_dir: Path, query: str) -> list[dict]:
    """Run the *packaged* router exactly as claude.ai would: no --index, no repo checkout."""
    result = subprocess.run([sys.executable, str(skill_dir / "scripts/route.py"), query],
                            cwd=skill_dir, capture_output=True, text=True, timeout=180)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


class ClaudeAiSkillBuildTests(unittest.TestCase):
    reports: dict[str, dict] = {}
    workspace: Path | None = None

    @classmethod
    def setUpClass(cls):
        cls.workspace = Path(tempfile.mkdtemp(prefix="claudeai-skill-"))
        cls.reports = {variant: builder.build_variant(variant, cls.workspace / variant)
                       for variant in ("lite", "full")}

    @classmethod
    def tearDownClass(cls):
        if cls.workspace is not None:
            shutil.rmtree(cls.workspace, ignore_errors=True)

    def zip_path(self, variant: str) -> Path:
        return Path(self.reports[variant]["zip"])

    def test_lite_build_stays_under_the_upload_budget(self):
        size = int(self.reports["lite"]["bytes"])
        self.assertGreater(size, 1_000_000, "a lite zip this small is not carrying the library")
        self.assertLessEqual(size, builder.LITE_BUDGET_BYTES,
                             f"lite build is {size:,} B, over the {builder.LITE_BUDGET_BYTES:,} B ceiling")

    def test_full_build_carries_the_whole_library(self):
        counts = self.reports["full"]["counts"]
        canonical = json.loads(CANONICAL_INDEX.read_text(encoding="utf-8"))["counts"]
        self.assertEqual(counts["skills"], canonical["skills"])
        self.assertEqual(counts["triggers"], canonical["triggers"])
        self.assertEqual(counts["incomplete_skills"], canonical["incomplete_skills"])
        self.assertEqual(counts["routable_skills"], canonical["routable_skills"])
        self.assertEqual(len(self.reports["full"]["members"]), counts["skills"] + 3)

    def test_lite_excludes_the_github_half_and_says_so(self):
        with zipfile.ZipFile(self.zip_path("lite")) as archive:
            index = json.loads(archive.read("references/triggers.json"))
            skill_md = archive.read("SKILL.md").decode("utf-8")
        allowed, excluded = builder.VARIANTS["lite"], builder.EXCLUDED["lite"]
        for entry in index["skills"]:
            source = str(entry["source_path"])
            self.assertTrue(source.startswith(allowed), f"lite shipped an out-of-scope source: {source}")
            self.assertFalse(source.startswith(excluded), f"lite shipped an excluded source: {source}")
        self.assertEqual(index["counts"]["skills"], len(index["skills"]))
        self.assertEqual(index["variant"], "lite")
        self.assertEqual(index["excluded_roots"], ["library/github-skills/"])
        # the limitation has to be written into the shipped SKILL.md, not only into this repo's docs
        for required in ("library/github-skills", "NOT part of this build", "cannot be routed here",
                         f"{index['counts']['skills']:,}", "| domain | skills |"):
            self.assertIn(required, skill_md, f"lite SKILL.md does not state {required!r}")
        self.assertEqual(skill_md.count("| `"), len(index["domains"]),
                         "the SKILL.md domain table must list every domain the build actually covers")

    def test_shipped_router_is_the_plugin_copy_and_finds_its_own_root(self):
        for variant in ("lite", "full"):
            with self.subTest(variant=variant), zipfile.ZipFile(self.zip_path(variant)) as archive:
                shipped = archive.read("scripts/route.py")
            self.assertEqual(hashlib.sha256(shipped).hexdigest(),
                             hashlib.sha256(PLUGIN_ROUTE.read_bytes()).hexdigest(),
                             f"{variant}: the packaged route.py drifted from the plugin copy")
            source = shipped.decode("utf-8")
            self.assertIn("parents[1]", source, "route.py must resolve the zip root from parents[1]")
            self.assertIn('references" / "triggers.json', source.replace("'", '"'),
                          "route.py must default to the index name the zip ships")

    def test_every_returned_path_exists_in_both_zips(self):
        """The acceptance criterion: results must not point outside the artifact."""
        for variant, queries in QUERIES.items():
            extracted = self.workspace / f"extracted-{variant}"
            extracted.mkdir(exist_ok=True)
            with zipfile.ZipFile(self.zip_path(variant)) as archive:
                names = set(archive.namelist())
                archive.extractall(extracted)
            for query in queries:
                results = _run_router(extracted, query)
                with self.subTest(variant=variant, query=query):
                    self.assertTrue(results, f"{variant}: {query!r} routed to nothing inside the zip")
                    for result in results:
                        absolute = Path(result["path"])
                        self.assertTrue(absolute.is_file(),
                                        f"{variant}: returned path is not a file: {absolute}")
                        relative = str(absolute.relative_to(extracted))
                        self.assertIn(relative, names,
                                      f"{variant}: returned path {relative} is not a zip member")
                        self.assertEqual(result["source_path"], relative)

    def test_a_full_build_is_byte_reproducible(self):
        digests = []
        for run in (1, 2):
            target = self.workspace / f"repeat-{run}"
            report = builder.build_variant("lite", target, max_entries=200)
            digests.append(report["sha256"])
        self.assertEqual(digests[0], digests[1], "the same input must produce the same bytes")

    def test_a_missing_source_file_fails_the_build_instead_of_shipping_a_dangling_path(self):
        payload = json.loads(CANONICAL_INDEX.read_text(encoding="utf-8"))
        payload["skills"] = [dict(payload["skills"][0], source_path="psk/data/skills/does-not-exist/SKILL.md")]
        with self.assertRaises(builder.BuildError) as caught:
            builder.plan_variant("lite", index=payload)
        self.assertIn("does-not-exist", str(caught.exception))
        with self.assertRaises(builder.BuildError):
            builder.plan_variant("medium")

    def test_cli_builds_both_variants_and_reports_json(self):
        target = self.workspace / "cli"
        with contextlib.redirect_stdout(io.StringIO()) as printed:
            code = builder.main(["--variant", "both", "--out", str(target), "--max-entries", "20", "--json"])
        self.assertEqual(code, 0)
        payload = json.loads(printed.getvalue())
        self.assertEqual([item["variant"] for item in payload], ["full", "lite"])
        self.assertEqual([item["counts"]["skills"] for item in payload], [20, 20])
        self.assertTrue((target / "mega-skills-router-lite.zip").is_file())
        self.assertTrue((target / "mega-skills-router-full.zip").is_file())
        summary = builder.render_summary(self.reports["lite"])
        self.assertIn("lite budget", summary)
        self.assertIn("OK", summary)


if __name__ == "__main__":
    unittest.main()
