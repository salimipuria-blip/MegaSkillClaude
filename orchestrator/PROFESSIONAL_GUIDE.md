# Professional Guide — orchestrator

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
Python

## Quality gates
- Test: `pytest (16 + 3 skipped)`
- Check: `python scripts/audit/check_repository_contract.py`

## Performance improvements applied
- Skill sync pipeline; audit contract

## Debugging playbook
- pytest -q -ra tests
- Check supabase/ and skills/

## Suggested next steps
- Add retry/backoff to external calls
- Profile skill sync

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
