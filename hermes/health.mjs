// Health probes for Hermes Lite (hermes/#009, #089). Pure and dependency-free:
// no network calls, no secret values in output — only presence booleans.
//   liveness  — the isolate is running; never checks dependencies.
//   readiness — minimum configuration/bindings needed to serve traffic.
//   full      — liveness + readiness + binding inventory (booleans only).

export function liveness() {
  return { status: 'ok', kind: 'liveness', ts: new Date().toISOString() };
}

export function readiness(env = {}) {
  const checks = {
    telegramBotToken: Boolean(env.TELEGRAM_BOT_TOKEN),
    allowedUserId: Boolean(String(env.ALLOWED_USER_ID || '').trim()),
    conversationsBinding: Boolean(env.CONVERSATIONS),
    memoryBinding: Boolean(env.MEMORY),
  };
  const required = ['telegramBotToken', 'allowedUserId'];
  if (String(env.REQUIRE_CONVERSATIONS || '').toLowerCase() === 'true') required.push('conversationsBinding');
  const ready = required.every((k) => checks[k]);
  return { status: ready ? 'ok' : 'not_ready', kind: 'readiness', ready, checks, required, ts: new Date().toISOString() };
}

export function fullHealth(env = {}) {
  const r = readiness(env);
  return { ...liveness(), kind: 'full', ready: r.ready, checks: r.checks, required: r.required };
}

// Live pulse for the /app web (polled every ~20s). Presence booleans only, never values:
// each ability on the app's map lights up from what this deploy actually has wired.
const BRAIN_KEYS = ['GEMINI_API_KEY', 'GITHUB_MODELS_TOKEN', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'HF_TOKEN'];
export function pulse(env = {}, now = Date.now()) {
  const has = (k) => Boolean(String(env[k] || '').trim());
  const brains = BRAIN_KEYS.filter(has).length + (env.AI ? 1 : 0);
  const memory = Boolean(env.CONVERSATIONS);
  const telegram = has('TELEGRAM_BOT_TOKEN');
  const abilities = {
    brain: brains > 0, memory, telegram, edge: Boolean(env.AI), app: true,
    remind: Boolean(env.MEMORY) && telegram, calendar: has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET'),
  };
  return { status: brains > 0 && memory ? 'ok' : 'degraded', ts: new Date(now).toISOString(), brains, abilities };
}
