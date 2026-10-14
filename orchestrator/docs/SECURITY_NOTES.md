# Orchestrator security notes

**Status: repository guidance, not evidence of a production security review.** The recovered Supabase snapshot is a read-only reference artifact. No live migration, function deployment, or production access test is authorized by this document.

## Current boundaries

- The last recorded live baseline is [`architecture/live-baseline-2026-09-12.md`](architecture/live-baseline-2026-09-12.md). It reports 10 Edge Functions with `verify_jwt=true`, a non-exposed `private` schema, RLS enabled on its tables, and privileges revoked from `public`, `anon`, and `authenticated`.
- RLS enabled without policies on those private tables is intentional only while the schema remains non-exposed and browser roles have no table grants. Do not add broad policies to silence a linter. If a future endpoint needs data access, document its caller, table/column scope, and authorization contract first.
- `verify_jwt=true` verifies a JWT; it does **not** by itself grant an application role or make a caller an administrator. Each function must perform its own least-privilege authorization. `github-admin-gateway` is the owner-only example: it resolves the Supabase Auth user and checks the server-side `GITHUB_ADMIN_USER_IDS` allowlist.
- `supabase/migrations/20260912_live_snapshot.sql` is a historical schema snapshot, explicitly **not** a migration to apply to the existing live project. Never run it as a reset/recovery shortcut.
- The recorded live skill state was empty and the install was `staging`; the existence of router/installer code or a successful CI run is not evidence that skills were installed or activated in production.

## Required controls for changes

### Secrets and service roles

- Keep service-role keys, GitHub tokens, provider keys, and database credentials in the platform's server-side secret store. Never place them in Vite/browser bundles, SQL snapshots, fixtures, logs, chat, or committed `.env` files.
- A service-role client bypasses RLS. Use it only in a server-side function after validating the caller and an explicit allowlist/role. Do not return the key or a client initialized with it to the browser.
- Do not log `Authorization`, cookies, raw prompts, customer PII, database payloads, or upstream response bodies. Return bounded, redacted error codes instead.

### Database, RLS, and RPCs

- Keep `private` out of exposed Data API schemas and maintain explicit privilege revocations. RLS policies are not a substitute for schema/table grants.
- For any newly exposed tenant data: enable RLS before granting access; scope every row by an authenticated tenant/membership source; use `USING` and `WITH CHECK` for writes; include negative cross-tenant tests. Never trust a tenant, role, or owner ID supplied by a client.
- A `SECURITY DEFINER` function needs a fixed empty `search_path`, schema-qualified references, narrowly scoped owner privileges, explicit `EXECUTE` grants, input validation, and tests for unauthorized callers. Do not add a definer function merely to make an endpoint work.
- Keep multi-step installs, stock/payment operations, and other invariants transactional and idempotent. Validate payload hashes, expected counts, replay behavior, and rollback before enabling activation.

### Edge Functions and external providers

- Keep JWT verification enabled unless a documented public endpoint has a separate authentication/abuse-control design. Validate the required role inside each authenticated function; reject malformed, expired, and wrong-tenant requests before contacting providers or writing data.
- Apply request-size, timeout, URL/SSRF, and per-caller rate controls before outbound calls. Limit retries and enforce the zero-dollar provider policy; never automatically enable a paid fallback.
- Treat imported skill text and repository READMEs as untrusted data, not executable code or authority. Preserve content hashes, enforce size/path checks, and keep scanner output free of secrets.
- Recheck the allowlist, ownership, and no-write guarantees for any GitHub function. A scanner token must not become an administrative token.

## Change and release gate

1. Record the threat model, data owner, caller identity, and required privileges in the PR.
2. Use synthetic fixtures in local tests; run the repository contract audit and the complete Orchestrator test suite.
3. Review SQL with a second owner, inspect grants/policies and run negative authorization tests on a disposable project; capture a restorable backup before any production migration.
4. Confirm the exact target project, migration checksum, deployment diff, rollback procedure, provider budget, and secret configuration with the owner.
5. Deploy only after explicit owner approval. Verify live state read-only first, then test with least-privilege accounts. CI, local mocks, and dry runs are not live verification.

Useful local gates:

```sh
cd orchestrator
python scripts/audit/check_repository_contract.py
python -m pytest -q -ra tests
node --test supabase/functions/github-admin-gateway/*.test.mjs
```

The strict historical-artifact gate remains separate:

```sh
python -m pytest -q --require-materialized-skills tests
```

A missing historical artifact must fail that strict gate; do not create placeholder data to make it green.
