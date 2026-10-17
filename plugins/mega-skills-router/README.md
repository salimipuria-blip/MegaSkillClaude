# Mega Skills Router — Claude Code plugin

One skill that routes each request to the relevant skills among **6,029** (3,000 core skills, 18 curated project skills and 3,011 MIT-licensed GitHub skills), using 15 domain indexes and 30,203 Persian / Finglish / English triggers. Only the matched skills are read, so Claude's context stays small.

## Install
In Claude Code:

```
/plugin marketplace add salimipuria-blip/MegaSkillClaude
/plugin install mega-skills-router@psk
```

Then start a new session and ask normally; the router picks the skills.

## Contents
- `skills/mega-skills-router/SKILL.md` – routing procedure
- `skills/mega-skills-router/scripts/route.py` – matcher (Python 3, no dependencies)
- `skills/mega-skills-router/references/triggers.json` – index of all skills
- `skills/mega-skills-router/references/domains/` – per-domain skill lists
- `skills/mega-skills-router/references/skills/<name>/INSTRUCTIONS.md` – the skills (GitHub skills keep their `scripts/`, `references/`, `SOURCE.md`)

GitHub skills are third-party: review a skill before running any script it ships.


## Generated library and incomplete workflows

Of 6,029 packaged skills, 5,748 are routable by default; the 281 canonical `incomplete` entries
remain available for provenance/manual review but are not selected automatically. Python's
`--include-incomplete` is an explicit review opt-in. Upstream license texts ship under
`references/licenses/`.

Do not edit the portable `references/` copies independently. From the monorepo root run
`python3 scripts/sync_skill_library.py`; `--check` is the read-only CI drift gate. Canonical bodies
and companions live in `psk/data/` and `library/`. This keeps the plugin installable outside the
monorepo without letting thousands of duplicated files become a second source of truth.
