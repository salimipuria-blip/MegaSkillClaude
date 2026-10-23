#!/usr/bin/env python3
"""Scan imported third-party skill instructions for prompt-injection and remote-code patterns.

Backlog task 17: report, never delete. `library/github-skills/**` is imported MIT-licensed material
(2,946 skills) whose text is handed to a model as *instructions*. A line telling the model to drop
the operator's rules, or to pipe a remote script into a shell, is a supply-chain risk even when
nobody meant harm — and the operator cannot review 32 MB of prose by eye, so the review has to be
directed at the lines that matter.

Scopes:
  instructions (default)  `SKILL.md` only: 2,949 files / 32.5 MB / ~7 s. This is what CI gates.
  all                     every text file in the same tree: 14,792 files / 120 MB. Audit mode.

A finding is a review item, not a verdict. Half of them are vendor install commands quoted inside
documentation; the report says so instead of implying an attack. Nothing here deletes, quarantines
or rewrites a skill: the library stays byte-identical, and `--check` proves the committed report in
`library/SECURITY_SCAN.md` is what a fresh scan produces (the same lockfile trick the sticker
manifest and the claude.ai zips use). Output is sorted and carries no timestamps, so it is stable.

Usage:
  python3 scripts/scan_third_party_skills.py --report library/SECURITY_SCAN.md   # write the report
  python3 scripts/scan_third_party_skills.py --check                             # CI: report is current
  python3 scripts/scan_third_party_skills.py --scope all --json                  # audit, machine-readable
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGET = ROOT / "library/github-skills"
DEFAULT_REPORT = ROOT / "library/SECURITY_SCAN.md"

# (key, severity, regex, why it matters). Order is fixed: the report is sorted by it, then by skill.
PATTERNS: tuple[tuple[str, str, re.Pattern[str], str], ...] = (
    ("prompt-override", "high",
     re.compile(r"ignore (?:all |any )?(?:previous|prior|above|earlier) (?:instructions|prompts|rules|directives)", re.I),
     "asks the model to drop the operator's rules"),
    ("persona-hijack", "high",
     re.compile(r"(?:you are now|new system prompt|disregard (?:the|your) system|forget (?:all|your) (?:rules|instructions))", re.I),
     "replaces the operator's persona or system prompt"),
    ("curl-pipe-shell", "high",
     re.compile(r"(?:curl|wget)[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b", re.I),
     "downloads a remote script and executes it"),
    ("base64-decode-exec", "high",
     re.compile(r"base64\s+(?:-d|--decode)[^\n]*\|\s*(?:ba)?sh|atob\([^\n]*\)", re.I),
     "decodes a hidden payload before executing it"),
    ("reverse-shell", "high",
     re.compile(r"(?:/dev/tcp/|\bnc\s+-e\b|socat[^\n]*exec)", re.I),
     "opens an outbound shell"),
    ("exfil-endpoint", "high",
     re.compile(r"(?:webhook\.site|ngrok|pastebin|discord\.com/api/webhooks|requestbin|burpcollaborator)", re.I),
     "sends data to a request-collection endpoint"),
    ("credential-path", "medium",
     re.compile(r"(?:~/\.ssh/|~/\.aws/|\.netrc\b|\bid_rsa\b|keychain|credentials\.json)", re.I),
     "reads or points at stored credentials"),
    ("privilege-escalation", "medium",
     re.compile(r"\bsudo\s+(?:chmod|chown|rm|curl|wget|npm|pip|bash|sh)\b", re.I),
     "runs a mutating command as root"),
    ("install-hook", "medium",
     re.compile(r"[\"']?(?:postinstall|preinstall)[\"']?\s*:", re.I),
     "package lifecycle hook, runs automatically on install"),
    ("hidden-content", "low",
     re.compile(r"<(?:div|span|p|section)[^>]*(?:display:\s*none|visibility:\s*hidden|font-size:\s*0)", re.I),
     "text a human reader of the file would not see"),
)

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
SNIPPET_CHARS = 110
BINARY_PROBE = 4096


def _label(path: Path) -> str:
    """Repo-relative when possible, absolute otherwise: the scanner also runs over fixture trees."""
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def scan_tree(target: Path, scope: str) -> dict[str, object]:
    """Walk the third-party tree once and return every finding plus the measured scope."""
    files = sorted(target.rglob("*"))
    scanned = skipped_binary = unreadable = 0
    total_bytes = 0
    findings: list[dict[str, object]] = []
    for path in files:
        if not path.is_file():
            continue
        relative = path.relative_to(target).as_posix()
        if scope == "instructions" and path.name != "SKILL.md":
            continue
        try:
            raw = path.read_bytes()
        except OSError:
            unreadable += 1
            continue
        if b"\x00" in raw[:BINARY_PROBE]:
            skipped_binary += 1
            continue
        scanned += 1
        total_bytes += len(raw)
        text = raw.decode("utf-8", errors="replace")
        for key, severity, pattern, why in PATTERNS:
            for number, line in enumerate(text.splitlines(), start=1):
                match = pattern.search(line)
                if match:
                    findings.append({
                        "skill": relative.split("/")[0],
                        "file": relative,
                        "pattern": key,
                        "severity": severity,
                        "why": why,
                        "line": number,
                        "snippet": " ".join(line.split())[:SNIPPET_CHARS],
                        "matched": match.group(0)[:60],
                    })
    findings.sort(key=lambda item: (SEVERITY_ORDER[item["severity"]], item["pattern"], item["file"], item["line"]))
    return {"target": _label(target), "scope": scope, "scanned": scanned,
            "bytes": total_bytes, "skipped_binary": skipped_binary, "unreadable": unreadable,
            "skills": len({item["skill"] for item in findings}), "findings": findings}


def render_report(result: dict[str, object]) -> str:
    """Deterministic markdown: no timestamps, no durations, fixed ordering."""
    findings = result["findings"]
    per_pattern: dict[str, list[dict[str, object]]] = {}
    for item in findings:
        per_pattern.setdefault(str(item["pattern"]), []).append(item)
    lines = [
        "# SECURITY_SCAN — third-party skill instructions",
        "",
        "Generated by `python3 scripts/scan_third_party_skills.py --report library/SECURITY_SCAN.md`.",
        "Do not hand-edit: `--check` (CI job `router`) fails when this file is not byte-for-byte what a",
        "fresh scan produces. A finding is a **review item, not a verdict** — most hits below are vendor",
        "install commands quoted inside a skill's own documentation. Nothing was deleted, quarantined or",
        "rewritten: backlog task 17 asks for a report only, and the library stays byte-identical.",
        "",
        "## Scope (measured)",
        "",
        "| measured | value |",
        "|---|---|",
        f"| tree | `{result['target']}` |",
        f"| scope | `{result['scope']}` ({'`SKILL.md` only' if result['scope'] == 'instructions' else 'every text file'}) |",
        f"| files scanned | {result['scanned']:,} |",
        f"| bytes scanned | {result['bytes']:,} |",
        f"| binary files skipped | {result['skipped_binary']:,} |",
        f"| unreadable files | {result['unreadable']:,} |",
        f"| patterns applied | {len(PATTERNS)} |",
        f"| findings | {len(findings):,} |",
        f"| skills with at least one finding | {result['skills']:,} |",
        "",
        "## Findings by pattern",
        "",
        "| pattern | severity | why it matters | hits | skills |",
        "|---|---|---|---|---|",
    ]
    for key, severity, _pattern, why in PATTERNS:
        hits = per_pattern.get(key, [])
        skills = len({str(item["skill"]) for item in hits})
        lines.append(f"| `{key}` | {severity} | {why} | {len(hits)} | {skills} |")
    lines += ["", "## Review queue", "",
              "Every hit, ordered by severity then file. Read the snippet in context before judging it:",
              "a `curl … | sudo bash` inside an Azure CLI install guide is documentation, not an attack.",
              "", "| severity | pattern | skill | file | line | snippet |", "|---|---|---|---|---|---|"]
    for item in findings:
        snippet = str(item["snippet"]).replace("|", "\\|")
        lines.append(f"| {item['severity']} | `{item['pattern']}` | `{item['skill']}` | "
                     f"`{item['file']}` | {item['line']} | `{snippet}` |")
    # 166 findings are not 166 things to read: the same boilerplate line repeats across skill
    # families (one vendor's `credentials.json` paragraph appears in ~20 skills). Grouping by
    # (pattern, line) turns the queue into the distinct lines a reviewer actually has to judge.
    grouped: dict[tuple[str, str], list[str]] = {}
    for item in findings:
        grouped.setdefault((str(item["pattern"]), str(item["snippet"])), []).append(str(item["skill"]))
    repeated = sorted(((key, skills) for key, skills in grouped.items() if len(skills) > 1),
                      key=lambda pair: (-len(pair[1]), pair[0][0], pair[0][1]))
    lines += ["", "## Distinct lines behind the findings", "",
              f"{len(findings):,} findings collapse to {len(grouped):,} distinct (pattern, line) pairs.",
              f"{len(repeated)} of those pairs repeat across skills; the table lists the most repeated ones,",
              "so reading it reviews most of the queue. Fix or accept a line once, and every skill carrying",
              "it is decided.", "", "| pattern | skills | line |", "|---|---|---|"]
    for (pattern, snippet), skills in repeated[:25]:
        lines.append(f"| `{pattern}` | {len(skills)} | `{snippet.replace('|', chr(92) + '|')}` |")

    high = [item for item in findings if item["severity"] == "high"]
    overrides = [item for item in findings if item["pattern"] in {"prompt-override", "persona-hijack"}]
    lines += [
        "",
        "## Reading this report",
        "",
        f"- Prompt-override and persona-hijack hits: **{len(overrides)}**. These are the patterns that turn an",
        "  imported instruction into an instruction to the model itself, so they are the first thing to read.",
        f"- High-severity hits in total: **{len(high)}** (`curl … | sh`, decoded payloads, reverse shells,",
        "  collection endpoints). They are commands a skill tells its *user* to run, which is normal for",
        "  installer-style skills; the risk is running them without reading, not their presence here.",
        "- Skills are only routed when they match a request, and skills marked `incomplete` are excluded from",
        "  default routing (`--include-incomplete` is opt-in). A finding never changes routing on its own.",
        "- Re-run after any library import: `python3 scripts/scan_third_party_skills.py --report "
        "library/SECURITY_SCAN.md`, then read the diff of this file — that diff *is* the review of the new material.",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="scan_third_party_skills", description=__doc__.splitlines()[0])
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET, help="third-party skill tree")
    parser.add_argument("--scope", choices=("instructions", "all"), default="instructions",
                        help="instructions = SKILL.md only (CI); all = every text file (audit)")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT, help="markdown report path")
    parser.add_argument("--check", action="store_true", help="fail when the committed report is not current")
    parser.add_argument("--json", action="store_true", help="machine-readable findings instead of the report")
    args = parser.parse_args(argv)

    target = args.target if args.target.is_absolute() else ROOT / args.target
    if not target.is_dir():
        print(f"no such directory: {target}", file=sys.stderr)
        return 2
    result = scan_tree(target, args.scope)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    rendered = render_report(result).encode("utf-8")
    report = args.report if args.report.is_absolute() else ROOT / args.report
    if args.check:
        current = report.read_bytes() if report.is_file() else b""
        if current == rendered:
            print(f"security scan report is current: {_label(report)} "
                  f"({result['scanned']:,} files, {len(result['findings']):,} findings)")
            return 0
        print(f"DRIFT: {_label(report)} is not what a fresh scan produces "
              f"({result['scanned']:,} files, {len(result['findings']):,} findings). "
              f"Re-run: python3 scripts/scan_third_party_skills.py --report {args.report}", file=sys.stderr)
        return 1
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_bytes(rendered)
    print(f"wrote {_label(report)}: {result['scanned']:,} files, {result['bytes']:,} bytes, "
          f"{len(result['findings']):,} findings in {result['skills']:,} skills")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
