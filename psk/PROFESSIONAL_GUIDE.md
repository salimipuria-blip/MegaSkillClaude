# Professional Guide — psk

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
Node.js (ESM) + routing engine

## Quality gates
- Test: `npm test (53) + npm run check`
- Check: `npm run check`

## Performance improvements applied
- Routing golden tests guard latency regressions
- bench:routing for throughput

## Debugging playbook
- npm run dev for local shim
- routing:accuracy for precision/recall
- Check engine/router.mjs and engine/providers.mjs

## Suggested next steps
- Add AbortSignal to provider fetches
- Cache skill index in memory

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
