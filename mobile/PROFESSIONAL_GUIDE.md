# Professional Guide — mobile

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
Vanilla JS PWA

## Quality gates
- Test: `node --test *.test.mjs (10)`
- Check: `node --check app.js search.mjs sw.js`

## Performance improvements applied
- Service worker caching; skills-index.json size

## Debugging playbook
- Check sw.js cache version
- search.test.mjs

## Suggested next steps
- Compress skills-index.json
- Add offline fallback

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
