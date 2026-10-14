# Architecture
`public/` static site → `api/*.js` Vercel Functions (stateless, ≤60 s) → `engine/router.mjs` (registry + verified bodies, loaded once per cold start, ~0.7 s) → `engine/providers.mjs` (free-tier OpenAI-compatible chat, failover).

Routing index: built in memory once per cold start from the committed registry and verified SKILL.md files; there is no persisted index artifact. Name-derived terms are precomputed at load; see [ROUTING_EVALUATION.md](ROUTING_EVALUATION.md) for measurements and the contract snapshot (`tests/fixtures/routing-golden.json`).

Optional telemetry (`engine/telemetry.mjs`, `PSK_TELEMETRY=1`) wraps the two routing handlers and writes one allowlisted line per request to runtime logs. Off by default. See [TELEMETRY.md](TELEMETRY.md).

V3 compatibility: same endpoints and request shapes. Changes: `/api/health` adds `skillContent` and a `provider.providers` list; `answer` mode now calls a free provider instead of always failing; failure codes are `NO_PROVIDER_CONFIGURED`, `PROVIDERS_EXHAUSTED`, `PROVIDER_REJECTED`, `SKILL_CONTENT_MISSING`.

Not used: a local daemon, local models (owner laptop has 4 GB RAM), or any always-on process. freelm (MIT) was reviewed; its failover design was adopted in ~80 lines instead of adding a 6-star dependency, and its in-memory quota state would not survive serverless cold starts anyway.
