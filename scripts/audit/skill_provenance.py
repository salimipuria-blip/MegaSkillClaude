#!/usr/bin/env python3
"""Skill provenance: hash every vendored skill and pin the upstream commit.

The audit found that `library/github-skills/INDEX.json` points at
`/tree/HEAD/...`, which is a moving target: a skill can change upstream without
any local signal. This script records, for every indexed skill:

  * the SHA-256 of the vendored SKILL.md (and of every file in the folder)
  * the byte size
  * the upstream repository and ref, plus the upstream commit when resolved

Output: library/github-skills/PROVENANCE.json

Usage:
  python3 scripts/audit/skill_provenance.py            # regenerate (offline)
  python3 scripts/audit/skill_provenance.py --online    # also resolve upstream HEAD with gh
  python3 scripts/audit/skill_provenance.py --check      # exit 1 if a hash drifted

`--check` makes the file a real contract: CI fails when a vendored skill changes
without the provenance file being regenerated.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "library" / "github-skills"
INDEX = LIB / "INDEX.json"
OUT = LIB / "PROVENANCE.json"
SCHEMA = "megaskillclaude.provenance/1"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def folder_digest(folder: Path) -> tuple[str, int, int]:
    """Stable digest of a skill folder: sorted relative paths + file hashes."""
    h = hashlib.sha256()
    size = 0
    count = 0
    for file in sorted(p for p in folder.rglob("*") if p.is_file()):
        rel = file.relative_to(folder).as_posix()
        file_hash = sha256(file)
        n = file.stat().st_size
        size += n
        count += 1
        h.update(f"{rel}\0{file_hash}\0{n}\n".encode())
    return h.hexdigest(), size, count


def resolve_commit(repo: str) -> str | None:
    if not shutil.which("gh"):
        return None
    try:
        # Fixed argv, no shell, binary located with shutil.which: no user input
        # reaches the command line beyond the repo name, which is validated by
        # the GitHub API itself (a 404 simply yields None).
        out = subprocess.run(  # nosec B603 B607
            ["gh", "api", f"repos/{repo}/commits/HEAD", "--jq", ".sha"],
            capture_output=True, text=True, timeout=30, check=True,
        )
        return out.stdout.strip() or None
    except (subprocess.SubprocessError, OSError):
        return None


def build(online: bool) -> dict:
    entries = json.loads(INDEX.read_text(encoding="utf-8"))
    repos: dict[str, dict] = {}
    skills: list[dict] = []
    missing: list[str] = []

    for entry in entries:
        repo = entry.get("repo") or "unknown"
        name = entry.get("name") or ""
        upstream_path = entry.get("path") or ""
        # On disk a skill is stored flat: library/github-skills/<name>/SKILL.md,
        # while INDEX.json keeps the *upstream* path. Hash the local copy.
        local = name.strip("/") or upstream_path.strip("/")
        folder = LIB / local
        record = {
            "name": name,
            "local": local,
            "upstream_path": upstream_path,
            "repo": repo,
            "license": entry.get("license") or "NOASSERTION",
            "url": entry.get("url"),
        }
        if not local or local in {".", ".."} or not folder.is_dir():
            record["status"] = "missing"
            missing.append(f"{repo}/{upstream_path}")
        else:
            digest, size, count = folder_digest(folder)
            skill_md = folder / "SKILL.md"
            record.update(
                status="present",
                files=count,
                bytes=size,
                sha256=digest,
                skill_md_sha256=sha256(skill_md) if skill_md.is_file() else None,
            )
        skills.append(record)
        info = repos.setdefault(
            repo,
            {
                "license": record["license"],
                "skills": 0,
                "present": 0,
                "upstream_ref": "HEAD",
                "upstream_commit": None,
            },
        )
        info["skills"] += 1
        if record["status"] == "present":
            info["present"] += 1

    if online:
        for repo, info in repos.items():
            info["upstream_commit"] = resolve_commit(repo)

    totals = {
        "indexed": len(skills),
        "present": sum(1 for s in skills if s["status"] == "present"),
        "missing": len(missing),
        "bytes": sum(s.get("bytes", 0) for s in skills),
        "repos": len(repos),
    }
    return {
        "schema": SCHEMA,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "deterministic": True,
        "hashes": "sha256 over (relative path, file sha256, size) of every file, sorted",
        "totals": totals,
        "repos": dict(sorted(repos.items())),
        "missing": sorted(missing),
        "skills": sorted(skills, key=lambda s: (s["repo"], s["local"])),
    }


def check() -> int:
    if not OUT.is_file():
        print(f"FAIL: {OUT.relative_to(ROOT)} is missing; run without --check", file=sys.stderr)
        return 1
    stored = json.loads(OUT.read_text(encoding="utf-8"))
    fresh = build(online=False)
    old = {s["local"]: s for s in stored.get("skills", [])}
    new = {s["local"]: s for s in fresh["skills"]}
    drifted = [p for p in new if p in old and old[p].get("sha256") != new[p].get("sha256")]
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    if drifted or added or removed:
        for p in drifted:
            print(f"DRIFT: {p}", file=sys.stderr)
        for p in added:
            print(f"NEW:   {p}", file=sys.stderr)
        for p in removed:
            print(f"GONE:  {p}", file=sys.stderr)
        print("Regenerate with: python3 scripts/audit/skill_provenance.py", file=sys.stderr)
        return 1
    print(f"provenance OK: {fresh['totals']['present']}/{fresh['totals']['indexed']} skills hashed, 0 drift")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--online", action="store_true", help="resolve upstream HEAD commits with gh")
    parser.add_argument("--check", action="store_true", help="fail on drift instead of writing")
    args = parser.parse_args()
    if args.check:
        return check()
    data = build(online=args.online)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    t = data["totals"]
    print(
        f"wrote {OUT.relative_to(ROOT)}: {t['present']}/{t['indexed']} skills, "
        f"{t['missing']} missing, {t['repos']} repos, {t['bytes'] / 1e6:.1f} MB"
    )
    if args.online:
        unresolved = [r for r, i in data["repos"].items() if not i["upstream_commit"]]
        print(f"upstream commits resolved: {t['repos'] - len(unresolved)}/{t['repos']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
