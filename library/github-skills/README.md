# GitHub Skills (2,946 indexed)

The current canonical `INDEX.json` contains 2,946 MIT-licensed skills from 28 public GitHub repositories (unique `repo` values in `INDEX.json`; `_licenses/` keeps 45 license files for those repositories plus 25 for companion sources); 0 entries are marked incomplete (284 before the 2026-10-23 repair: 219 were repaired and the 65 that could not be were removed). The earlier 2,980 count below is the **2026-10-04 collection snapshot**, not the live repository total. Treat `INDEX.json` as the count source of truth; this page must be updated whenever the indexed corpus changes.

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

In the 2026-10-04 collection snapshot, remaining skills were deduplicated by name (highest score kept) and ranked by `log10(repo stars)` plus description and content quality. The top 3,000 were taken (all MIT-licensed); companion files were then fetched and scanned with the same patterns, and 20 skills whose companions matched were dropped, leaving 2,980 at that time. The current index contains 2,946; use its rows and metadata for today's totals rather than applying the historical selection arithmetic.

## Files
- `<name>/SKILL.md`: the skill as published upstream.
- `<name>/SOURCE.md`: source URL, repository and license.
- Companion files (`scripts/`, `references/`, assets) from each upstream skill folder are included so skills work as published; files over 1 MB and nested sub-skills are excluded.
- `_licenses/`: the license text of every source repository (see "License notices" below).
- `INDEX.json`: name, repository, path, license, score, description and URL for every skill.

## Naming: the folder name is canonical

The router looks skills up by **folder name**, which equals `INDEX.json` `name` and the router index
`name`. All 5,964 index names are unique and `colliding_triggers` is `0`.

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

## License notices (45 files for 28 repositories)

Every one of the 28 repositories in `INDEX.json` has its license text in `_licenses/`; nothing is
imported without one. There are more files than repositories because five of them ship additional
path-scoped `LICENSE` files inside the folders that were imported:

| repository | license files |
|---|---|
| `sickn33/agentic-awesome-skills` | 11 |
| `github/awesome-copilot` | 4 |
| `alirezarezvani/claude-skills` | 3 |
| `K-Dense-AI/scientific-agent-skills` | 2 |
| `affaan-m/ECC` | 2 |
| the other 23 repositories | 1 each |

44 of the 45 are referenced by at least one imported skill's `SOURCE.md`. The one that is not:

- `sickn33__agentic-awesome-skills__skills_remote-gpu-trainer_LICENSE` — the path-scoped notice of
  `skills/remote-gpu-trainer`, a folder whose skill did not survive the selection filter.

It is **kept on purpose**. A license text is the record of the terms a folder was collected under,
deleting a tracked file is the owner's decision rather than a cleanup side effect, and
`scripts/sync_skill_library.py` copies all 70 notices byte for byte into the portable plugin
(guarded by `tests/test_skill_router_sync.py`). `tests/test_github_skill_provenance.py` pins the
unreferenced set to exactly this one file, so a second leftover notice cannot accumulate silently.

### Companion-source notices (25 files, added 2026-10-23)

When the 284 incomplete skills were repaired, some promised files no longer existed in the indexed
repository but did exist in the skill's *own original* repository (named by a URL in the skill
itself). Those files were copied together with that repository's license, and the skill's
`SOURCE.md` cites the notice by name. All are MIT, MIT-0 or Apache-2.0:

- `AgriciDaniel__claude-seo__LICENSE`
- `Suraj1235__open-dynamic-workflows__LICENSE`
- `amElnagdy__review-skills__LICENSE`
- `beatra-ai__ai-image-generator-skill__LICENSE`
- `beatra-ai__ai-logo-maker-skill__LICENSE`
- `beatra-ai__ai-media-generator-skill__LICENSE`
- `beatra-ai__ai-music-generator-skill__LICENSE`
- `beatra-ai__ai-podcast-voiceover-skill__LICENSE`
- `beatra-ai__ai-poster-maker-skill__LICENSE`
- `beatra-ai__ai-product-photography-skill__LICENSE`
- `beatra-ai__ai-voice-cloning-skill__LICENSE`
- `beatra-ai__ai-voiceover-generator-skill__LICENSE`
- `beatra-ai__beatra-skills__LICENSE`
- `beatra-ai__ecommerce-product-images-skill__LICENSE`
- `beatra-ai__lyrics-to-song-skill__LICENSE`
- `beatra-ai__multilingual-voiceover-skill__LICENSE`
- `beatra-ai__photo-to-anime-skill__LICENSE`
- `beatra-ai__talking-avatar-video-skill__LICENSE`
- `beatra-ai__viral-video-remake-skill__LICENSE`
- `hyhmrright__logic-lens__LICENSE`
- `microsoft__skills__LICENSE`
- `takeaseatventure__sql-sentinel__LICENSE`
- `vercel-labs__agent-browser__LICENSE`
- `zhaoxuya520__reverse-skill__LICENSE`
- `zxkane__aws-skills__LICENSE`

## Incomplete skills (0)
Policy since 2026-10-23: a skill is **repaired or removed, never shipped hidden**. Of the 284 that were flagged, 219 were repaired (their `SKILL.md` refreshed to the latest upstream version, missing companions copied from the upstream repository, including shared folders such as `shared-references/`, or from the skill's own original repository; each `SOURCE.md` has a dated `Restored` line). The other 65 pointed at files that exist nowhere public (another project's training scripts, files the user supplies, files never published), so the owner had them removed from `INDEX.json`, the router index and the plugin copy. `polis-protocol` was among them on purpose: its missing `scripts/demo.sh` advertises a `curl | bash` installer from a different GitHub owner.

A future import that promises a file it cannot ship is flagged by `scripts/check_skill_links.py`; repair it from the source or leave it out. `--include-incomplete` stays in `route.py` only as an explicit review opt-in.

## Portable copies

`library/` and `psk/data/` are canonical. Run `python3 scripts/sync_skill_library.py` to regenerate
portable plugin instructions, companions, domain indexes and upstream license notices. CI runs
`--check` to detect byte drift. The self-contained copies are intentional; never edit them as a
second source of truth. No imported script is executed by this generator.
