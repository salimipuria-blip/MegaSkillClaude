#!/usr/bin/env python3
"""Measure the structural quality of every SKILL.md and report the weakest ones.

Backlog task 93 asks for a per-skill quality report — length, workflow, checklist,
defined output — with the 50 weakest listed, plus a test of this script.

What this is: a deterministic, offline, stdlib-only *structural* lint. Every point
comes from something a reader can verify by opening the file, and the rules are
printed in the report they produce. No model, no network, no judgement of whether a
skill's advice is good.

What this is not: a verdict. A skill can score low and still be the right tool
(`grill-me` is one line because it delegates to another skill), and a skill can
score high and be wrong. Scores rank review effort, nothing more.

  python3 scripts/report_skill_quality.py                        # write the report
  python3 scripts/report_skill_quality.py --check                # CI drift gate
  python3 scripts/report_skill_quality.py --json                 # machine-readable
  python3 scripts/report_skill_quality.py --target .             # include psk/ too
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGET = Path("library")
DEFAULT_INDEX = Path(".claude/skills/mega-skills-router/references/triggers.json")
DEFAULT_REPORT = Path("library/QUALITY_REPORT.md")
DEFAULT_LIMIT = 50

def _load_code_regions():
    """Share one definition of a fenced block with the link audit instead of inventing a second.

    `scripts/check_skill_links.py:code_regions` implements the CommonMark rule — a fence closes only
    on a later line with the same marker character and no info string — and returns the tail of a
    fence the file never closes separately. A first draft here used its own marker-only pairing and
    disagreed with the audit (15 "unclosed" files against its 0), which is exactly the drift a shared
    function makes impossible.
    """
    sibling = Path(__file__).resolve().parent / "check_skill_links.py"
    if not sibling.is_file():
        raise FileNotFoundError(f"cannot share the fence rule without {sibling}")
    spec = importlib.util.spec_from_file_location("_mega_skill_fence_rules", sibling)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # registered so callers can prove where the rule came from
    spec.loader.exec_module(module)
    return module.code_regions, module.FENCE


CODE_REGIONS, FENCE_RE = _load_code_regions()
ORDERED = re.compile(r"^\s*\d+[.)]\s+\S")
CHECKBOX = re.compile(r"^\s*[-*+]\s+\[[ xX]\]\s+\S")
BULLET = re.compile(r"^\s*[-*+]\s+\S")
HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
FRONTMATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)
WORD = re.compile(r"\w+")

# Detection vocabulary, English and Persian. Deliberately narrow: these only ever
# award points, never remove them, so a miss costs a skill at most one signal.
WORKFLOW = re.compile(
    r"workflow|work flow|process|procedure|step[- ]by[- ]step|\bsteps?\b|how to use|how it works"
    r"|روش|گردش.?کار|مراحل|گام",
    re.I,
)
CHECKLIST = re.compile(r"check.?list|before you (start|begin|ship)|definition of done|چک.?لیست|فهرست بررسی", re.I)
OUTPUT = re.compile(
    r"\boutputs?\b|deliverables?|expected (result|output)|final (result|output)|what you get"
    r"|artifacts? produced|\breturns?\b|\bproduce[sd]?\b|خروجی|تحویل|دادهٔ خروجی",
    re.I,
)

# Points are fixed and printed in the report, so a reader can recompute any row.
WEIGHTS = {
    "length": 25,
    "workflow": 25,
    "output": 20,
    "checklist": 15,
    "structure": 10,
    "example": 5,
}
INCOMPLETE_PENALTY = 10
LENGTH_BANDS = ((400, 25), (200, 20), (100, 13), (40, 6), (0, 0))
SCORE_BANDS = ((80, "strong"), (60, "usable"), (40, "thin"), (20, "weak"), (0, "stub"))


def _label(path: Path) -> str:
    """Repo-relative label that also works for fixture trees outside the repo."""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def split_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """Return the frontmatter fields and the body. A missing block is not an error."""
    match = FRONTMATTER.match(text)
    if not match:
        return {}, text
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(":")
        if sep:
            fields[key.strip()] = value.strip()
    return fields, text[match.end():]


def unwrap_body(lines: list[str]) -> tuple[list[str], str | None]:
    """Peel one wrapper fence when a skill's whole body sits inside it.

    Three imported skills were produced by an upstream converter ("Skill converted from
    X.prompt.md") that wrapped the entire document in a single four-backtick ```prompt block:
    `mcp-create-adaptive-cards` holds 1,210 words of real instructions inside it, and measuring
    that file's prose as empty would have put a measurement artefact at the top of the weakest
    list. Peeling happens only when every non-blank body line is inside one closed fence whose
    markers are the body's first and last content lines, so a genuine code sample is never
    unwrapped. The report records that it happened.
    """
    closed, unclosed = CODE_REGIONS(lines)
    content = [number for number, line in enumerate(lines, 1) if line.strip()]
    if not content or unclosed or not closed:
        return lines, None
    if not all(number in closed for number in content):
        return lines, None
    fences = [number for number, line in enumerate(lines, 1) if FENCE_RE.match(line)]
    if len(fences) < 2 or fences[0] != content[0] or fences[-1] != content[-1]:
        return lines, None
    wrapper = FENCE_RE.match(lines[fences[0] - 1]).group(2) or "fence"
    return lines[fences[0]:fences[-1] - 1], wrapper


def parse_lines(body: str) -> dict[str, object]:
    """Walk the body once. Prose is everything outside a fenced block.

    A code sample is not an instruction, so ordered lists, checkboxes, headings and word counts all
    come from prose only. A file that ends inside a fence the author never closed has that tail
    excluded too and is flagged: ambiguous content earns no points, and the flag is what sends a
    human to look at it.
    """
    lines, wrapper = unwrap_body(body.splitlines())
    closed, unclosed = CODE_REGIONS(lines)
    prose: list[str] = []
    headings: list[str] = []
    ordered = checkboxes = bullets = 0
    for number, line in enumerate(lines, 1):
        if number in closed or number in unclosed:
            continue
        prose.append(line)
        heading = HEADING.match(line)
        if heading:
            headings.append(heading.group(2))
            continue
        if CHECKBOX.match(line):
            checkboxes += 1
        elif BULLET.match(line):
            bullets += 1
        elif ORDERED.match(line):
            ordered += 1
    return {
        "prose": "\n".join(prose),
        "headings": headings,
        "ordered": ordered,
        "checkboxes": checkboxes,
        "bullets": bullets,
        "example": bool(closed),
        "unclosed": bool(unclosed),
        "wrapper": wrapper,
    }


def _source_of(source_path: str) -> str:
    """Curated skills are ours, imported ones are third-party, fixtures are neither."""
    if source_path.startswith("library/skills/"):
        return "curated"
    if source_path.startswith("library/github-skills/"):
        return "imported"
    return "other"


def measure(path: Path, entry: dict[str, object] | None) -> dict[str, object]:
    """One row of the report: raw measurements, the points they earn, and why not."""
    text = path.read_text(encoding="utf-8", errors="replace")
    fields, body = split_frontmatter(text)
    parsed = parse_lines(body)
    words = len(WORD.findall(str(parsed["prose"])))  # \w+ runs: markdown syntax is not prose
    headings = [str(h) for h in parsed["headings"]]
    heading_text = "\n".join(headings)
    ordered = int(parsed["ordered"])
    checkboxes = int(parsed["checkboxes"])
    bullets = int(parsed["bullets"])
    has_example = bool(parsed["example"])

    length_points = next(points for threshold, points in LENGTH_BANDS if words >= threshold)

    if ordered >= 3:
        workflow_points, workflow_kind = WEIGHTS["workflow"], "ordered-steps"
    elif WORKFLOW.search(heading_text):
        workflow_points, workflow_kind = 15, "workflow-heading"
    elif bullets >= 3:
        workflow_points, workflow_kind = 6, "bullets-only"
    else:
        workflow_points, workflow_kind = 0, "none"

    has_output_heading = bool(OUTPUT.search(heading_text))
    if has_output_heading:
        output_points, output_kind = WEIGHTS["output"], "output-heading"
    elif OUTPUT.search(str(parsed["prose"])):
        output_points, output_kind = 12, "output-prose"
    else:
        output_points, output_kind = 0, "none"

    has_checklist_heading = bool(CHECKLIST.search(heading_text))
    if checkboxes:
        checklist_points, checklist_kind = WEIGHTS["checklist"], "checkboxes"
    elif has_checklist_heading:
        checklist_points, checklist_kind = 10, "checklist-heading"
    else:
        checklist_points, checklist_kind = 0, "none"

    heading_count = len(headings)
    structure_points = WEIGHTS["structure"] if heading_count >= 2 else (5 if heading_count == 1 else 0)
    example_points = WEIGHTS["example"] if has_example else 0
    incomplete = bool(entry and entry.get("incomplete"))
    total = length_points + workflow_points + output_points + checklist_points + structure_points + example_points
    if incomplete:
        total = max(0, total - INCOMPLETE_PENALTY)

    missing = []
    if words < 200:
        missing.append("short")
    if workflow_kind == "none":
        missing.append("no-workflow")
    if checklist_kind == "none":
        missing.append("no-checklist")
    if output_kind == "none":
        missing.append("no-output")
    if structure_points < WEIGHTS["structure"]:
        missing.append("no-structure")
    if not has_example:
        missing.append("no-example")
    if incomplete:
        missing.append("incomplete")
    if bool(parsed["unclosed"]):
        missing.append("unclosed-fence")

    return {
        "path": _label(path),
        "name": str(entry.get("name")) if entry else path.parent.name,
        "domain": str(entry.get("domain")) if entry else "unindexed",
        "source": _source_of(str(entry.get("source_path")) if entry else _label(path)),
        "words": words,
        "headings": heading_count,
        "ordered": ordered,
        "checkboxes": checkboxes,
        "example": has_example,
        "frontmatter_name": bool(fields.get("name")),
        "frontmatter_description": bool(fields.get("description")),
        "workflow": workflow_kind,
        "checklist": checklist_kind,
        "output": output_kind,
        "incomplete": incomplete,
        "unclosed_fence": bool(parsed["unclosed"]),
        "wrapper": str(parsed["wrapper"] or ""),
        "points": {
            "length": length_points,
            "workflow": workflow_points,
            "output": output_points,
            "checklist": checklist_points,
            "structure": structure_points,
            "example": example_points,
        },
        "score": total,
        "missing": missing,
    }


def band_of(score: int) -> str:
    return next(label for threshold, label in SCORE_BANDS if score >= threshold)


def survey(target: Path, index_path: Path | None, limit: int = DEFAULT_LIMIT) -> dict[str, object]:
    """Measure every SKILL.md under `target` and aggregate. Fixture-safe."""
    entries: dict[str, dict[str, object]] = {}
    if index_path and index_path.is_file():
        payload = json.loads(index_path.read_text(encoding="utf-8"))
        for item in payload.get("skills", []):
            entries[str(item.get("source_path"))] = item

    # A SKILL.md inside another skill's folder is that skill's companion document (e.g.
    # qdrant-search-quality/diagnosis/SKILL.md), not a skill of its own: the router never indexes it.
    files = sorted(path for path in target.rglob("SKILL.md")
                   if not any((parent / "SKILL.md").is_file()
                              for parent in path.parent.parents if parent.is_relative_to(target)))
    rows = []
    for path in files:
        try:
            relative = str(path.relative_to(ROOT))
        except ValueError:
            relative = None
        entry = entries.get(relative) if relative else None
        rows.append(measure(path, entry))

    scores = [int(row["score"]) for row in rows]
    words = [int(row["words"]) for row in rows]
    bands = {label: 0 for _, label in SCORE_BANDS}
    for score in scores:
        bands[band_of(score)] += 1
    coverage = {
        "frontmatter_name": sum(1 for row in rows if row["frontmatter_name"]),
        "frontmatter_description": sum(1 for row in rows if row["frontmatter_description"]),
        "workflow_ordered": sum(1 for row in rows if row["workflow"] == "ordered-steps"),
        "workflow_heading": sum(1 for row in rows if row["workflow"] == "workflow-heading"),
        "workflow_bullets": sum(1 for row in rows if row["workflow"] == "bullets-only"),
        "checklist_boxes": sum(1 for row in rows if row["checklist"] == "checkboxes"),
        "checklist_heading": sum(1 for row in rows if row["checklist"] == "checklist-heading"),
        "output_heading": sum(1 for row in rows if row["output"] == "output-heading"),
        "output_prose": sum(1 for row in rows if row["output"] == "output-prose"),
        "example": sum(1 for row in rows if row["example"]),
        "structure": sum(1 for row in rows if row["points"]["structure"] == WEIGHTS["structure"]),
        "incomplete": sum(1 for row in rows if row["incomplete"]),
        "unclosed_fence": sum(1 for row in rows if row["unclosed_fence"]),
        "wrapped_body": sum(1 for row in rows if row["wrapper"]),
        "unindexed": sum(1 for row in rows if row["domain"] == "unindexed"),
    }
    weakest = sorted(rows, key=lambda row: (int(row["score"]), int(row["words"]), str(row["path"])))[:limit]

    def group(key: str) -> dict[str, dict[str, object]]:
        buckets: dict[str, list[int]] = {}
        for row in rows:
            buckets.setdefault(str(row[key]), []).append(int(row["score"]))
        return {
            name: {"skills": len(values), "mean": round(statistics.mean(values), 1),
                   "min": min(values), "max": max(values)}
            for name, values in sorted(buckets.items())
        }

    return {
        "target": _label(target),
        "index": _label(index_path) if index_path else "none",
        "index_skills": len(entries),
        "scanned": len(rows),
        "bytes": sum(path.stat().st_size for path in files),
        "limit": limit,
        "weights": dict(WEIGHTS),
        "incomplete_penalty": INCOMPLETE_PENALTY,
        "scores": {
            "min": min(scores) if scores else 0,
            "median": int(statistics.median(scores)) if scores else 0,
            "mean": round(statistics.mean(scores), 1) if scores else 0.0,
            "max": max(scores) if scores else 0,
        },
        "words": {
            "min": min(words) if words else 0,
            "median": int(statistics.median(words)) if words else 0,
            "mean": round(statistics.mean(words)) if words else 0.0,
            "max": max(words) if words else 0,
        },
        "bands": bands,
        "coverage": coverage,
        "by_source": group("source"),
        "by_domain": group("domain"),
        "rows": rows,
        "weakest": weakest,
    }


def render_report(result: dict[str, object]) -> str:
    """Deterministic markdown: no timestamps, no durations, fixed ordering.

    Every number in here is read from `result`, including the ones inside sentences: a hardcoded
    figure is one that silently goes stale, and a test can only catch it if the renderer derives it.
    """
    rows = [dict(row) for row in result["rows"]]  # type: ignore[arg-type]
    peeled_words = max((int(row["words"]) for row in rows if row["wrapper"]), default=0)
    scanned = int(result["scanned"])
    scores = result["scores"]  # type: ignore[index]
    words = result["words"]  # type: ignore[index]
    coverage = result["coverage"]  # type: ignore[index]
    lines = [
        "# QUALITY_REPORT — structural lint over every SKILL.md",
        "",
        "Generated by `python3 scripts/report_skill_quality.py --report library/QUALITY_REPORT.md`.",
        "Do not hand-edit: `--check` (CI job `router`) fails when this file is not byte-for-byte what a",
        "fresh run produces. Backlog task 93 asks for length, workflow, checklist and defined output per",
        "skill plus the 50 weakest; this is that report.",
        "",
        "**What a score means.** Every point below comes from a rule a reader can verify by opening the",
        "file — no model and no network were involved. A low score means *thin structure*, not *bad",
        "advice*: `library/github-skills/grill-me` is one line because it hands off to another skill, and",
        "that is a legitimate design. Scores exist to rank review effort, and nothing here was rewritten,",
        "deleted or demoted: routing is untouched by this report.",
        "",
        "## Scope (measured)",
        "",
        "| measured | value |",
        "|---|---|",
        f"| tree scanned | `{result['target']}` |",
        f"| index joined on `source_path` | `{result['index']}` |",
        f"| SKILL.md files | {scanned:,} |",
        f"| bytes | {int(result['bytes']):,} |",
        f"| words per skill (min / median / mean / max) | {words['min']:,} / {words['median']:,} / "
        f"{words['mean']} / {words['max']:,} |",
        f"| score (min / median / mean / max) | {scores['min']} / {scores['median']} / {scores['mean']} / "
        f"{scores['max']} |",
        f"| weakest listed | {len(result['weakest'])} (limit {result['limit']}) |",
        "",
        "Word counts exclude fenced blocks and frontmatter, so a skill padded with a long code sample",
        "is not rewarded for it, and a word is a run of word characters, so heading hashes, list markers",
        "and table pipes do not pad the number either. The default scope is `library/`; `--target .`",
        f"widens it to all {int(result['index_skills']):,} indexed skills (the `psk/` half is out of",
        "scope for task 93 and CI does not scan it).",
        "",
        "## Criteria and points",
        "",
        "| signal | points | rule |",
        "|---|---|---|",
        "| length | 25 / 20 / 13 / 6 / 0 | prose words ≥ 400 / ≥ 200 / ≥ 100 / ≥ 40 / below |",
        "| workflow | 25 | ordered list with ≥ 3 steps outside fences |",
        "| workflow | 15 | else a heading matching `workflow`/`process`/`steps`/`مراحل`/`روش` |",
        "| workflow | 6 | else ≥ 3 bullets (a list, but no order) |",
        "| defined output | 20 | a heading matching `output`/`deliverable`/`expected result`/`خروجی` |",
        "| defined output | 12 | else such a phrase in prose |",
        "| checklist | 15 | at least one `- [ ]` / `- [x]` item outside fences |",
        "| checklist | 10 | else a heading matching `checklist`/`چک‌لیست` |",
        "| structure | 10 / 5 / 0 | ≥ 2 headings / exactly 1 / none |",
        "| example | 5 | at least one fenced block |",
        f"| penalty | −{result['incomplete_penalty']} | flagged `incomplete` in the index (a promised "
        "companion file is missing, so the instructions dead-end) |",
        "",
        f"Maximum is {sum(int(v) for v in result['weights'].values())} before the penalty; the score is "
        "floored at 0.",
        "",
        "Fenced blocks follow CommonMark via `scripts/check_skill_links.py:code_regions` — one",
        "definition shared by both tools, so a fence is closed only by the same marker character, at",
        "least as many markers, indented 0-3 spaces and carrying no info string. A file that ends",
        "inside a fence it never closes has that tail excluded from prose and is flagged",
        "`unclosed-fence`, because ambiguous content earns no points and the flag is what sends a",
        "human to read it.",
        "",
        f"{int(coverage['wrapped_body'])} imported skills wrap their entire body in one ```prompt fence "
        "(an upstream",
        "converter artefact that begins \"Skill converted from\"); the wrapper is peeled before "
        "measuring, so the",
        f"{peeled_words:,} words of prose inside the largest of them are not reported as zero. Peeling "
        "happens only when",
        "every non-blank body line sits inside that one fence, so a genuine code sample is never "
        "unwrapped.",
        "",
        "## Signal coverage (measured)",
        "",
        "| signal | skills | share |",
        "|---|---|---|",
    ]
    labels = [
        ("frontmatter_name", "frontmatter `name`"),
        ("frontmatter_description", "frontmatter `description`"),
        ("workflow_ordered", "workflow: ordered steps"),
        ("workflow_heading", "workflow: heading only"),
        ("workflow_bullets", "workflow: bullets only"),
        ("checklist_boxes", "checklist: `- [ ]` items"),
        ("checklist_heading", "checklist: heading only"),
        ("output_heading", "defined output: heading"),
        ("output_prose", "defined output: prose only"),
        ("example", "at least one code example"),
        ("structure", "≥ 2 headings"),
        ("incomplete", "flagged `incomplete` (penalised)"),
        ("unclosed_fence", "ends inside an open fence"),
        ("wrapped_body", "whole body inside one wrapper fence (peeled before measuring)"),
        ("unindexed", "not found in the router index"),
    ]
    for key, label in labels:
        count = int(coverage[key])  # type: ignore[index]
        share = f"{100 * count / scanned:.1f}%" if scanned else "—"
        lines.append(f"| {label} | {count:,} | {share} |")
    lines += [
        "",
        "Read as: ordered steps are the norm (see `workflow: ordered steps`), an explicit checklist is",
        "rare, and a heading that names the output is rarer still — that is the cheapest structural fix",
        "available to any skill author, imported or curated.",
        "",
        "## Score bands",
        "",
        "| band | score | skills | share |",
        "|---|---|---|---|",
    ]
    band_ranges = {"strong": "80–100", "usable": "60–79", "thin": "40–59", "weak": "20–39", "stub": "0–19"}
    for _, label in SCORE_BANDS:
        count = int(result["bands"][label])  # type: ignore[index]
        share = f"{100 * count / scanned:.1f}%" if scanned else "—"
        lines.append(f"| `{label}` | {band_ranges[label]} | {count:,} | {share} |")
    lines += ["", "## By source", "", "| source | skills | mean | min | max |", "|---|---|---|---|---|"]
    for name, stats in sorted(result["by_source"].items()):  # type: ignore[union-attr]
        lines.append(f"| `{name}` | {stats['skills']:,} | {stats['mean']} | {stats['min']} | {stats['max']} |")
    lines += ["", "## By domain", "", "| domain | skills | mean | min | max |", "|---|---|---|---|---|"]
    for name, stats in sorted(result["by_domain"].items()):  # type: ignore[union-attr]
        lines.append(f"| `{name}` | {stats['skills']:,} | {stats['mean']} | {stats['min']} | {stats['max']} |")
    lines += [
        "",
        f"## The {len(result['weakest'])} weakest skills",
        "",
        "Lowest score first; ties break on fewer words, then on path, so the table is reproducible.",
        "`missing` lists the signals that earned nothing — that is the review checklist for each row.",
        "",
        "| # | score | band | words | workflow | checklist | output | incomplete | skill | missing |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for position, row in enumerate(result["weakest"], start=1):  # type: ignore[union-attr]
        lines.append(
            f"| {position} | {row['score']} | `{band_of(int(row['score']))}` | {row['words']:,} "
            f"| {row['workflow']} | {row['checklist']} | {row['output']} "
            f"| {'yes' if row['incomplete'] else 'no'} | `{row['path']}` | {', '.join(row['missing']) or '—'} |"
        )
    lines += [
        "",
        "## What this report does not say",
        "",
        "- It does not judge whether a skill's *content* is correct, current or useful — only whether the",
        "  document has the structure a reader needs to act on it.",
        "- It does not measure the 3,000 `psk/data/skills/` entries under the default scope, so a high",
        "  library mean says nothing about the router's whole catalogue.",
        "- It has not changed any file: no skill was edited, re-scored into routing, or removed. The",
        "  `incomplete` column repeats the flag that `scripts/check_skill_links.py` maintains.",
        "- Regex detection is a proxy. A skill that names its output as `### What you get back` scores",
        "  full points; one that says `hand the JSON to the next step` without a keyword scores none.",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="report_skill_quality", description=__doc__.splitlines()[0])
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET, help="tree to scan for SKILL.md")
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX, help="router index joined on source_path")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT, help="markdown report path")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="how many weakest skills to list")
    parser.add_argument("--check", action="store_true", help="fail when the committed report is not current")
    parser.add_argument("--json", action="store_true", help="machine-readable survey instead of the report")
    parser.add_argument("--verbose", action="store_true", help="print every row, not just the weakest")
    args = parser.parse_args(argv)

    if args.limit < 1:
        print("--limit must be at least 1", file=sys.stderr)
        return 2
    target = args.target if args.target.is_absolute() else ROOT / args.target
    if not target.is_dir():
        print(f"no such directory: {target}", file=sys.stderr)
        return 2
    index = args.index if args.index.is_absolute() else ROOT / args.index
    result = survey(target, index if index.is_file() else None, limit=args.limit)
    if not result["scanned"]:
        print(f"no SKILL.md under {_label(target)}", file=sys.stderr)
        return 2

    if args.json:
        payload = dict(result)
        if not args.verbose:
            payload.pop("rows", None)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    rendered = render_report(result).encode("utf-8")
    report = args.report if args.report.is_absolute() else ROOT / args.report
    if args.check:
        current = report.read_bytes() if report.is_file() else b""
        if current == rendered:
            print(f"quality report is current: {_label(report)} "
                  f"({result['scanned']:,} skills, weakest score {result['weakest'][0]['score']})")
            return 0
        print(f"DRIFT: {_label(report)} is not what a fresh run produces "
              f"({result['scanned']:,} skills). "
              f"Re-run: python3 scripts/report_skill_quality.py --report {args.report}", file=sys.stderr)
        return 1
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_bytes(rendered)
    print(f"wrote {_label(report)}: {result['scanned']:,} skills, {int(result['bytes']):,} bytes, "
          f"mean score {result['scores']['mean']}, {len(result['weakest'])} weakest listed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
