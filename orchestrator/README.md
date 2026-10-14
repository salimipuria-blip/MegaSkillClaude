# MEGA SKILLS 3000 | ۳۰۰۰ مگا اسکیل

One canonical project. This private repository currently holds earlier Supabase orchestration sources and deployment/audit templates. Historical names ALGORITHME, Hermes, POORS and APEX are module and reference provenance—not additional products or proof of live integration.

**[Open the central workspace index / فهرست مرکزی تمام پروژه‌ها](docs/WORKSPACE_INDEX.md)** — inventory of accessible GitHub repositories, deployment visibility, cleanup history, and links to the iPhone-first migration branch.

See [the unified project register](docs/MEGA_SKILLS_3000_UNIFICATION.md) for exactly what is implemented, what remains pending, and the laptop migration safety gates.

## Source of truth

- This GitHub repository owns reviewed deployable source, SQL migrations, tests, benchmarks and deployment configuration templates.
- A recovered, tested Vercel V3 website/routing baseline has been separately saved as `MEGA_SKILLS_3000_UNIFIED_BASELINE_V1.zip` in the user's ChatGPT Library. It has **not** yet been committed to or deployed from this repository.
- The existing Supabase snapshot is historical; the full 3,000 SKILL.md bodies are not yet confirmed installed in a live cloud environment. Do not represent the system as a fully autonomous agent.
- Secrets remain in authorized platform secret storage and must never be committed to Git. Track imported skill sources with integrity hashes; do not source-control generated ZIPs or third-party code before licensing review.
- Spending policy: zero-dollar budget, no automatic paid-provider fallback. Free tiers remain subject to provider quotas and terms.

## Safety

Run `python scripts/audit/check_repository_contract.py` before committing changes. Keep laptop originals until complete SHA-256 checked backups, source reconciliation, and an iPhone-only live test succeed.


## GitHub admin gateway — owner-only

`verify_jwt = true` is necessary but not sufficient: public anon JWTs are not administrator
identities. The handler resolves the bearer session using Supabase Auth and checks its returned
user UUID against `GITHUB_ADMIN_USER_IDS` (comma-separated). Set that allowlist plus
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GITHUB_ADMIN_TOKEN` in the server's environment, not Git.
An absent/malformed allowlist fails closed with 503; non-owners get 403 and anon/invalid sessions
get 401. Client-supplied metadata/roles never grant access. The live function must be redeployed
before these source changes protect it.

Regression tests (mocked Auth/GitHub, no external writes):
`node --test supabase/functions/github-admin-gateway/*.test.mjs`.

## Complete test discovery and historical artifacts

Run `python -m pytest -q -ra tests`. Three installation checks need the external artifacts listed
in `skills/registry/BASELINE_ARTIFACTS.json`; a completely unmaterialized checkout reports them
as explicit skips. Partial or damaged installs are **not** skipped. After materialization, use
`python -m pytest -q --require-materialized-skills tests` as the mandatory strict gate. Skips
are not evidence of a completed skill installation.

Security controls and release gates: [SECURITY_NOTES.md](docs/SECURITY_NOTES.md).

Monorepo hardening/rollout notes: [REPO_HARDENING.md](../docs/REPO_HARDENING.md).
