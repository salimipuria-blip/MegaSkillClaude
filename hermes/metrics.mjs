// Minimal in-isolate metrics (hermes/#013, #088). Cloudflare isolates are ephemeral,
// so these counters are per-isolate diagnostics, not durable analytics — documented
// as such in docs/hermes/observability.md. No user ids / chat ids are ever labels.

const counters = { requests: 0, errors: 0, startedAt: Date.now() };

export function recordRequest(isError = false) {
  counters.requests += 1;
  if (isError) counters.errors += 1;
}

export function snapshot() {
  return { requests_total: counters.requests, errors_total: counters.errors,
    uptime_seconds: Math.floor((Date.now() - counters.startedAt) / 1000) };
}

export function prometheusText() {
  const s = snapshot();
  return [
    '# HELP hermes_requests_total Requests handled by this isolate.',
    '# TYPE hermes_requests_total counter',
    `hermes_requests_total ${s.requests_total}`,
    '# HELP hermes_errors_total Requests handled with a 5xx response by this isolate.',
    '# TYPE hermes_errors_total counter',
    `hermes_errors_total ${s.errors_total}`,
    '# HELP hermes_uptime_seconds Seconds since this isolate started.',
    '# TYPE hermes_uptime_seconds gauge',
    `hermes_uptime_seconds ${s.uptime_seconds}`,
    '',
  ].join('\n');
}
