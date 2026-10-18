# Lithos — Live Intelligence

Private monitoring dashboard: Instagram/Buffer performance, insights, KPIs and leads in one
layer, with Supabase auth (magic link) and a serverless Buffer sync endpoint.

> **Source provenance:** this repository was reconstructed from the last healthy Vercel
> deployment (`dpl_6GbXF4L3H9tMX8uApfk4ERj8ppiK` of project `lithos-live-intelligence-vercel-fixed`).
> The app had never been committed to git. `index.html`, `package.json`, `vercel.json` and
> `vite.config.js` are byte-for-byte recoveries. **`api/buffer-sync.js` is partially
> reconstructed** — the helper functions and the start of the handler are original; the tail
> was truncated during recovery and is marked `RECONSTRUCTED` in the file. Persistence now uses
> the RPCs that exist in the Supabase project (`lithos_ingest_buffer_snapshot`,
> `lithos_set_buffer_sync_state`). The Buffer GraphQL query and metric keys are still
> unverified — check them against Buffer's API before relying on the sync.

## Stack
- **Frontend:** single static `index.html` (Vite build, Supabase JS from CDN).
- **API:** `api/buffer-sync.js` — Vercel serverless function, `POST /api/buffer-sync`.
- **Backend:** Supabase (`https://aupkeramhsufnmhkbihl.supabase.co`).

## Environment variables (Vercel project settings)
| Key | Purpose |
|---|---|
| `BUFFER_API_KEY` | Buffer access token used server-side by `api/buffer-sync.js`. **Secret.** Regenerate from the Buffer dashboard if the sync is disconnected. |
| `LITHOS_OWNER_EMAILS` | Comma-separated owner emails allowed to call `POST /api/buffer-sync`. **Required** — unset means every call gets `403` (fail closed). |

The Supabase URL and **publishable (anon)** key are embedded in the client on purpose — they are
public by design; data access is protected by Supabase Row Level Security, not by hiding the key.

## Supabase schema (tables the frontend reads)
A reconstructed, tested copy of the whole contract (tables, `lithos_owners`, owner-only RLS, both
RPCs) lives in `supabase/schema.sql`; `bash supabase/tests/run.sh` checks it on a throwaway
PostgreSQL (`DATABASE_URL=…`). Diff it against a live project before applying it there.

- `lithos_insight_snapshots` — `followers, reach, impressions, saves, shares, comments, engagement_rate, avg_watch_time_seconds, metadata (jsonb, e.g. {followers_supported}), captured_at`
- `lithos_kpi_snapshots` — `qualified_leads, conversion_rate, hot_leads, overdue_followups, revenue, response_sla_minutes, captured_at`
- `lithos_leads` — lead rows (CRM)
- `lithos_sync_state` — `source, status` (`connected` / `synced` / `error` / …)

## Local dev
```bash
npm install
npm test        # sync handler against mocked Buffer + Supabase
npm run build   # vite build -> dist/
```
Requires a Supabase project with the tables above (RLS enabled) and a Buffer token to exercise sync.

## Deploy (Vercel)
1. Import this repo as a Vercel project (framework **Vite**, root = repo root, output `dist`).
2. Add env vars `BUFFER_API_KEY` and `LITHOS_OWNER_EMAILS`.
3. Deploy.
