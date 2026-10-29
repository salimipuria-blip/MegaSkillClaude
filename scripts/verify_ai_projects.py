#!/usr/bin/env python3
"""Gate for docs/guides/ai-projects-3: the code runs, and the prose matches the code.

    python3 scripts/verify_ai_projects.py           # human report, exit 0/1
    python3 scripts/verify_ai_projects.py --json    # machine-readable

Why this exists
---------------
The guide replaces a published tutorial whose snippets were wrong in four places at once
(`langchain.chains`, `langchain.memory`, `langchain.text_splitter`, a 1.1 GB model). Prose
cannot be tested, but the *claims* can: every code block that matters, every pinned model,
every JSON example, and every "this import works" statement is checked against the files
that actually run. A guide that drifts from its code fails here instead of in front of a
learner.

Checks
  1. Node syntax  — `node --check` on every .js/.mjs under the guide.
  2. Node tests   — the project-1 and project-2 suites run (offline, no browser).
  3. Python       — project-3 compiles, imports with no third-party package, and its
                    unittest suite passes without LangChain installed.
  4. JSON         — the n8n workflow is valid and structurally importable.
  5. Doc ↔ code   — the model id and dtype in the prose equal the constants in the code;
                    the documented imports exist verbatim; the n8n licence is not called
                    "open source" anywhere.

No dependency installation, no network, no model download.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / "docs/guides/ai-projects-3"
P1 = GUIDE / "project-1-browser-summarizer"
P2 = GUIDE / "project-2-news-automation"
P3 = GUIDE / "project-3-rag-agent"

result_rows: list[dict[str, object]] = []


def record(name: str, ok: bool, detail: str = "") -> bool:
    result_rows.append({"check": name, "ok": ok, "detail": detail.strip()[:800]})
    return ok


def run(cmd: list[str], cwd: Path | None = None) -> tuple[int, str]:
    proc = subprocess.run(cmd, cwd=cwd or ROOT, capture_output=True, text=True)
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# --------------------------------------------------------------------------- #
# 1 + 2. JavaScript                                                           #
# --------------------------------------------------------------------------- #

def check_node(node: str) -> bool:
    scripts = sorted([*P1.glob("*.js"), *P1.glob("*.mjs"), *P2.glob("*.mjs")])
    if not scripts:
        return record("node-syntax", False, "no JavaScript found in the guide")
    broken = []
    for script in scripts:
        code, out = run([node, "--check", str(script)])
        if code != 0:
            broken.append(f"{script.relative_to(ROOT)}: {out.strip().splitlines()[-1:] or out}")
    if not record("node-syntax", not broken, "\n".join(broken) or f"{len(scripts)} files parse"):
        return False

    ok = True
    for suite in (P1 / "summarizer-core.test.mjs", P2 / "feed-to-telegram.test.mjs"):
        code, out = run([node, "--test", str(suite)])
        passed = re.search(r"^# pass (\d+)$", out, re.M)
        failed = re.search(r"^# fail (\d+)$", out, re.M)
        detail = (f"{passed.group(1) if passed else '?'} pass / {failed.group(1) if failed else '?'} fail"
                  f" — {suite.relative_to(ROOT)}")
        ok = record(f"node-tests:{suite.parent.name}", code == 0, detail if code else detail) and ok
    return ok


# --------------------------------------------------------------------------- #
# 3. Python                                                                   #
# --------------------------------------------------------------------------- #

def check_python(python: str) -> bool:
    ok = True
    for module in ("rag_agent.py", "test_rag.py", "check_imports.py"):
        code, out = run([python, "-m", "py_compile", str(P3 / module)])
        ok = record(f"py-compile:{module}", code == 0, out or "ok") and ok
    if not ok:
        return False

    # Importing the module must not need LangChain: the lazy-import design is a promise.
    probe = (
        "import sys; sys.path.insert(0, %r); import rag_agent; "
        "assert 'langchain' not in sys.modules, 'rag_agent imported langchain eagerly'"
        % str(P3)
    )
    code, out = run([python, "-c", probe])
    ok = record("py-lazy-imports", code == 0, out or "module imports with no third-party package") and ok

    code, out = run([python, "-m", "unittest", "discover", "-s", str(P3), "-p", "test_*.py"])
    tail = out.strip().splitlines()[-1] if out.strip() else ""
    ok = record("py-tests", code == 0, tail or out) and ok

    code, out = run([python, str(P3 / "check_imports.py")])
    note = "skipped-clean" if "skip:" in out else "verified"
    ok = record("py-import-surface", code == 0, f"{note}: {out.strip().splitlines()[-1] if out.strip() else ''}") and ok
    return ok


# --------------------------------------------------------------------------- #
# 4. n8n workflow                                                             #
# --------------------------------------------------------------------------- #

def check_workflow() -> bool:
    path = P2 / "workflow.n8n.json"
    if not path.is_file():
        return record("n8n-workflow", False, "workflow.n8n.json is missing")
    try:
        data = json.loads(read(path))
    except json.JSONDecodeError as error:
        return record("n8n-workflow", False, f"invalid JSON: {error}")

    problems: list[str] = []
    nodes = data.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        problems.append("no nodes")
        nodes = []
    names = [node.get("name") for node in nodes]
    if len(set(names)) != len(names):
        problems.append("duplicate node names")
    for node in nodes:
        for key in ("id", "name", "type", "position", "typeVersion"):
            if key not in node:
                problems.append(f"node {node.get('name', '?')} has no {key}")
        if not isinstance(node.get("position"), list) or len(node.get("position") or []) != 2:
            problems.append(f"node {node.get('name', '?')} has a malformed position")
        if not isinstance(node.get("typeVersion"), (int, float)):
            problems.append(f"node {node.get('name', '?')} has a non-numeric typeVersion")
        if not str(node.get("type", "")).startswith("n8n-nodes-base."):
            problems.append(f"node {node.get('name', '?')} is not a core node type")
    connections = data.get("connections")
    if not isinstance(connections, dict) or not connections:
        problems.append("no connections")
        connections = {}
    for source, payload in connections.items():
        if source not in names:
            problems.append(f"connection from unknown node {source!r}")
        for branch in (payload or {}).get("main", []) or []:
            for link in branch or []:
                if link.get("node") not in names:
                    problems.append(f"{source!r} points at unknown node {link.get('node')!r}")
    if data.get("active") is not False:
        problems.append("a committed workflow must be inactive")
    return record("n8n-workflow", not problems,
                  "\n".join(problems) or f"{len(nodes)} nodes, {len(connections)} connections")


# --------------------------------------------------------------------------- #
# 5. Doc ↔ code                                                               #
# --------------------------------------------------------------------------- #

def check_docs() -> bool:
    ok = True
    readme = GUIDE / "README.md"
    if not readme.is_file():
        return record("guide-readme", False, "README.md is missing")
    prose = read(readme)
    core = read(P1 / "summarizer-core.mjs")
    agent = read(P3 / "rag_agent.py")

    model = re.search(r"export const MODEL = '([^']+)'", core)
    dtype = re.search(r"export const DTYPE = '([^']+)'", core)
    missing = []
    if not model or model.group(1) not in prose:
        missing.append(f"MODEL {model.group(1) if model else '?'} is not named in README.md")
    if not dtype or dtype.group(1) not in prose:
        missing.append(f"DTYPE {dtype.group(1) if dtype else '?'} is not named in README.md")
    ok = record("doc-model-matches-code", not missing, "\n".join(missing)) and ok

    # Every import the guide documents must exist verbatim in the code it points at.
    documented = re.findall(r"^from (langchain[\w.]*) import ([\w, ]+)$", prose, re.M)
    if not documented:
        ok = record("doc-imports", False, "README documents no LangChain import") and ok
    else:
        absent = [f"from {module} import {names.strip()}"
                  for module, names in documented
                  if f"from {module} import {names.strip()}" not in agent]
        ok = record("doc-imports", not absent,
                    "\n".join(f"not used in rag_agent.py: {line}" for line in absent)
                    or f"{len(documented)} documented imports exist verbatim in rag_agent.py") and ok

    # The licence correction must survive editing: n8n is fair-code, not OSI open source.
    fair = re.search(r"(fair-code|Sustainable Use License|متن‌باز نیست|مجوزِ آزاد نیست)", prose)
    ok = record("doc-n8n-licence", bool(fair),
                "README explains that n8n is not open source" if fair
                else "README must state that n8n is fair-code, not open source") and ok

    # No snippet in the guide may use an API that LangChain 1.x removed.
    dotted = re.escape("langchain.chains") + "|" + re.escape("langchain.memory") + "|" + re.escape("langchain.text_splitter")
    banned = re.findall(rf"^\s*from (?:{dotted}) import [^\n]+", prose, re.M)
    ok = record("doc-no-removed-apis", not banned, ", ".join(banned) or "no removed LangChain import in the guide") and ok
    return ok


# --------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    node = shutil.which("node")
    python = shutil.which("python3") or sys.executable
    ok = True
    if node:
        ok = check_node(node) and ok
    else:
        ok = record("node-syntax", False, "node is not installed, so the JavaScript is unverified") and ok
    ok = check_python(python) and ok
    ok = check_workflow() and ok
    ok = check_docs() and ok

    if args.json:
        print(json.dumps({"ok": ok, "checks": result_rows}, ensure_ascii=False, indent=1))
    else:
        for row in result_rows:
            mark = "ok  " if row["ok"] else "FAIL"
            print(f"[{mark}] {row['check']}: {row['detail']}")
        print("\nAI project guides: " + ("OK" if ok else "FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
