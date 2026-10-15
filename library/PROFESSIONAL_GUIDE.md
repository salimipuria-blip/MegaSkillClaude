# Professional Guide — library

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
Shell + skills

## Quality gates
- Test: `tests/test_skill_library_sync.py`
- Check: `bash library/install.sh`

## Performance improvements applied
- Skill sync from github-skills

## Debugging playbook
- Check library/README.md

## Suggested next steps
- Verify sync idempotency

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
