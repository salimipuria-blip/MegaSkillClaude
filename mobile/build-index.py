#!/usr/bin/env python3
"""Build the compact skills index for the iPhone console (mobile/).

Source of truth is the canonical router index
``.claude/skills/mega-skills-router/references/triggers.json`` — never edit
``mobile/skills-index.json`` by hand. Run from anywhere:

    python3 mobile/build-index.py           # rebuild mobile/skills-index.json
    python3 mobile/build-index.py --check   # fail if the committed index is stale
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".claude/skills/mega-skills-router/references/triggers.json"
OUTPUT = ROOT / "mobile/skills-index.json"


def build() -> bytes:
    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    skills = [
        {
            "n": s["name"],
            "d": s["domain"],
            "p": s["source_path"],
            # A few triggers are enough for on-device search; the full
            # 30k-trigger index stays in the router for Claude Code.
            "t": s.get("triggers", [])[:5],
        }
        for s in payload["skills"]
        if not s.get("incomplete")  # incomplete skills are manual-review only
    ]
    doc = {
        "schema": "mega-skills-mobile/v1",
        "counts": {"routable_skills": len(skills)},
        "skills": skills,
    }
    return (json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def main() -> int:
    data = build()
    if "--check" in sys.argv:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != data:
            print("ERROR: mobile/skills-index.json is stale; run mobile/build-index.py", file=sys.stderr)
            return 2
        print(f"mobile index: OK ({json.loads(data)['counts']['routable_skills']} routable skills)")
        return 0
    OUTPUT.write_bytes(data)
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(data)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
