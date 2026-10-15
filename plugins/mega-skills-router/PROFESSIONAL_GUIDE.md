# Professional Guide — plugins/mega-skills-router

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
Python + JS

## Quality gates
- Test: `tests/test_mega_skills_router.py`
- Check: `python tests/test_mega_skills_router.py`

## Performance improvements applied
- Sharded inverted index (512 shards)

## Debugging playbook
- Check router build output

## Suggested next steps
- Benchmark routing latency

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
