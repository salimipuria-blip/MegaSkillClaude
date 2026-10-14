# Security
- Keys live only in Vercel environment variables; the client never sees them. `/api/health` reports provider names, never keys.
- `ENGINE_TOKEN` is compared in constant time. On Vercel, a missing/short token makes every API return 503.
- The console keeps the token in the input field only; it is not written to localStorage.
- Skill files are untrusted data: hashed before use, size-capped (64 KB), path-traversal and symlink checked, never executed. In prompts they are wrapped in `<skill>` tags with a system rule that they cannot grant tools or override rules.
- Free-only policy: OpenRouter models must end in `:free`; any 429/402/5xx moves to the next free provider, then stops with `PROVIDERS_EXHAUSTED`. No paid fallback exists in code.
- Opt-in telemetry (`PSK_TELEMETRY=1`, off by default): one allowlisted technical JSON line per routing request to Vercel runtime logs. It never records query text, query tokens, responses, skill content, headers, tokens, keys, IP, user or task identifiers, hashes or Error objects, and makes no network calls. See [TELEMETRY.md](TELEMETRY.md).
- Known gap: bearer token pasted in the UI is a migration step; replace with an HttpOnly cookie session.
