#!/usr/bin/env python3
"""Audit the relative links inside imported third-party SKILL.md files (backlog task 90).

Why this exists
---------------
`library/github-skills/` holds 2,946 skills imported folder by folder from 28 public repositories.
An imported SKILL.md can point at a companion file that was never copied, and then the router hands
an agent instructions that dead-end. `library/CLAUDE.md` records the baseline measured on 2026-10-18
with an ad-hoc snippet: **114 skills with a dead local link, 67 of them not flagged `incomplete`**.
That snippet is replaced by this script, which is tested and reports why every remaining dead link
is allowed to stay.

The convention enforced here is the one already in the data, measured over the 284 flagged skills
and their 682 recorded `missing_files`: every one is a path *inside* the skill's own folder (three of
them nested sub-skills), and none escapes the folder, contains a placeholder or ends in a slash. So:

    A relative link that stays inside the skill folder and names a real path is a *promised
    companion*. If that file is absent, the skill must carry `incomplete: true` in INDEX.json, an
    `INCOMPLETE:` line in its own SOURCE.md, and the same flag in the canonical router index.

Four shapes are counted instead of flagged:

`placeholder`
    The target is a template (`{slug}`, `<type>`) or is not a path at all (`src`, `url`, `2`). The
    upstream author wrote a variable, not a file. Mechanical rule, no per-skill review.
`code_sample`
    The link sits inside a *properly closed* fenced block. Those blocks hold templates and example
    documents, not instructions to the reader: `create-llms` shows the `llms.txt` it wants written,
    `microsoft-skill-creator` shows a whole "Generated SKILL.md", and `segment-anything-model`
    contains Python whose `registry["vit_h"](checkpoint="x.pth")` merely looks like a link. Fences
    are paired (same marker character, no info string on the closer); a file that ends inside an
    unclosed fence is *not* trusted — its links are treated as prose and the file is reported under
    `unclosed_fence`, so a dead link can never hide behind a broken fence. Today 36 dead links are
    code samples and no file has a dead link in an unclosed tail.
`upstream
    The target escapes the skill folder (`../../DESIGN.md`, `../../../c-level-advisor/skills/x`).
    Upstream the skill lived inside a repository tree; the portable layout is flat, so those paths
    cannot exist here by construction. Mechanical rule, no per-skill review.
`justified`
    An inside-folder link that was read by hand and ruled out, as either `illustrative` (a row of a
    sample table the instructions ask the agent to produce) or `sibling` (a pointer to another skill
    or plugin of the same upstream suite). Each entry in `JUSTIFIED` is pinned to the line it was
    read on; if that line moves or the target changes, the entry goes stale and this audit fails
    instead of quietly keeping an expired excuse alive.

Nothing here downloads, rewrites or deletes. A missing companion has exactly two remedies and both
belong to the owner: supply the file from its origin, or flag the skill. Executable companions are
flagged rather than imported on purpose — `library/CLAUDE.md` forbids running third-party scripts,
and importing one would ship it inside the portable plugin that users install.

Usage: python3 scripts/check_skill_links.py [--json] [--check] [--verbose]
Exit:  0 clean · 1 something unflagged, unjustified or stale · 2 unreadable input
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / 'library/github-skills'
INDEX = LIBRARY / 'INDEX.json'
CANONICAL_INDEX = ROOT / '.claude/skills/mega-skills-router/references/triggers.json'

LINK = re.compile(r'\[[^\]]*\]\(([^)#\s]+)\)')
EXTERNAL = ('http://', 'https://', 'mailto:', '#', '<')
PLACEHOLDER = re.compile(r'[{}<>]')
INCOMPLETE_LINE = re.compile(r'^INCOMPLETE:\s*(?P<body>.*)$', re.M)

# Hand-reviewed exceptions: (skill, link target) -> (line it was read on, kind, reason).
# `illustrative` = the link sits in example content the skill asks the agent to produce, so the file
# is meant to be created, not shipped. `sibling` = the link points at another skill or plugin of the
# same upstream suite, which the flat portable layout cannot contain (same reason `upstream` refs are
# counted, written here without `../`).
JUSTIFIED: dict[tuple[str, str], tuple[int, str, str]] = {
    ('self-improving-agent', 'engineering-team/playwright-pro/'): (
        162, 'sibling', 'folder pointer to a sister plugin of the upstream repository, not a file this skill needs'),
    ('security-pen-testing', 'engineering/skills/dependency-auditor/SKILL.md'): (
        305, 'sibling', 'row of a see-also table pointing at another skill of the upstream suite'),
}

# CommonMark 4.5: a fence is indented 0-3 spaces (4 or more is an indented code block, not a fence)
# and its info string may not contain a backtick. The length of the marker run matters: a fence
# opened with four backticks is closed only by four or more.
FENCE = re.compile(r'^\s{0,3}(```+|~~~+)[ \t]*(\S*)')


def code_regions(lines: list[str]) -> tuple[set[int], set[int]]:
    """Line numbers inside closed fenced blocks, and inside a fence the file never closes.

    CommonMark pairs a fence with a later line that (a) is indented 0-3 spaces, (b) uses the same
    marker character, (c) uses at least as many marker characters as the opener, and (d) carries no
    info string. Anything left open at end of file is returned separately so callers can fail closed
    on it.

    Both (a) and (c) were missing here until `scripts/report_skill_quality.py` reused this function
    and its own marker-only pairing disagreed with it. Measured over the 3,011 imported skills, the
    incomplete rule mis-paired 37 files — 1,435 lines landed on the wrong side of a fence — and
    called 26 files unclosed where the spec says 16. This audit's own buckets did not move, because
    it checks that a link target exists *before* it consults the fence excuse, so the 7 links in
    `markdown-to-html/SKILL.md` that sat in a wrongly-closed region were already counted resolved.
    Anything that measures prose instead — the quality lint — would have scored those 37 files on
    text that is not theirs.
    """
    closed: set[int] = set()
    opened_at: int | None = None
    opened_marker: str | None = None
    for number, line in enumerate(lines, 1):
        match = FENCE.match(line)
        if not match:
            continue
        marker, info = match.group(1), match.group(2)
        if opened_at is None:
            opened_at, opened_marker = number, marker
        elif marker[0] == opened_marker[0] and len(marker) >= len(opened_marker) and not info:
            closed.update(range(opened_at, number + 1))
            opened_at = None
    unclosed = set(range(opened_at, len(lines) + 1)) if opened_at else set()
    return closed, unclosed


def normalize(target: str) -> str:
    """`./assets/x` and `assets/x` are the same promised file."""
    return target[2:] if target.startswith('./') else target


def classify(target: str) -> str:
    """Bucket one markdown link target."""
    if target.startswith(EXTERNAL):
        return 'external'
    if PLACEHOLDER.search(target) or not re.search(r'[./]', target):
        return 'placeholder'
    if target.startswith('../'):
        return 'upstream'
    return 'local'


def read_links(path: Path) -> list[tuple[int, str]]:
    """Every (line number, link target) in a SKILL.md, in file order."""
    found = []
    for number, line in enumerate(path.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
        for target in LINK.findall(line):
            found.append((number, target))
    return found


def audit(library: Path = LIBRARY, index: Path = INDEX,
          canonical: Path = CANONICAL_INDEX) -> dict:
    """Measure one library tree and return the report dictionary.

    The paths are parameters so a test can audit a synthetic tree; the defaults are the real
    library, its INDEX.json and the canonical router index.
    """
    entries = json.loads(index.read_text(encoding='utf-8'))
    by_name = {entry['name']: entry for entry in entries}
    router = json.loads(canonical.read_text(encoding='utf-8'))
    router_flags = {skill['name']: bool(skill.get('incomplete'))
                    for skill in router['skills'] if skill.get('origin') == 'github'}

    report: dict = {
        'skills_scanned': 0,
        'links': 0,
        'resolved': 0,
        'external': 0,
        'placeholder': 0,
        'upstream': 0,
        'justified': 0,
        'code_sample': 0,
        'missing': 0,
        'missing_files': 0,
        'flagged_incomplete': sum(1 for entry in entries if entry.get('incomplete')),
        'unflagged': [],
        'stale_justification': [],
        'stale_flag': [],
        'unrecorded_dead_link': [],
        'index_desync': [],
        'source_line_mismatch': [],
        'unclosed_fence': [],
        'details': {},
    }

    for folder in sorted(path for path in library.iterdir() if path.is_dir()):
        instructions = folder / 'SKILL.md'
        if not instructions.is_file():
            continue
        name = folder.name
        entry = by_name.get(name)
        if entry is None:
            report['index_desync'].append(f'{name}: folder exists but INDEX.json has no entry')
            continue
        report['skills_scanned'] += 1
        lines = instructions.read_text(encoding='utf-8', errors='replace').splitlines()
        closed, unclosed = code_regions(lines)
        dead: dict[str, int] = {}
        for number, raw_target in read_links(instructions):
            target = normalize(raw_target)
            report['links'] += 1
            kind = classify(target)
            if kind == 'external':
                report['external'] += 1
                continue
            if (folder / target).exists():
                report['resolved'] += 1
                continue
            if kind == 'placeholder':
                report['placeholder'] += 1
                continue
            if number in closed:
                report['code_sample'] += 1
                continue
            if number in unclosed:
                report['unclosed_fence'].append(
                    f'{name}: line {number} links to the absent {target} inside a fenced block the file '
                    f'never closes — read it by hand before trusting the code-sample rule')
            if kind == 'upstream':
                report['upstream'] += 1
                continue
            excuse = JUSTIFIED.get((name, target))
            if excuse:
                pinned, justified_kind, reason = excuse
                if pinned > len(lines) or target not in lines[pinned - 1]:
                    report['stale_justification'].append(
                        f'{name}: justification for {target} ({justified_kind}) is pinned to line {pinned}, '
                        f'which no longer carries that link — re-read the skill and update or drop the entry')
                else:
                    report['justified'] += 1
                    continue
            report['missing'] += 1
            dead[target] = number

        flagged = bool(entry.get('incomplete'))
        recorded = list(entry.get('missing_files') or [])
        if dead:
            report['missing_files'] += len(dead)
            report['details'][name] = {'dead': dead, 'flagged': flagged, 'recorded': recorded}
            if not flagged:
                report['unflagged'].append(name)
            else:
                unrecorded = sorted(set(dead) - {normalize(item) for item in recorded})
                if unrecorded:
                    report['unrecorded_dead_link'].append(
                        f'{name}: flagged incomplete, but INDEX.json missing_files does not list '
                        f'{", ".join(unrecorded)}')
        if flagged:
            stale = sorted(path for path in recorded if (folder / path).exists())
            if stale:
                report['stale_flag'].append(
                    f'{name}: still flagged incomplete although {", ".join(stale)} exist now')
            source = folder / 'SOURCE.md'
            body = INCOMPLETE_LINE.search(source.read_text(encoding='utf-8', errors='replace')) if source.is_file() else None
            if body is None:
                report['source_line_mismatch'].append(f'{name}: INDEX.json says incomplete but SOURCE.md has no INCOMPLETE: line')
            else:
                listed = body.group('body').split(': ')[-1].strip()
                joined = ', '.join(recorded)
                # Long lists are abbreviated in SOURCE.md with a trailing ellipsis, so the line is a
                # character prefix of the recorded list rather than a set equal to it.
                ok = joined.startswith(listed[:-1]) if listed.endswith('…') else listed == joined
                if not ok:
                    report['source_line_mismatch'].append(
                        f'{name}: SOURCE.md INCOMPLETE list differs from INDEX.json missing_files')
            if not router_flags.get(name):
                report['index_desync'].append(f'{name}: incomplete in INDEX.json but not in the canonical router index')
        else:
            source = folder / 'SOURCE.md'
            if source.is_file() and INCOMPLETE_LINE.search(source.read_text(encoding='utf-8', errors='replace')):
                report['source_line_mismatch'].append(f'{name}: SOURCE.md has an INCOMPLETE: line but INDEX.json does not flag it')
            if router_flags.get(name):
                report['index_desync'].append(f'{name}: incomplete in the canonical router index but not in INDEX.json')

    counts = router.get('counts', {})
    if counts.get('incomplete_skills') != report['flagged_incomplete']:
        report['index_desync'].append(
            f"canonical counts.incomplete_skills is {counts.get('incomplete_skills')} "
            f"but INDEX.json flags {report['flagged_incomplete']}")
    if counts.get('routable_skills') != len(router['skills']) - report['flagged_incomplete']:
        report['index_desync'].append(
            f"canonical counts.routable_skills is {counts.get('routable_skills')}, expected "
            f"{len(router['skills']) - report['flagged_incomplete']}")

    for key in PROBLEM_KEYS:
        report[key] = sorted(report[key])
    return report


PROBLEM_KEYS = ('unflagged', 'stale_justification', 'stale_flag', 'unrecorded_dead_link',
                'index_desync', 'source_line_mismatch', 'unclosed_fence')


def render(report: dict, *, verbose: bool = False) -> str:
    lines = [
        'skill link audit — library/github-skills',
        '',
        f"skills scanned      : {report['skills_scanned']:,}",
        f"relative links seen : {report['links']:,}",
        f"  resolved          : {report['resolved']:,}",
        f"  external          : {report['external']:,}",
        f"  placeholder       : {report['placeholder']:,}  (template or non-path target)",
        f"  upstream          : {report['upstream']:,}  (escapes the flat portable layout)",
        f"  code sample       : {report['code_sample']:,}  (inside a properly closed fenced block)",
        f"  justified         : {report['justified']:,}  (hand-reviewed sibling pointers)",
        f"  missing companions: {report['missing']:,} links / {report['missing_files']:,} distinct files",
        f"skills flagged incomplete: {report['flagged_incomplete']:,}",
        '',
        f"unflagged: {report['unflagged']}",
    ]
    for key in PROBLEM_KEYS[1:]:
        lines.append(f'{key}: {len(report[key])}')
    if verbose:
        lines += ['', 'reviewed justifications:']
        lines += [f'  {skill} -> {target} (line {pinned}, {kind}): {reason}'
                  for (skill, target), (pinned, kind, reason) in sorted(JUSTIFIED.items())]
        if report['details']:
            lines += ['', 'skills with a missing companion:']
            lines += [f"  {name}: {', '.join(sorted(detail['dead']))}"
                      f"{'' if detail['flagged'] else '   <-- UNFLAGGED'}"
                      for name, detail in sorted(report['details'].items())]
    for key in PROBLEM_KEYS:
        for finding in report[key]:
            lines.append(f'FINDING [{key}] {finding}')
    lines.append('')
    lines.append('A missing companion is fixed by the owner: supply the file from its origin, or flag the skill.')
    lines.append('This script never downloads, rewrites or deletes anything.')
    return '\n'.join(lines) + '\n'


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--json', action='store_true', help='print the report as JSON')
    parser.add_argument('--check', action='store_true', help='print only the acceptance line and exit non-zero on findings')
    parser.add_argument('--verbose', action='store_true', help='list every reviewed justification and flagged skill')
    options = parser.parse_args(argv)

    try:
        report = audit()
    except (OSError, json.JSONDecodeError) as error:
        print(f'skill link audit could not read its inputs: {error}', file=sys.stderr)
        return 2

    problems = sum(len(report[key]) for key in PROBLEM_KEYS)
    if options.json:
        payload = {key: value for key, value in report.items() if key != 'details'}
        if options.verbose:
            payload['details'] = report['details']
        print(json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True))
    elif options.check:
        print(f"unflagged: {report['unflagged']} · findings: {problems}")
    else:
        print(render(report, verbose=options.verbose), end='')
    return 1 if problems else 0


if __name__ == '__main__':
    raise SystemExit(main())
