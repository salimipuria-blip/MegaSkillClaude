# Changelog — mega-skills-router

Notable changes to **this plugin** (`plugins/mega-skills-router`, published as
`mega-skills-router@psk`) are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version obeys
[semantic versioning](https://semver.org/spec/v2.0.0.html), applied to what a consumer of the plugin
can observe:

| bump | meaning for this plugin |
|---|---|
| **MAJOR** | breaks a consumer: a removed or renamed `route.py` flag, a removed key in the JSON result, a change to the skill `name` namespace, or a new shape for `references/triggers.json` |
| **MINOR** | new capability that keeps every existing query and flag working: new flags, new fallbacks, more indexed skills, new generated references |
| **PATCH** | no contract changes: ranking corrections, regenerated portable copies, documentation |

The version lives in three places that must agree, and `tests/test_plugin_versioning.py` fails when
they do not:

1. `.claude-plugin/plugin.json` → `version`
2. the repository-root `.claude-plugin/marketplace.json` → `plugins[].version` for `mega-skills-router`
3. the newest `## [x.y.z]` heading in this file

**On the older history.** This repository has no git tags, and the clone this changelog was written
from could not see any commit history for `plugin.json` before `79f22db5` (2026-10-20). Releases
before 1.2.0 are therefore *not* reconstructed here — inventing entries would be worse than naming
the gap. Each release below cites the document that evidences it.

## [1.5.0] - 2026-10-23

Every indexed skill is now complete and routable, and the routing workflow is rewritten to spend the
fewest tokens.

### Removed

- The 65 GitHub skills that stayed `incomplete` in 1.4.0 (they referenced files published nowhere)
  are deleted from `library/github-skills/INDEX.json`, `references/triggers.json`, their canonical
  folders and the portable copy. Index: **5,964 skills, 5,964 routable, 0 incomplete, 29,878
  triggers**, 2,946 GitHub skills from 28 repositories. Two license notices whose repository left the
  index were removed with them (`_licenses/` now holds 70); `polis-protocol` was one of those repositories.
- The orphan `references/skills/_licenses/` copy left by PR #45.

### Changed

- `SKILL.md` (both copies) is a token-lean workflow: skip routing for trivial requests, query with
  2–6 intent terms and `--limit 5 --json-lines --fields name,domain,score,path`, read the top result
  and at most two more that score ≥ 0.8 of it, and read large skills by heading. The description
  loaded into every session is shorter.
- `scripts/sync_skill_library.py` prunes the folder of a skill that left the index and notice or
  domain files it no longer writes; `--check` reports them as drift.
- The claude.ai build (`scripts/build_claudeai_skill.py`) uses the same token-lean steps.

## [1.4.0] - 2026-10-23

The index keeps its shape and all 6,029 skills; what changes is how many of them route by default.

### Changed

- Routable skills **5,745 → 5,964** and incomplete **284 → 65**. 219 flagged GitHub skills were
  repaired at the source (`library/github-skills/`): the `SKILL.md` was refreshed to the latest
  upstream version where it had moved on, missing companions were copied from the upstream
  repository (including shared folders such as `shared-references/`) or, when that repository no
  longer had them, from the skill's own original repository, with its license added to
  `_licenses/` (now 72 notices). The three skills flagged by the 1.3.0 link audit
  (`git-guardrails-claude-code`, `qdrant-search-quality`, `wizard`) are among the repaired ones.
- The 65 that stay `incomplete` point at files that exist nowhere public (another project's training
  scripts, files the user supplies, files never published). `polis-protocol` is held back on purpose:
  its missing `scripts/demo.sh` advertises a `curl | bash` installer from a different GitHub owner.

### Added

- A dated `Restored 2026-10-23` line in every repaired skill's `SOURCE.md`, naming where its files
  came from and the license notice that covers them.

Evidence: `library/github-skills/README.md` "Incomplete skills (65)" and "Companion-source notices",
`scripts/check_skill_links.py --check` ⇒ `unflagged: [] · findings: 0`, root `PROGRESS.md`
۲۰۲۶-۱۰-۲۳.

## [1.3.0] - 2026-10-22

Covers everything that landed after 1.2.0, including the 2026-10-18 work that shipped without a
version bump.

### Added

- `--explain`: the JSON result can carry `query_tokens`, the IDF weight of every token,
  matched/unmatched tokens, trigger tokens, coverage, phrase match and name hits. The default output
  shape is unchanged, so existing consumers see no difference.
- `--json-lines` (one compact object per line) and `--fields` (a subset of the 8 validated result
  fields) for cheap consumption by hermes; an unknown field is a usage error listing the valid ones.
- A measured Persian↔English synonym map (27 entries) inside `route.py` with one automatic retry when
  a query matches nothing at any threshold. Retried answers are tagged `"fallback": "synonym"`, and an
  explicit `--min-score` is honoured rather than undercut. 15 Persian requests that returned `[]`
  before now return a relevant skill.
- `scripts/scan_third_party_skills.py` + `library/SECURITY_SCAN.md`: 10 prompt-injection and
  remote-code patterns scanned over the 3,011 imported instruction files (166 findings, report-only,
  nothing deleted), with `--check` as a lockfile gate in the `router` CI job.
- `scripts/check_skill_links.py`: audits every relative link in the imported skills and prints the
  acceptance line `unflagged: []`.
- `tests/test_skill_router_sync.py`: both copies of `route.py` and `SKILL.md`, both indexes, the 15
  domain files, the 46 license notices and a 40-skill sample of the portable instructions are now
  compared, where previously only the tail of `route.py` was.
- This changelog and `tests/test_plugin_versioning.py`.

### Changed

- Routable skills **5,748 → 5,745** and incomplete **281 → 284**: the link audit found three skills
  whose `SKILL.md` promises a file inside its own folder that was never copied
  (`git-guardrails-claude-code`, `qdrant-search-quality`, `wizard`). They are flagged `incomplete`,
  so they stay opt-in through `--include-incomplete` instead of dead-ending an agent.
- The portable copies of those three skills' `SOURCE.md` carry the `INCOMPLETE:` line, and both
  `SKILL.md` descriptions state the new counts.
- Index caching is keyed on mtime and size in process memory, which took the CLI from 2.2 s to
  0.75 s per call with the fallback path (measured 2026-10-18).

### Fixed

- Persian tech-stack requests routed to unrelated skills (`تست واحد` → a financial model,
  `ربات تلگرام` → a channel export, `برنامه‌نویسی پایتون` → openpyxl); tool and stack aliases plus
  multi-word phrase aliases were added to both `route.py` copies (2026-10-18).

Evidence: pull request #98 (`935da365`, `4ccf6799`, `80084df3`, `fc45cc67` and the commit that adds
this file), root `PROGRESS.md` §۱۰ and §۱۱, `plugins/mega-skills-router/PROGRESS.md` entries of
۲۰۲۶-۱۰-۱۸, and `library/PROFESSIONAL_GUIDE.md` 2026-10-22.

## [1.2.0] - 2026-10-17

### Added

- IDF weighting, skill-name priority, everyday aliases (سئو، لوگو، کپشن، ریلز، دیباگ …) and an
  automatic fallback threshold of 0.25.
- The 10 deep `pro-*` skills in `library/skills/` (code review, debugging, testing, frontend,
  backend/API, security, UI design system, UX, brand identity, git), which hermes coding mode reads
  by name from `names.json`.

### Fixed

- Three router matching bugs: substring matching that let «ai» match `maintain`, multi-word and
  half-space (ZWNJ) aliases, and unbounded output.

Counts recorded at the time: 6,029 skills / 5,748 routable / 281 incomplete / 30,203 triggers; 70
root tests green.

Evidence: `plugins/mega-skills-router/PROGRESS.md`, entry «۲۰۲۶-۱۰-۱۷ (مسیریاب 1.2.0 و بستهٔ Pro)».
The date is the one that document records; there is no tag to confirm it.
