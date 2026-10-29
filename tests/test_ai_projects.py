"""Static contracts for `docs/guides/ai-projects-3`.

The guide exists because a published tutorial shipped code that no longer runs. The
anti-regression here is *static* (fast, no subprocess, no discovery — see
`test_status_counters.test_no_python_test_spawns_a_nested_unittest_discovery`): the
behavioural suites are run by `scripts/verify_ai_projects.py` from repo-health, doctor and
CI, and these tests make sure the prose cannot drift away from the code again.
"""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / "docs/guides/ai-projects-3"
P1 = GUIDE / "project-1-browser-summarizer"
P2 = GUIDE / "project-2-news-automation"
P3 = GUIDE / "project-3-rag-agent"

REMOVED_IMPORTS = ("langchain.chains", "langchain.memory", "langchain.text_splitter")
FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def fa(number: int) -> str:
    return str(number).translate(FA)


class GuideLayoutTests(unittest.TestCase):
    def test_every_documented_file_exists(self):
        expected = [
            GUIDE / "README.md",
            GUIDE / "index.html",
            P1 / "index.html", P1 / "style.css", P1 / "app.js", P1 / "worker.js",
            P1 / "summarizer-core.mjs", P1 / "summarizer-core.test.mjs",
            P2 / "feed-to-telegram.mjs", P2 / "feed-to-telegram.test.mjs", P2 / "workflow.n8n.json",
            P3 / "rag_agent.py", P3 / "test_rag.py", P3 / "check_imports.py", P3 / "requirements.txt",
        ]
        for path in expected:
            with self.subTest(file=path.relative_to(ROOT).as_posix()):
                self.assertTrue(path.is_file(), f"missing {path.relative_to(ROOT)}")
                self.assertGreater(path.stat().st_size, 0, f"empty {path.name}")

    def test_the_verifier_exists_and_is_wired_into_the_repository_gates(self):
        self.assertTrue((ROOT / "scripts/verify_ai_projects.py").is_file())
        health = read(ROOT / "scripts/repo_health_check.sh")
        self.assertIn("verify_ai_projects.py", health,
                      "the guide's gate must run in the dependency-free health check")
        ci = read(ROOT / ".github/workflows/ci.yml")
        self.assertIn("verify_ai_projects.py", ci, "and in CI's repo-health job")
        doctor = read(ROOT / "scripts/doctor.mjs")
        self.assertIn("verify_ai_projects.py", doctor, "and as a doctor step")


class ProjectOneTests(unittest.TestCase):
    def test_the_model_and_dtype_constants_are_the_ones_the_hint_names(self):
        core = read(P1 / "summarizer-core.mjs")
        model = re.search(r"export const MODEL = '([^']+)'", core)
        dtype = re.search(r"export const DTYPE = '([^']+)'", core)
        self.assertIsNotNone(model)
        self.assertIsNotNone(dtype)
        self.assertEqual(dtype.group(1), "q8", "fp32 is ~1.1 GB; the guide must not download that by default")
        self.assertIn(model.group(1), read(GUIDE / "README.md"))
        self.assertIn(model.group(1), read(GUIDE / "index.html"))

    def test_the_worker_never_runs_the_model_on_the_main_thread(self):
        app = read(P1 / "app.js")
        worker = read(P1 / "worker.js")
        self.assertIn("new Worker(", app, "the page must delegate to a worker")
        self.assertIn("terminate()", app, "cancel must really terminate the worker")
        self.assertIn("pipeline(", worker, "only the worker loads the model")
        self.assertNotIn("pipeline(", app, "the model must not be loaded in app.js")

    def test_the_guide_states_the_real_download_size_and_its_source(self):
        prose = read(GUIDE / "README.md") + read(GUIDE / "index.html")
        self.assertIn("۳۱۰", prose, "the measured q8 size must be stated")
        self.assertRegex(prose, r"(۱٫۱|1\.1)\s*(گیگابایت|GB)", "the fp32 trap must be named")


