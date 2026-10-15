# Professional Guide — brand/viking

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
Markdown + assets

## Quality gates
- Test: `brand/viking/tests/render.test.mjs + content.test.mjs`
- Check: `node --test brand/viking/tests/*.mjs`

## Performance improvements applied
- ART_DIRECTION.md drives prompts

## Debugging playbook
- Check brand/viking/PROGRESS.md

## Suggested next steps
- Add asset size checks

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
