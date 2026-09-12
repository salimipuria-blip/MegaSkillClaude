# PORYA OMNI LLM Orchestrator — V4 Hardening Design

Date: 2026-09-12
Status: Approved design, pending written-spec review
Branch: `audit/omni-v4-hardening`
Target runtime: Supabase project `free-llm-router`

## 1. Goal

Harden the existing Supabase-based orchestration system into a reproducible, observable, production-ready control plane that can preinstall and route all 3000 Mega Skills, choose the best verified zero-cost model per task, verify outputs, recover from provider failures, and improve from runtime telemetry without requiring the user to manually select skills or models.

The work preserves the existing Supabase deployment and provider mesh. This is a hardening/refactor path, not a full rewrite.

## 2. Current Verified State

At audit time:

- GitHub repository `salimipuria-blip/porya-omni-llm-orchestrator` contains only `README.md` on `main`; the repository is not yet the source of truth for the live system.
- Supabase project `free-llm-router` is `ACTIVE_HEALTHY` in `eu-central-1`.
- Ten Edge Functions are active: `free-llm-router`, `global-free-llm-mesh`, `github-llm-scanner`, `github-llm-verifier`, `github-admin-gateway`, `skill-installer`, `skill-orchestrator`, `skill-router`, `prompt-compiler`, and `task-orchestrator`.
- Skill installation is incomplete: `0` skills, `0` active triggers, `0` skill chunks, `0` skill assets. Install run `mega-skills-3000-v1` is still `staging` with expected counts `3000` skills and `15000` triggers.
- Only one install payload chunk is staged and the complete installation payload has not been reconstructed/executed.
- Provider discovery is active; GitHub scan tables contain candidates, but there are currently no enabled dynamic providers.
- Two cron jobs run scanner and verifier every six hours.
- Database advisors report one unindexed foreign key, one duplicate index, and `pg_net` installed in the `public` schema.

## 3. Primary Problems To Fix

### 3.1 Repository drift

Live Edge Function code, SQL state, generated bundles, and test assets exist outside the GitHub repository. This prevents reliable rollback, code review, CI, reproducible deployment, and change auditing.

### 3.2 Skill installation incomplete

The database schema and installer exist, but the 3000-skill bundle has not completed installation. Runtime claims such as `preinstalled-only` are therefore not currently true operationally.

### 3.3 Skill router loads too much too early

The current `skill-router` calls `private.load_skill(...)` for every initial candidate before final selection. Full skill instructions must only be loaded after metadata retrieval, reranking, risk/dependency filtering, and threshold enforcement.

### 3.4 Routing score drift

Quality and success-rate signals are partly applied in SQL and then applied again in Edge Function reranking. The design requires one canonical scoring contract with normalized inputs and no double-counting.

### 3.5 Missing relevance floor

The design specifies a minimum relevance threshold of `0.70`, but current runtime routing can select the top candidate regardless of absolute quality.

### 3.6 Weak skill metadata defaults

The installer currently assigns essentially every imported skill `risk_level=low` and near-identical quality scores. This removes useful discrimination and weakens risk-aware routing.

### 3.7 Prompt budget is character-based

The prompt compiler uses a large character budget instead of a model-aware token budget. It must account for task text, system policy, tool descriptions, selected skills, provider context window, and reserved completion tokens.

### 3.8 Duplicate orchestration surfaces

`skill-orchestrator` and `task-orchestrator` implement overlapping paths, while `free-llm-router` and `global-free-llm-mesh` implement partially different provider policy. This creates policy drift and unnecessary maintenance.

### 3.9 Missing end-to-end verification and learning

The live `task-orchestrator` does not yet implement the intended planner -> execution -> verifier -> fallback -> telemetry state machine. Runtime stats are not yet fed back into skill/model ranking.

### 3.10 Provider verification is not strict enough

A candidate can be promoted after documentation signals plus a successful anonymous `/models` probe. Promotion must require a bounded inference probe for providers claiming a routable chat endpoint, unless a provider-specific adapter has an equivalent verified contract.

### 3.11 Provider latency can cascade

Provider fallback is mostly sequential and lacks shared cooldown/circuit-breaker state. OpenRouter catalog discovery is also fetched repeatedly instead of using a short-lived cache.

## 4. Target Architecture

Canonical control flow:

`USER_INTENT -> TASK_PROFILE -> SKILL_METADATA_SEARCH -> RERANK -> POLICY_FILTER -> SKILL_LOAD -> PROMPT_COMPILE -> MODEL_RANK -> EXECUTE -> VERIFY -> FALLBACK -> TELEMETRY -> FINAL`

### 4.1 Source of truth

GitHub becomes the authoritative source for:

- Edge Function source
- SQL migrations
- tests and benchmarks
- bundle build scripts
- deployment configuration templates
- architecture/spec documents

Secrets remain only in Supabase Secrets/Vault and never enter the repository.

### 4.2 Skill registry and installation

All 3000 skills are preinstalled in the database, matching the user's requested invariant. Installation must be:

- idempotent
- resumable
- checksum-verified
- chunked for transport
- transactional at batch boundaries
- safe to retry after interruption
- auditable by install-run records