class ProjectTwoTests(unittest.TestCase):
    def test_the_committed_workflow_is_valid_and_inactive(self):
        data = json.loads(read(P2 / "workflow.n8n.json"))
        self.assertIs(data["active"], False, "a committed workflow must never be active")
        names = [node["name"] for node in data["nodes"]]
        self.assertEqual(len(names), len(set(names)))
        for raw, payload in data["connections"].items():
            self.assertIn(raw, names)
            for branch in payload.get("main", []):
                for link in branch:
                    self.assertIn(link["node"], names, "a connection points at a node that does not exist")
        for node in data["nodes"]:
            self.assertTrue(node["type"].startswith("n8n-nodes-base."))
            self.assertEqual(len(node["position"]), 2, f'{node["name"]}: position must be [x, y]')

    def test_the_licence_correction_is_present_and_not_softened(self):
        prose = read(GUIDE / "README.md") + read(GUIDE / "index.html")
        self.assertRegex(prose, r"fair-code|Sustainable Use", "n8n's licence must be named")
        self.assertRegex(prose, r"(متن‌باز نیست|not open source|no, not open source|open source نمی‌نامد|خودش را open source نمی‌نامد)",
                         "the guide must say plainly that n8n is not open source")
        # The original claim may be *quoted* (to refute it), never stated as fact: every
        # occurrence must sit within a refutation window.
        pattern = re.compile(r"همه‌ی ابزارها[^.]{0,40}متن‌باز|همهٔ ابزارها[^.]{0,40}متن‌باز")
        for match in pattern.finditer(prose):
            window = prose[max(0, match.start() - 400): match.end() + 400]
            self.assertRegex(window, r"متن‌باز نیست|نادرست|fair-code|Sustainable Use",
                             f"the open-source claim appears unrefuted: …{window[300:500]}…")

    def test_the_runner_is_dry_by_default_without_credentials(self):
        source = read(P2 / "feed-to-telegram.mjs")
        self.assertIn("--dry-run", source)
        self.assertIn("!process.env.TELEGRAM_BOT_TOKEN", source,
                      "no token must mean dry run, never a silent send")


class ProjectThreeTests(unittest.TestCase):
    def test_the_module_imports_without_langchain_at_module_load(self):
        source = read(P3 / "rag_agent.py")
        top_level = [line for line in source.splitlines()
                     if line.startswith(("import ", "from ")) and "langchain" in line]
        self.assertEqual(top_level, [], "langchain must only be imported inside functions")
        self.assertIn("def build_vectorstore(", source)
        self.assertIn("from langchain_chroma import Chroma", source, "the lazy import must exist")

    def test_no_removed_api_is_used_as_code_anywhere_in_the_guide(self):
        """A removed import may be *quoted* to explain the break, never written as live code.

        Lines that start with ❌, a quote character, or a comment are illustrations: the
        README table, the checker's probe list, and the docstring of rag_agent.py.
        """
        for path in sorted(GUIDE.rglob("*")):
            if not path.is_file() or path.suffix not in {".py", ".md", ".html", ".mjs", ".txt"}:
                continue
            for line in read(path).splitlines():
                stripped = line.lstrip()
                if stripped.startswith(("❌", '"', "'", "#")):
                    continue
                for module in REMOVED_IMPORTS:
                    if re.match(rf"from {re.escape(module)} import", stripped) or \
                       re.match(rf"import {re.escape(module)}\b", stripped):
                        self.fail(f"{path.relative_to(ROOT)}:{stripped} is a removed LangChain 1.x API, "
                                  "quoted without the ❌ marker")

    def test_the_checker_lists_exactly_the_removed_and_deprecated_imports(self):
        source = read(P3 / "check_imports.py")
        for module in REMOVED_IMPORTS:
            self.assertIn(module, source, f"the checker must still probe {module}")
        self.assertIn("DEPRECATED", source,
                      "old-but-working paths must be reported as deprecated, not as removed")
        # The exact trap this had on the first run: `langchain_community.embeddings.OllamaEmbeddings`
        # still imports on 0.4.2, so it must not sit in the "must fail" list.
        forbidden = source[source.index("FORBIDDEN = ["):source.index("# Deprecated, *not* removed")]
        self.assertNotIn("langchain_community.embeddings", forbidden)

    def test_requirements_pass_allow_ranges_instead_of_rotting_pins(self):
        requirements = read(P3 / "requirements.txt")
        pins = [line for line in requirements.splitlines() if "==" in line and not line.startswith("#")]
        self.assertEqual(pins, [], "exact pins rot; the verified versions live in the comment above")


class DocumentedCountsTests(unittest.TestCase):
    def test_the_advertised_test_count_equals_the_tests_in_the_files(self):
        js_one = len(re.findall(r"^test\(", read(P1 / "summarizer-core.test.mjs"), re.M))
        js_two = len(re.findall(r"^test\(", read(P2 / "feed-to-telegram.test.mjs"), re.M))
        py = len(re.findall(r"^\s+def test_", read(P3 / "test_rag.py"), re.M))
        self.assertGreater(js_one, 0)
        self.assertGreater(js_two, 0)
        self.assertGreater(py, 0)
        total = js_one + js_two + py

        for document in (GUIDE / "README.md", GUIDE / "index.html"):
            prose = read(document)
            with self.subTest(document=document.name):
                self.assertIn(fa(total), prose, f"{document.name} must advertise the measured total {total}")
                for part in (js_one, js_two, py):
                    self.assertIn(fa(part), prose, f"{document.name} must break the total down to {part}")


if __name__ == "__main__":
    unittest.main()
