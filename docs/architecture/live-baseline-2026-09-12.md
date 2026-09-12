# PORYA OMNI — Live Baseline 2026-09-12

This document records the read-only production state observed during the V4 hardening recovery phase. No production deployment, skill activation, DDL, or data mutation was performed while capturing this baseline.

## Supabase

- project: `free-llm-router`
- ref: `aupkeramhsufnmhkbihl`
- region: `eu-central-1`
- status: `ACTIVE_HEALTHY`
- Postgres: 17
- active Edge Functions: `10`
- all recovered Edge Functions currently use `verify_jwt=true`

## Skill subsystem

- skills: `0`
- active skills: `0`
- active trigger phrases: `0`
- skill chunks: `0`
- skill assets: `0`
- task executions: `0`
- skill executions: `0`

Install run:

- install id: `mega-skills-3000-v1`
- bundle id: `mega-skills-router-plugin-3000-v1`
- status: `staging`
- expected skills: `3000`
- expected triggers: `15000`
- installed skills: `0`
- installed assets: `0`
- installed triggers: `0`
- repaired skills: `0`
- staged payload chunks: `1`
- staged payload characters: `20000`

Operational conclusion: the runtime has installer/router infrastructure, but the required 3000-skill preinstallation invariant is not yet satisfied.

## Provider discovery

- GitHub discovery rows: `47`
- enabled dynamic providers: `0`
- scheduled scanner job: `github-llm-source-scan-6h` at `17 */6 * * *`
- scheduled verifier job: `github-llm-verifier-6h` at `37 */6 * * *`

The scanner and verifier remain live. Provider discovery data is not treated as proof that an endpoint is safe or free; promotion hardening is a later phase.

## Database advisor findings

### Actionable performance findings

1. `private.dynamic_llm_providers(source_repo_id)` has a foreign key without a covering index. This is scheduled for the database-performance hardening phase rather than being changed during recovery.
2. `private.skill_chunks` currently has duplicate equivalent unique indexes for `(skill_id, chunk_index)`. One should be removed only after the canonical constraint/index is selected in a reviewed migration.

### Security / configuration findings

1. `pg_net` is installed in the `public` schema. The recovery phase records the warning but does not relocate the extension blindly because extension placement must remain compatible with Supabase-managed behavior.
2. Several tables in the non-exposed `private` schema have RLS enabled with no RLS policy. In this architecture that is informational: `private` is not an anonymous/public Data API surface and privileges are revoked from `public`, `anon`, and `authenticated`. Policies should only be added if a future access contract requires them.

Reference remediation documentation:
- Supabase database linter — unindexed foreign keys: `https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys`
- Supabase database linter — duplicate indexes: `https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index`
- Supabase database linter — extension in public: `https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public`
- Supabase database linter — RLS enabled/no policy: `https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy`

## Recovery constraints

- Secret values are excluded from Git and from the SQL baseline.
- Production rows are excluded from the SQL baseline.
- Cron command bodies that can reference Vault credentials are excluded; only scheduler metadata is recorded.
- The SQL snapshot is a recovery/reference artifact and is explicitly marked not to be applied back onto the existing production project.
- Live Edge Function source and deployed checksums are tracked separately in `supabase/FUNCTION_MANIFEST.json`.

## Final recovery verification

Fresh verification was performed after CI recovery:

- production behavior changed by this phase: `no`
- Edge Function deployments performed by this phase: `no`
- database migrations applied by this phase: `no`
- production install state re-read: `staging`, `0` installed skills, `0` installed triggers, `error=null`
- live skill table re-read: `0` skills, `0` trigger phrases
- all 10 live Edge Function deployed SHA-256 values match `supabase/FUNCTION_MANIFEST.json`
- repository guard: `pass`
- Python contracts: `13 passed`
- Deno deployability checks: `pass`
- successful GitHub Actions workflow run: `34672103835`
- checkpoint manifest: `SNAPSHOT_MANIFEST.json`

Known recovery-only limitation: `github-llm-verifier` is deployed as JavaScript-style TypeScript and does not pass Deno strict type checking without type annotations. Recovery preserves the deployed source byte-for-byte; CI therefore validates syntax/import/deployability on a temporary `@ts-nocheck` copy. Strict typing of that function is deferred to the hardening phase so recovery does not silently alter production behavior.

Next plan: resumable Mega Skills artifact generation, deterministic 3000-skill/15000-trigger installation, idempotency verification, and activation only after installer gates pass.
