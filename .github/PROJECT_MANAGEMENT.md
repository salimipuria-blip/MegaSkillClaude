# Project management

## Working agreement

- Use the bug, feature, or scoped-task issue template; record project directory,
  owner, acceptance criteria, dependencies, and security/cost impact.
- Suggested board: Backlog → Ready → In progress → Review → Done. This document
  does not create a GitHub Project, labels, repository rules, or deployments.
- Keep one scoped PR per branch. Do not combine the ordered normalization,
  router, index/telemetry, deployment-security, and application-hardening changes.
- In branch-constrained agent sessions, use the assigned branch for one PR only.
  Later PRs need separate sessions/branches after approval.
- Link the issue and provide test evidence and rollback notes in each PR.
- Passing CI is necessary, not authorization to merge. Stop after each PR and
  wait for explicit owner approval; never auto-merge.
- CODEOWNERS requests reviews; the owner must enable required code-owner reviews
  and status checks in repository rules separately if enforcement is desired.

## Local verification and environment

Copy `.env.example` to a local `.env` only if needed; set actual credentials in
CI/deployment secrets. The health check does not load `.env`. Subprojects may
have their own examples and additional settings.

Run `bash scripts/repo_health_check.sh` from the repository root, or invoke its
absolute path from any directory. It requires Git, Node 22, npm, and Python 3;
no package installation, network access, lifecycle hooks, or production secrets
are needed. Missing tools/files and failed checks return nonzero. It checks
tracked dotenv filenames, not credential contents: **it is not a secret scan**.
The unsafe generic keyword/line dump has deliberately been removed.

Full verification remains in `.github/workflows/ci.yml`:

| Project | Tests / build (inside its directory) |
| --- | --- |
| psk | `npm run check && npm test` (no dependencies) |
| lithos | `npm install --no-package-lock --ignore-scripts --no-audit --no-fund`, then `node --check api/buffer-sync.js && npm test && npm run build` |
| fjcod | `npm ci --no-audit --no-fund`, then `npm run check` |
| bison-brand-book | `npm ci --no-audit --no-fund`, then `npm run build` |
| viking-team | `node --test tests/*.test.mjs` and `python3 -m unittest discover -s tests -v` |
| orchestrator | Repository audit, pytest, gateway Node/Deno tests and Deno deployability checks as listed in CI |
| hermes | `npm ci --ignore-scripts --no-audit --no-fund`, then `bash -n setup.sh`, `shellcheck -S warning setup.sh`, `npm run check`, `npm test`, `npm run test:integration`, `node build-skills.mjs` |
| root router | `python3 scripts/sync_skill_library.py --check` and `python3 -m unittest discover -s tests -p 'test_*.py' -v` |

Hermes commands above run **inside `hermes/`**; from the root use `--prefix hermes`
for npm, and `hermes/setup.sh` for shell checks. Never combine both path prefixes.
Hermes installation must use `--ignore-scripts`: its postinstall also syncs
secrets. Build assets explicitly without executing that lifecycle hook.

The PSK guard reads `ENGINE_TOKEN` only through step-scoped `env`, only on pushes
to `main`. PRs (including forks and Dependabot) run tests without production
secrets. No token value is interpolated into shell source, logged, or passed to
subsequent tests.

Dependabot checks all five application npm manifests plus GitHub Actions weekly.
There is no root npm or orchestrator pip manifest; add those entries only when
real supported manifests exist. Vendored skill examples are not app dependencies.

## Release

Use [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Keep the current project status
in [../ROADMAP.md](../ROADMAP.md) and proposed sequencing in
[../docs/ROADMAP_90D.md](../docs/ROADMAP_90D.md). Never put real secrets in issues,
PR descriptions, or test logs.
