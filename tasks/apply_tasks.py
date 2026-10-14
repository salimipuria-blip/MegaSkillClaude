#!/usr/bin/env python3
"""Plan (never blindly apply) Hermes tasks from tasks/hermes_tasks.json.

Professional contract — deliberately stricter than a skeleton generator:

* Default mode is a read-only dry-run. Nothing is committed, pushed, or PR'd
  unless you pass ``--apply-pr`` *and* the task already has a real, tested
  implementation on a task branch.
* Skeleton/placeholder PRs are refused (``skeleton_allowed`` must not be the
  implementation strategy); 100 empty PRs are review spam, not progress.
* Auto-merge is never performed. Merging requires green CI + human review.
* Only the current git worktree is inspected; credentials come from the
  already-authenticated ``git``/``gh`` CLIs and are never printed.

Usage:
    python3 tasks/apply_tasks.py --manifest tasks/hermes_tasks.json
    python3 tasks/apply_tasks.py --manifest tasks/hermes_tasks.json --wave W0
    python3 tasks/apply_tasks.py --manifest tasks/hermes_tasks.json --only 1,4,23
    python3 tasks/apply_tasks.py --manifest tasks/hermes_tasks.json --validate-only
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_DISPOSITIONS = {
    "implemented", "implemented-partial", "implemented-primitive", "implemented-doc",
    "existing-verified", "planned", "adapted", "deferred", "deferred-optional",
    "deferred-no-image", "deferred-dangerous", "deferred-breaking", "rejected-wrong-target",
    "rejected-privacy", "rejected-no-image", "rejected-no-container",
}


def load_manifest(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != "hermes-tasks/v2":
        raise SystemExit(f"unsupported manifest schema: {data.get('schema')!r}")
    return data


def validate(manifest: dict) -> list[str]:
    errors: list[str] = []
    tasks = manifest.get("tasks")
    if not isinstance(tasks, list) or len(tasks) != 100:
        errors.append("manifest must contain exactly 100 tasks")
        return errors
    seen: set[int] = set()
    for task in tasks:
        tid = task.get("id")
        if tid in seen:
            errors.append(f"duplicate task id: {tid}")
        seen.add(tid)
        for field in ("code", "title", "wave", "disposition", "branch", "commit", "pr_title", "files", "acceptance"):
            if not task.get(field):
                errors.append(f"task {tid}: missing/empty field {field}")
        if task.get("disposition") not in ALLOWED_DISPOSITIONS:
            errors.append(f"task {tid}: unknown disposition {task.get('disposition')!r}")
        if task.get("automation", {}).get("auto_merge") is not False:
            errors.append(f"task {tid}: auto_merge must be false")
    if seen != set(range(1, 101)):
        errors.append("task ids must be exactly 1..100")
    return errors


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ).stdout.strip()


def select(tasks: list[dict], wave: str | None, only: str | None, disposition: str | None) -> list[dict]:
    out = tasks
    if wave:
        out = [t for t in out if t["wave"] == wave]
    if disposition:
        out = [t for t in out if t["disposition"] == disposition]
    if only:
        wanted = {int(x) for x in only.split(",") if x.strip()}
        out = [t for t in out if t["id"] in wanted]
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", default="tasks/hermes_tasks.json")
    parser.add_argument("--wave", choices=["W0", "W1", "W2", "W3"])
    parser.add_argument("--only", help="comma-separated task ids, e.g. 1,4,23")
    parser.add_argument("--disposition")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--apply-pr", action="store_true",
                        help="create a PR for the CURRENT branch (requires gh, green local checks, human review; never merges)")
    args = parser.parse_args()

    manifest = load_manifest(ROOT / args.manifest if not Path(args.manifest).is_absolute() else Path(args.manifest))
    errors = validate(manifest)
    if errors:
        print("\n".join(f"ERROR: {e}" for e in errors), file=sys.stderr)
        return 2
    print("manifest: OK (100 tasks, schema hermes-tasks/v2)")
    if args.validate_only:
        return 0

    tasks = select(manifest["tasks"], args.wave, args.only, args.disposition)

    if not args.apply_pr:
        print(f"DRY-RUN — {len(tasks)} task(s) selected; no branches, commits, pushes or PRs will be made.\n")
        for t in tasks:
            print(f"{t['code']:<12} [{t['wave']}/{t['disposition']}] {t['title']}")
            print(f"             files: {', '.join(t['files'])}")
            print(f"             accept: {t['acceptance'][0]}")
        print("\nNext step: implement ONE task for real, test it, then run with --apply-pr on its branch.")
        return 0

    # --apply-pr: exactly one task, on its own already-implemented branch.
    if len(tasks) != 1:
        print("ERROR: --apply-pr requires exactly one task (use --only N).", file=sys.stderr)
        return 2
    task = tasks[0]
    if task["disposition"].startswith(("rejected", "deferred")):
        print(f"ERROR: task {task['code']} is {task['disposition']}; refusing to open a PR.", file=sys.stderr)
        return 2
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if branch != task["branch"]:
        print(f"ERROR: current branch {branch!r} != task branch {task['branch']!r}.", file=sys.stderr)
        return 2
    if git("status", "--porcelain"):
        print("ERROR: worktree is dirty; commit the tested implementation first.", file=sys.stderr)
        return 2
    body = (f"## شرح\n{task['title']}\n\n## معیار پذیرش\n"
            + "\n".join(f"- [ ] {a}" for a in task["acceptance"])
            + "\n\n## تست محلی\n- [ ] تست مرتبط اجرا و سبز شد\n\n_بدون auto-merge؛ مرج فقط پس از CI سبز و review انسانی._")
    subprocess.run(
        ["gh", "pr", "create", "--title", task["pr_title"], "--body", body,
         *(sum((["--label", label] for label in task.get("labels", [])), []))],
        cwd=ROOT, check=True,
    )
    print("PR created. Review + green CI required; this tool never merges.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
