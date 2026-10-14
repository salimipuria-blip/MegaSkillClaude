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