Install completion invariant:

- exactly `3000` active skills
- exactly `15000` trigger phrases
- complete canonical assets for every skill
- searchable metadata for every active skill
- no duplicate `skill_key`
- install run marked `installed`

### 4.3 Skill routing

Stage 1 returns metadata only. No full instructions are loaded.

Recommended pipeline:

1. lexical/exact trigger retrieval
2. trigram/full-text/semantic candidate retrieval
3. canonical rerank
4. relevance threshold
5. runtime/tool/dependency availability filter
6. risk policy filter
7. diversity/composition check
8. load only selected skill bodies

Defaults:

- retrieve: 20
- rerank shortlist: 5
- normal load: 1
- maximum load without explicit justification: 5
- minimum final relevance: 0.70

The routing score must be defined once and reused by SQL and runtime code. Historical success and latency must be normalized before use.

### 4.4 Prompt compiler

Use a token budget rather than a character limit.

Budget inputs:

- target model context window
- reserved output tokens
- fixed system policy
- user/task context
- tool schemas
- skill instructions
- verification criteria

When the prompt is over budget, the compiler removes the lowest-priority optional context first. It must never silently claim omitted skill text was loaded.

### 4.5 Single orchestration control plane

`task-orchestrator` becomes the canonical orchestration endpoint.

`skill-orchestrator` is retained temporarily only as a compatibility wrapper that delegates to the canonical path.

`global-free-llm-mesh` becomes the only model/provider routing surface.

`free-llm-router` becomes a compatibility wrapper or is deprecated once clients are migrated.

This removes policy duplication while preserving current integrations during transition.

### 4.6 Task state machine

States:

`RECEIVED -> PLANNED -> SKILL_ROUTED -> PROMPT_COMPILED -> MODEL_ROUTED -> EXECUTING -> VERIFYING -> COMPLETED`

Failure transitions may enter:

`RETRYING -> MODEL_FALLBACK -> PROVIDER_FALLBACK -> SKILL_FALLBACK -> REPLANNING -> FAILED`

Every transition writes non-sensitive telemetry.

### 4.7 Verification

Mandatory verifier classes:

- structured JSON/schema validation
- code syntax/unit tests where executable
- API response contract validation
- deployment health checks
- data transformation invariants
- provider promotion evidence

Verification status values:

- `VERIFIED`
- `HIGH_CONFIDENCE`
- `PARTIALLY_VERIFIED`
- `UNVERIFIED`
- `BLOCKED`

Success language is forbidden when evidence does not support it.

### 4.8 Provider mesh hardening

Add:

- short TTL cache for provider/model catalogs
- normalized error classes
- per-provider/model cooldown state
- circuit breaker after repeated transient failures
- bounded retries with jittered backoff
- route health metadata
- latency and success rolling windows
- bounded parallel probing only where it reduces tail latency without multiplying cost

Strict-free behavior must be enforced by the mesh, not only passed as an unused request flag.

### 4.9 Dynamic provider promotion

A dynamic provider is routable only when all required checks pass:

- HTTPS
- public-network DNS/IP resolution
- no private/metadata targets
- explicit API contract
- verified auth mode
- verified zero-cost/free status
- successful models or health probe
- successful minimal inference probe for chat providers
- valid expected response shape
- bounded response size and timeout

A README claim alone is never sufficient.

## 5. Data Model Changes

Preserve existing private schema tables, then add or normalize fields for:

- `skill_runtime_stats`
- `model_runtime_stats`
- `provider_runtime_stats`
- `task_runs`
- `task_steps`
- `verification_events`
- `provider_circuit_state`
- `catalog_cache`

Telemetry stores no plaintext secrets, bearer tokens, temporary OAuth codes, or raw sensitive prompts by default.

## 6. Database Performance Fixes

Immediate safe fixes:

- add covering index for `private.dynamic_llm_providers(source_repo_id)`
- remove one duplicate `skill_chunks(skill_id, chunk_index)` index after confirming both are identical
- retain useful unused indexes during initial ingestion/benchmarking; do not prematurely remove them before the workload exists

`pg_net` placement warning must be evaluated against Supabase extension support before changing it. Do not move or recreate the extension blindly.

## 7. Repository Layout

Target layout:

```text
supabase/
  functions/
    global-free-llm-mesh/
    github-llm-scanner/
    github-llm-verifier/
    skill-installer/
    skill-router/
    prompt-compiler/
    task-orchestrator/
    compatibility/
  migrations/
  tests/
scripts/
  build-skill-bundle/
  audit/
benchmarks/
  routing/
  providers/
docs/
  superpowers/specs/
  architecture/
```

Generated payloads, ZIP snapshots, tokens, `.env` files, caches, and temporary staging artifacts are excluded from Git.

## 8. Testing Strategy

### Unit tests

Required for:

- normalization
- trigger matching
- canonical skill scoring
- threshold enforcement
- risk filtering
- dependency filtering
- token budgeting
- error classification
- retry/circuit-breaker policy
- provider scoring
- prompt compilation

### Database tests

Verify:

- installation idempotency
- resume behavior
- exact 3000/15000 invariants
- uniqueness constraints
- search ranking
- selected-only loading
- index usage for representative routing queries

### Integration tests

Cover:

- harmless task -> relevant skill -> model -> verified result
- forced provider failure -> fallback
- invalid JSON -> verifier failure/repair
- no relevant skill -> controlled rejection or planner fallback
- high-risk skill -> policy block without explicit permission
- dynamic provider false positive -> no promotion
- valid provider -> minimal inference probe -> promotion

### Load/performance tests

Measure at minimum:

- skill metadata search P50/P95
- rerank P50/P95
- prompt compile P50/P95
- orchestrator overhead excluding model latency
- provider route selection latency
- fallback tail latency
- database connection pressure under concurrent routing

## 9. Performance Targets

Initial targets before real production baselines exist:

- metadata skill search P95 < 150 ms in-region
- rerank/policy P95 < 75 ms
- prompt compilation P95 < 50 ms
- non-LLM orchestration overhead P95 < 400 ms under normal load
- no full skill-body reads for unselected candidates
- no repeated provider catalog fetch within cache TTL
- provider failure must enter cooldown quickly enough to avoid repeated long timeouts

Targets may be tightened after benchmark data is collected.

## 10. Security Rules

- no secrets in Git history
- no service-role key in client code
- keep orchestration state in non-exposed/private schema
- least privilege for Edge Function access
- JWT verification remains enabled unless a stronger explicit auth contract is implemented
- SSRF protections remain mandatory for dynamic endpoints
- destructive actions require explicit confirmation
- anonymous/community providers must not receive sensitive content without explicit policy allowance
- install bundles require checksum and count validation before activation

## 11. Migration Phases

### Phase 0 — Repository recovery

Import the audited live code and required SQL into the hardening branch. Add `.gitignore`, directory structure, deployment notes, and baseline tests. No secrets or generated ZIP payloads are committed.

### Phase 1 — Installer completion

Replace the incomplete staging path with a deterministic chunked/resumable import. Install the 3000-skill bundle and verify exact invariants.

### Phase 2 — Router hardening

Separate metadata retrieval from body loading, establish the canonical score, enforce threshold/risk/dependencies, and add routing unit/database tests.

### Phase 3 — Prompt compiler hardening

Introduce token-aware budgeting and explicit context omission reporting.

### Phase 4 — Orchestrator unification

Make `task-orchestrator` canonical. Convert overlapping endpoints into compatibility wrappers. Add task state machine, normalized failures, verification, and telemetry.

### Phase 5 — Provider mesh hardening

Add cache, runtime stats, circuit breaker, bounded retries, strict-free enforcement, and inference-based dynamic provider promotion.

### Phase 6 — Benchmark and optimize

Run routing quality benchmarks, integration tests, and load tests. Tune indexes and scoring using measured data rather than guesses.

### Phase 7 — Controlled production rollout

Deploy incrementally, run smoke tests, compare against baseline, retain rollback commits, and only then retire duplicate legacy paths.

## 12. Rollback Strategy

Every phase is committed separately.

Before production changes:

- capture live function versions/checksums
- export relevant schema definitions
- preserve current function source in Git history

A failed phase rolls back to the previous known-good Edge Function versions and SQL migration state where reversible. Destructive schema changes are avoided until compatibility traffic has migrated.

## 13. Acceptance Criteria

The hardening project is complete only when all are demonstrated:

1. GitHub contains the complete deployable source and migrations required to reproduce the runtime.
2. Exactly 3000 skills and 15000 triggers are installed and verified.
3. Re-running installation is idempotent and an interrupted install can resume safely.
4. Candidate retrieval does not load instructions for unselected skills.
5. Natural-language requests can select relevant skills without explicit skill names.
6. Routing enforces relevance, risk, dependencies, and runtime availability.
7. Prompt compilation respects a model-aware token budget.
8. One canonical orchestration control plane owns planning, execution, verification, fallback, and telemetry.
9. Two materially different task profiles can route to different models using measured capability data.
10. Provider failure triggers bounded retry/fallback without repeated long timeouts.
11. Invalid structured output is detected and repaired or clearly rejected.
12. Dynamic providers cannot be promoted by documentation claims alone.
13. A promoted chat provider has passed a minimal bounded inference probe.
14. No secret is present in logs, source, Git history, or user output.
15. Unit, integration, database, and benchmark suites pass.
16. Security/performance advisors contain no unresolved actionable issue introduced by this work.

## 14. Non-Goals

- no UI/dashboard in this hardening cycle
- no paid routing without explicit user permission
- no arbitrary execution of code from newly discovered GitHub repositories
- no loading all 3000 skills into prompt context
- no rewrite solely for aesthetic architecture reasons

## 15. Definition of Done

The user can state a normal-language goal once. The system autonomously retrieves only the required preinstalled skill(s), chooses an appropriate verified free-first model/provider, executes the task, verifies the result, recovers from common failures, records safe telemetry, and returns a useful answer with minimal user intervention. The full runtime is reproducible from GitHub and can be tested and rolled back safely.