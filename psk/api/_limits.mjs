// Fixed-window, per-client rate limiting for the public API.
//
// Why per-instance fixed windows: Vercel functions are stateless and may scale
// out, so this is a *burst brake*, not a billing-grade quota. It is enough to
// stop token guessing and scripted abuse from a single IP; a distributed quota
// would need an external store (KV/Redis) and is documented as a limitation.
//
// Design rules:
//   - no I/O, no timers, no global mutable state outside the exported store
//   - the client identifier is never logged and never leaves this module
//   - expired buckets are pruned so a long-lived instance cannot leak memory
//   - every limit is overridable with PSK_RATE_LIMIT_<SCOPE> for testing

export const DEFAULT_LIMITS = Object.freeze({
  health: {limit: 120, windowMs: 60_000},
  skills: {limit: 120, windowMs: 60_000},
  tasks: {limit: 30, windowMs: 60_000},
});

const MAX_BUCKETS = 10_000;
const buckets = new Map();

/** Stable, non-reversible-ish client key: prefers headers Vercel itself sets. */
export function clientId(req) {
  const h = req?.headers || {};
  const vercel = String(h['x-vercel-forwarded-for'] || '').split(',')[0].trim();
  if (vercel) return vercel;
  const real = String(h['x-real-ip'] || '').trim();
  if (real) return real;
  const xff = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  if (xff) return xff;
  const socket = String(req?.socket?.remoteAddress || '').trim();
  if (socket) return socket;
  return 'unknown';
}

function limitFor(scope, fallback, env = process.env) {
  const raw = env?.[`PSK_RATE_LIMIT_${String(scope).toUpperCase()}`];
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function prune(store, now) {
  if (store.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of store) if (bucket.resetAt <= now) store.delete(key);
  // Still too big (pathological key churn): drop the oldest windows first.
  if (store.size > MAX_BUCKETS) {
    const overflow = store.size - MAX_BUCKETS;
    let dropped = 0;
    for (const key of store.keys()) {
      store.delete(key);
      if (++dropped >= overflow) break;
    }
  }
}

/**
 * Consume one unit from the bucket for `key`.
 * Returns {allowed, limit, remaining, resetAt, retryAfterSeconds}.
 */
export function consume(key, {limit, windowMs = 60_000, now = Date.now(), store = buckets} = {}) {
  const size = Number.isInteger(limit) && limit > 0 ? limit : 60;
  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = {count: 0, resetAt: now + windowMs};
    store.set(key, bucket);
  }
  bucket.count += 1;
  const allowed = bucket.count <= size;
  prune(store, now);
  return {
    allowed,
    limit: size,
    remaining: Math.max(0, size - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/**
 * Apply the limiter to a response. Returns true when the request may continue.
 * Call this before authentication so that token guessing is bounded too.
 */
export function rateLimit(req, res, scope = 'default', opts = {}) {
  const {limit: configured, windowMs} = DEFAULT_LIMITS[scope] || {limit: 60, windowMs: 60_000};
  const limit = limitFor(scope, configured, opts.env);
  const outcome = consume(`${scope}:${clientId(req)}`, {
    limit,
    // opts first: DEFAULT_LIMITS always carries windowMs, so `windowMs ?? opts.windowMs`
    // silently discarded the test seam (caught 2026-11-04 by tests/limits.test.mjs).
    windowMs: opts.windowMs ?? windowMs,
    now: opts.now,
    store: opts.store ?? buckets,
  });
  if (res?.setHeader) {
    res.setHeader('X-RateLimit-Limit', String(outcome.limit));
    res.setHeader('X-RateLimit-Remaining', String(outcome.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(outcome.resetAt / 1000)));
  }
  if (outcome.allowed) return true;
  if (res?.setHeader) res.setHeader('Retry-After', String(outcome.retryAfterSeconds));
  if (res?.status) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfterSeconds: outcome.retryAfterSeconds,
      limit: outcome.limit,
    });
  }
  return false;
}

/** Test seam: forget every bucket. */
export function resetRateLimits(store = buckets) {
  store.clear();
}
