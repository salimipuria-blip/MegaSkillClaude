# 90-day roadmap (proposal)

Planning baseline: 2026-10-14. This is an ordered proposal, not authorization to
implement or merge later phases. Existing project status remains in
[../ROADMAP.md](../ROADMAP.md).

| Window | Ordered PR | Scope | Exit gate |
| --- | --- | --- | --- |
| Days 1–15 | 1 — Repository normalization | Environment example, valid Dependabot targets, ownership, release/issue/project docs, safe lightweight health check, main-only token guard | Regression tests, CI evidence, owner review; stop after opening PR |
| Days 16–30 | 2 — PSK routing | Investigate stop words/tokenization and add targeted regression coverage | Separate authorization, PR and passing tests |
| Days 31–45 | 3 — PSK index and telemetry | Evaluate index generation and privacy-safe routing telemetry | Separate authorization, benchmark and contract tests |
| Days 46–60 | 4 — Deployment/security operations | Secret scanning, deployment documentation and scheduled health checks | Separate authorization, scanner redaction and rollout review |
| Days 61–90 | 5 — Application hardening | CHAM RLS/auth plan, Hermes rate limits, orchestrator security notes | Separate authorization, threat review and migration/rollback tests |

No router, index, telemetry, deployment workflow, RLS, or rate-limit changes are
included in PR 1. Do not begin the next phase just because the previous CI passed.
Every PR needs explicit owner approval before merge; no automated merging.
