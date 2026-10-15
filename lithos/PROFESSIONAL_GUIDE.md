# Professional Guide — lithos

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
Node.js + Vite

## Quality gates
- Test: `npm test (9)`
- Check: `node --check api/buffer-sync.js`

## Performance improvements applied
- Buffer sync endpoint; keep payload small

## Debugging playbook
- Check api/buffer-sync.js
- vercel.json routes

## Suggested next steps
- Add request timeout to buffer sync

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
