# GitHub Skills (3,011 indexed)

The current canonical `INDEX.json` contains 3,011 MIT-licensed skills from 29 public GitHub repositories (unique `repo` values in `INDEX.json`; `_licenses/` keeps 46 license files from the wider collection); 281 entries are marked incomplete and excluded from default routing. The earlier 2,980 count below is the **2026-10-04 collection snapshot**, not the live repository total. Treat `INDEX.json` as the count source of truth; this page must be updated whenever the indexed corpus changes.

**Available through the Mega Skills Router.** `.claude/skills/mega-skills-router` indexes every skill here; Claude reads a skill only when the router matches it to a request. To make one skill always loaded instead, copy its folder into `.claude/skills/`.

## How they were selected
From 10,859 `SKILL.md` files (4,192 unique names after filtering):

| Filter | Removed |
|---|---|
| No permissive license (only MIT, Apache-2.0, BSD, ISC, CC-BY-4.0, CC0, Unlicense kept) | 1,276 |
| Invalid frontmatter (`name` / `description`) | 827 |
| Suspicious patterns (pipe-to-shell, `rm -rf /`, "ignore previous instructions", key material, …) | 304 |
| Same name as one of the project's own 3,006 skills | 71 |
| Too short or too long | 52 |

In the 2026-10-04 collection snapshot, remaining skills were deduplicated by name (highest score kept) and ranked by `log10(repo stars)` plus description and content quality. The top 3,000 were taken (all MIT-licensed); companion files were then fetched and scanned with the same patterns, and 20 skills whose companions matched were dropped, leaving 2,980 at that time. The current index contains 3,011; use its rows and metadata for today's totals rather than applying the historical selection arithmetic.

## Files
- `<name>/SKILL.md`: the skill as published upstream.
- `<name>/SOURCE.md`: source URL, repository and license.
- Companion files (`scripts/`, `references/`, assets) from each upstream skill folder are included so skills work as published; files over 1 MB and nested sub-skills are excluded.
- `_licenses/`: the license text of every source repository.
- `INDEX.json`: name, repository, path, license, score, description and URL for every skill.

## Incomplete skills (281)
These reference files that are not in their folder (usually shared scripts at the upstream repo root, or files missing upstream). They are retained for provenance but excluded from default Python and Hermes routing. Each is marked `"incomplete": true` in `INDEX.json` and has an `INCOMPLETE:` line in its `SOURCE.md`. The generator propagates this flag into both router indexes; `--include-incomplete` is an explicit Python-only opt-in for manual review, not a claim that missing files work. After verifying a repaired skill, update the canonical flag and run `python3 scripts/sync_skill_library.py`.

The automated filter does not replace a human review: read a skill before activating it.


## Portable copies

`library/` and `psk/data/` are canonical. Run `python3 scripts/sync_skill_library.py` to regenerate
portable plugin instructions, companions, domain indexes and upstream license notices. CI runs
`--check` to detect byte drift. The self-contained copies are intentional; never edit them as a
second source of truth. No imported script is executed by this generator.
