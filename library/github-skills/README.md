# GitHub Skills (3,011 indexed)

The current canonical `INDEX.json` contains 3,011 MIT-licensed skills from 29 public GitHub repositories (unique `repo` values in `INDEX.json`; `_licenses/` keeps 46 license files from the wider collection); 284 entries are marked incomplete and excluded from default routing. The earlier 2,980 count below is the **2026-10-04 collection snapshot**, not the live repository total. Treat `INDEX.json` as the count source of truth; this page must be updated whenever the indexed corpus changes.

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
- `_licenses/`: the license text of every source repository (see "License notices" below).
- `INDEX.json`: name, repository, path, license, score, description and URL for every skill.

## Naming: the folder name is canonical

The router looks skills up by **folder name**, which equals `INDEX.json` `name` and the router index
`name`. All 6,029 index names are unique and `colliding_triggers` is `0`.

The upstream frontmatter `name:` is kept **verbatim** and is never used for lookup: an imported
`SKILL.md` must stay byte-identical to its origin so provenance and license review remain possible.
Exactly 10 skills therefore have a frontmatter name that differs from their folder name — all of
them from `mattpocock/skills`, all of them prefixed `mp-`:

| folder (canonical) | upstream frontmatter `name:` | that name is already indexed from |
|---|---|---|
| `mp-code-review` | `code-review` | `phuryn/pm-skills` |
| `mp-codebase-design` | `codebase-design` | `sickn33/agentic-awesome-skills` |
| `mp-diagnosing-bugs` | `diagnosing-bugs` | `sickn33/agentic-awesome-skills` |
| `mp-domain-modeling` | `domain-modeling` | `sickn33/agentic-awesome-skills` |
| `mp-grill-with-docs` | `grill-with-docs` | `alirezarezvani/claude-skills` |
| `mp-improve-codebase-architecture` | `improve-codebase-architecture` | `sickn33/agentic-awesome-skills` |
| `mp-research` | `research` | `alirezarezvani/claude-skills` |
| `mp-setup-matt-pocock-skills` | `setup-matt-pocock-skills` | `sickn33/agentic-awesome-skills` |
| `mp-teach` | `teach` | `sickn33/agentic-awesome-skills` |
| `mp-triage` | `triage` | `sickn33/agentic-awesome-skills` |

The prefix is not decorative: without it two different skills from two different repositories would
claim the same router name. **Rule for future imports** — when an imported skill's upstream name is
already taken in `INDEX.json`, prefix the *folder* with the pack's short name (`mp-` here) and leave
the frontmatter untouched; never rename inside an imported file, and never resolve a collision by
dropping the older skill. `tests/test_github_skill_provenance.py` fails if a new divergence appears
or if an `mp-` prefix stops being necessary.

## License notices (46 files for 29 repositories)

Every one of the 29 repositories in `INDEX.json` has its license text in `_licenses/`; nothing is
imported without one. There are more files than repositories because five of them ship additional
path-scoped `LICENSE` files inside the folders that were imported:

| repository | license files |
|---|---|
| `sickn33/agentic-awesome-skills` | 11 |
| `github/awesome-copilot` | 4 |
| `alirezarezvani/claude-skills` | 3 |
| `K-Dense-AI/scientific-agent-skills` | 2 |
| `affaan-m/ECC` | 2 |
| the other 24 repositories | 1 each |

45 of the 46 are referenced by at least one imported skill's `SOURCE.md`. The one that is not:

- `sickn33__agentic-awesome-skills__skills_remote-gpu-trainer_LICENSE` — the path-scoped notice of
  `skills/remote-gpu-trainer`, a folder whose skill did not survive the selection filter.

It is **kept on purpose**. A license text is the record of the terms a folder was collected under,
deleting a tracked file is the owner's decision rather than a cleanup side effect, and
`scripts/sync_skill_library.py` copies all 46 notices byte for byte into the portable plugin
(guarded by `tests/test_skill_router_sync.py`). `tests/test_github_skill_provenance.py` pins the
unreferenced set to exactly this one file, so a second leftover notice cannot accumulate silently.

## Incomplete skills (284)
These reference files that are not in their folder (usually shared scripts at the upstream repo root, or files missing upstream). They are retained for provenance but excluded from default Python and Hermes routing. Each is marked `"incomplete": true` in `INDEX.json` and has an `INCOMPLETE:` line in its `SOURCE.md`. The generator propagates this flag into both router indexes; `--include-incomplete` is an explicit Python-only opt-in for manual review, not a claim that missing files work. After verifying a repaired skill, update the canonical flag and run `python3 scripts/sync_skill_library.py`.

The automated filter does not replace a human review: read a skill before activating it.


## Portable copies

`library/` and `psk/data/` are canonical. Run `python3 scripts/sync_skill_library.py` to regenerate
portable plugin instructions, companions, domain indexes and upstream license notices. CI runs
`--check` to detect byte drift. The self-contained copies are intentional; never edit them as a
second source of truth. No imported script is executed by this generator.
