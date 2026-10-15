# Professional Guide — viking-team

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
Static HTML + motion (Remotion)

## Quality gates
- Test: `node --check (viking-team) + motion tests`
- Check: `node --check --input-type=module`

## Performance improvements applied
- Preview assets; sw.js caching

## Debugging playbook
- Check vercel.json, sw.js
- motion/PROGRESS.md

## Suggested next steps
- Optimize image assets
- Add cache headers

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
