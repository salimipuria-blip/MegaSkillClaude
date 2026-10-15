# Professional Guide — fjcod

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
TypeScript + Vite + Supabase

## Quality gates
- Test: `npm test (41 vitest) + npm run typecheck + npm run check`
- Check: `npm run check + npm run typecheck`

## Performance improvements applied
- Throttle auth (5 wrong passwords)
- in-memory storage fallback

## Debugging playbook
- vitest run for unit tests
- Check supabase/ migrations
- vercel.json

## Suggested next steps
- Add fetch timeouts to Supabase client calls
- Profile store flows

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
