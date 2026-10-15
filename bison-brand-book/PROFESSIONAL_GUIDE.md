# Professional Guide — bison-brand-book

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
Vite + React

## Quality gates
- Test: `npm test (8)`
- Check: `npm run build`

## Performance improvements applied
- Vite build; check bundle size

## Debugging playbook
- npm run dev / preview
- Check src/ and design-system/

## Suggested next steps
- Lazy-load heavy components

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
