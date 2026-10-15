# Professional Guide — hermes

> Auto-maintained. Update this file whenever performance, debugging, or architecture changes.
> Last updated: 2026-10-15.

## Stack
JavaScript (ESM) on Cloudflare Workers + Durable Objects

## Quality gates
- Test: `npm test (206 unit) + npm run test:integration (10 workerd) + npm run test:shell`
- Check: `npm run check (31 modules) + bash -n setup.sh config.sh logger.sh`

## Performance improvements applied
- fetchWithTimeout (30s) on every outbound fetch
- parallelized recallEdit/recallVariations and rememberEdit/rememberVariations
- AbortController on conversationCall (30s)
- module-level shard/total cache in skill-router
- recordRequest wired into json/page/text helpers for accurate /metrics
- reminders.mjs: KV-backed reminder queue with Tehran-aware parsing, delivered from scheduled() cron
  (reminders fired once; morning digest at 08:00 Asia/Tehran); surfaced in /api/reminders and the app's REMINDERS panel

## Debugging playbook
- Worker logs: wrangler tail / Cloudflare dashboard Logs
- /health/live, /health/ready, /health/full, /metrics
- Integration failures: check CONVERSATIONS binding and migration conversation-sqlite-v1
- Gemini 403/429: verify GEMINI_API_KEY and quota; fallback chain GitHub→Groq→Cerebras→...

## Feature flows added
- `reminders.mjs` → `parseReminder/addReminder/listReminders/deleteReminder/dueReminders/markSent/morningDigest`
- `worker.mjs` → `/reminders`, `/rem_del N`, natural-language «یادم بنداز ...», `scheduled()` → `runReminders()`, `/api/reminders*`
- `app.mjs` → REMINDERS panel in the log sheet
- Timezone: `wallClockToUtc` uses Intl offsets, so DST-free zones stay exact; `` is never used next to Persian letters

## Suggested next steps
- Add per-route latency metrics to /metrics
- Cache weather response 5 min in KV
- Profile photo-edit candidates with console.time in dev

## How to keep this file alive
1. After any change, append a line under "Performance improvements applied" or "Debugging playbook".
2. Run the quality gates above; record results in PROGRESS.md.
3. If a new bottleneck is found, add it to "Suggested next steps" with a measurable target.
