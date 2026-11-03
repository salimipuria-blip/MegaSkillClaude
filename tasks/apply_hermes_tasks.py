#!/usr/bin/env python3
"""Hermes task planner — corrected successor of the pasted apply script.

Fixes vs. the pasted version:
  * ``run()`` captured nothing, so PR numbers / diagnostics were always lost;
  * ``ensure_branch()`` hid every git failure behind a blind ``checkout -b``;
  * missing files were filed with skeleton placeholders and auto-merged —
    this tool never creates placeholder content and never merges;
  * manifest fields polluted with HTML entities (``&amp;``) and Markdown
    links (``hermes/[setup.sh](http://setup.sh)``) are sanitized/validated.

Modes: read-only dry-run (default) and --validate-only. ``--apply-pr`` only
opens a PR for the *current, already committed and tested* branch of exactly
one task; branch creation/push/merge are intentionally left to the operator
(and to git/gh directly), so the tool is safe to run in CI and locally.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_LINK_RE = re.compile(r"^(?P<dir>.*?)\[(?P<name>[^\]]+)\]\([^)]*\)$")


def sanitize_text(value: object) -> str:
    return html.unescape(str(value)).strip()


def sanitize_path(raw: object) -> str:
    text = sanitize_text(raw)
    match = _LINK_RE.match(text)
    if match:  # hermes/[setup.sh](http://setup.sh) -> hermes/setup.sh
        text = f"{match.group('dir')}{match.group('name')}"
    if "://" in text or text.startswith(("/", "~")) or ".." in Path(text).parts:
        raise ValueError(f"unsafe or non-repo path in manifest: {raw!r}")
    return text


def load_tasks(path: Path) -> tuple[list[dict], str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    tasks = data.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("manifest has no tasks list")
    schema = data.get("schema", "legacy/v1")
    cleaned: list[dict] = []
    for raw in tasks:
        task = {k: (sanitize_text(v) if isinstance(v, str) else v) for k, v in raw.items()}
        task["files"] = [sanitize_path(f) for f in raw.get("files", [])]
        cleaned.append(task)
    return cleaned, schema


def validate(tasks: list[dict], schema: str) -> list[str]:
    errors: list[str] = []
    seen: set[int] = set()
    for task in tasks:
        tid = task.get("id")
        if not isinstance(tid, int) or tid in seen:
            errors.append(f"invalid/duplicate task id: {tid!r}")
        seen.add(tid if isinstance(tid, int) else -1)
        # Schema-aware requirements: legacy snippets carry pr_body; the v2
        # manifest carries structured acceptance criteria instead.
        required = ("title", "branch", "commit", "pr_title", "files")
        if schema != "hermes-tasks/v2":
            required += ("pr_body",)
        else:
            required += ("acceptance",)
        for field in required:
            if not task.get(field):
                errors.append(f"task {tid}: missing/empty {field}")
        # Target files of planned/deferred/rejected tasks legitimately do not
        # exist yet; only tasks claiming implementation must point at real files.
        if str(task.get("disposition", "")).startswith("implemented"):
            for f in task.get("files", []):
                if "*" not in f and not (ROOT / f).exists():
                    errors.append(f"task {tid}: implemented file does not exist: {f}")
    if schema == "hermes-tasks/v2" and len(tasks) != 100:
        errors.append("v2 manifest must contain exactly 100 tasks")
    return errors


def git(*args: str) -> str:
    res = subprocess.run(["git", *args], cwd=ROOT, text=True,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", default="tasks/hermes_tasks.json")
    parser.add_argument("--only", help="comma-separated task ids")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--apply-pr", action="store_true",
                        help="open a PR for the current committed branch of exactly one task (never merges)")
    parser.add_argument("--auto-merge", action="store_true",
                        help="accepted only to fail loudly: auto-merge is forbidden by policy")
    parser.add_argument("--apply", action="store_true",
                        help="accepted only to fail loudly: use --apply-pr after implementing/testing a task")
    args = parser.parse_args()

    if args.auto_merge:
        print("ERROR: --auto-merge is forbidden (CI green + human review required).", file=sys.stderr)
        return 2
    if args.apply:
        print("ERROR: --apply (skeleton write/push) is forbidden; implement the task, test it, commit it, then use --apply-pr.", file=sys.stderr)
        return 2

    manifest = Path(args.manifest)
    if not manifest.is_absolute():
        manifest = ROOT / manifest
    try:
        tasks, schema = load_tasks(manifest)
    except (OSError, ValueError) as exc:  # JSONDecodeError subclasses ValueError
        print(f"ERROR: cannot load manifest {manifest}: {exc}", file=sys.stderr)
        return 2

    # Validate the full manifest *before* --only filtering: the v2 schema
    # requires exactly 100 tasks, so validating a filtered subset would make
    # every `--only N` run against the canonical manifest fail spuriously.
    errors = validate(tasks, schema)
    if errors:
        print("\n".join(f"ERROR: {e}" for e in errors), file=sys.stderr)
        return 2
    print(f"manifest: OK ({len(tasks)} task(s), schema {schema})")
    if args.validate_only:
        return 0

    if args.only:
        wanted = {int(x) for x in args.only.split(",") if x.strip()}
        tasks = [t for t in tasks if t["id"] in wanted]

    if not args.apply_pr:
        print("DRY-RUN — no files, branches, commits, pushes or PRs will be created.\n")
        for t in tasks:
            print(f"#{t['id']:<3} {t['title']}  [{t['branch']}]")
            print(f"     files: {', '.join(t['files'])}")
        return 0

    if len(tasks) != 1:
        print("ERROR: --apply-pr requires exactly one task (--only N).", file=sys.stderr)
        return 2
    task = tasks[0]
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if branch != task["branch"]:
        print(f"ERROR: current branch {branch!r} != task branch {task['branch']!r}.", file=sys.stderr)
        return 2
    if git("status", "--porcelain"):
        print("ERROR: dirty worktree; commit the tested implementation first.", file=sys.stderr)
        return 2
    body = task.get("pr_body") or (
        "### Acceptance\n" + "\n".join(f"- [ ] {a}" for a in task.get("acceptance", []))
        + "\n\n_Merge only after green CI and human review._"
    )
    subprocess.run(["gh", "pr", "create", "--title", task["pr_title"], "--body", body,
                    "--base", "main", "--head", branch], cwd=ROOT, check=True)
    print("PR created. This tool never merges; CI green + human review required.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
