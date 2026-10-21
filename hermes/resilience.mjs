// Resilience primitives for outbound calls (hermes/#011, #012). Pure, injectable
// clock/sleep/random — unit-testable without network or real timers.
// Policy: retry only transient failures (network error, HTTP 429, HTTP 5xx),
// exponential backoff with jitter, hard caps. Auth errors (401/403) never retry.

export const isTransientStatus = (status) => status === 429 || (status >= 500 && status <= 599);

export async function retryWithBackoff(fn, {
  retries = 3, baseMs = 200, maxMs = 5000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  random = Math.random,
  shouldRetry = (err) => Boolean(err) && err.transient !== false &&
    (err.status === undefined || isTransientStatus(err.status)),
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(attempt); } catch (err) {
      lastError = err;
      if (attempt === retries || !shouldRetry(err)) throw err;
      const capped = Math.min(maxMs, baseMs * 2 ** attempt);
      await sleep(Math.floor(capped * (0.5 + random() * 0.5)));
    }
  }
  throw lastError;
}

export class CircuitBreaker {
  constructor({ failureThreshold = 5, cooldownMs = 30_000, now = () => Date.now() } = {}) {
    if (!Number.isSafeInteger(failureThreshold) || failureThreshold < 1) throw new TypeError('failureThreshold must be a positive integer');
    if (!Number.isFinite(cooldownMs) || cooldownMs < 0) throw new TypeError('cooldownMs must be a non-negative number');
    this.failureThreshold = failureThreshold; this.cooldownMs = cooldownMs; this.now = now;
    this.failures = 0; this.openedAt = null;
  }
  get state() {
    if (this.openedAt === null) return 'closed';
    return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
  }
  async exec(fn) {
    if (this.state === 'open') {
      const err = new Error('circuit breaker is open'); err.code = 'CIRCUIT_OPEN'; err.transient = false; throw err;
    }
    try { const out = await fn(); this.failures = 0; this.openedAt = null; return out; }
    catch (err) {
      this.failures += 1;
      if (this.failures >= this.failureThreshold) this.openedAt = this.now();
      throw err;
    }
  }
}

// Backlog task 20: the in-memory CircuitBreaker above dies with the isolate, so a dead key is
// retried on every new request — each retry burns one of the Worker's 50 outbound calls per message
// and a second of the owner's wait, and a Worker restarts its isolates constantly. This parks a
// service in KV after three consecutive auth failures (401/403) for one hour, so *any* isolate reads
// the park before spending a call on a key that cannot work. Only auth failures park a service: a
// 429 or a 5xx is transient and must stay in the retry path above.
export const PARK_KEY_PREFIX = 'service-park:';
export const PARK_THRESHOLD = 3;
export const PARK_MS = 60 * 60 * 1000;
export const isAuthStatus = (status) => status === 401 || status === 403;

export class ServicePark {
  constructor({ kv, threshold = PARK_THRESHOLD, parkMs = PARK_MS, prefix = PARK_KEY_PREFIX, now = () => Date.now() } = {}) {
    if (!kv || typeof kv.get !== 'function' || typeof kv.put !== 'function') {
      throw new TypeError('ServicePark needs a KV binding with get/put (env.MEMORY)');
    }
    if (!Number.isSafeInteger(threshold) || threshold < 1) throw new TypeError('threshold must be a positive integer');
    if (!Number.isFinite(parkMs) || parkMs <= 0) throw new TypeError('parkMs must be a positive number');
    this.kv = kv; this.threshold = threshold; this.parkMs = parkMs; this.prefix = prefix; this.now = now;
  }

  key(name) { return `${this.prefix}${name}`; }

  async read(name) {
    const empty = { failures: 0, parkedUntil: 0, reason: '' };
    let raw = null;
    try { raw = await this.kv.get(this.key(name)); } catch { return empty; }   // unreadable KV must not block an answer
    if (!raw) return empty;
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        failures: Number(data.failures) || 0,
        parkedUntil: Number(data.parkedUntil) || 0,
        reason: String(data.reason || ''),
      };
    } catch { return empty; }
  }

  /** The park record while it is active, or null. */
  async parked(name) {
    const state = await this.read(name);
    return state.parkedUntil > this.now() ? state : null;
  }

  async failAuth(name, status) {
    const state = await this.read(name);
    const failures = state.failures + 1;
    const parkedUntil = failures >= this.threshold ? this.now() + this.parkMs : 0;
    await this.write(name, { failures, parkedUntil, reason: `HTTP ${status}` });
    return { failures, parkedUntil, parked: parkedUntil > this.now() };
  }

  /** A working answer wipes the counter: three failures have to be consecutive. */
  async succeed(name) {
    const state = await this.read(name);
    if (state.failures || state.parkedUntil) await this.clear(name);
  }

  async clear(name) {
    if (typeof this.kv.delete === 'function') {
      try { await this.kv.delete(this.key(name)); return; } catch { /* fall through to the zero write */ }
    }
    await this.write(name, { failures: 0, parkedUntil: 0, reason: '' });
  }

  async write(name, state) {
    try {
      await this.kv.put(this.key(name), JSON.stringify({ ...state, ts: new Date(this.now()).toISOString() }));
    } catch { /* losing a park record costs one extra probe; breaking the answer would cost more */ }
  }
}

// Fetch with a hard timeout so a hung upstream can never pin a Worker request. The default is
// generous (20s) for model calls; callers on a tighter path pass their own limit. An AbortSignal
// already present in `init` is preserved and combined with the timeout.
export async function fetchWithTimeout(input, init = {}, timeoutMs = 30000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`fetch timed out after ${timeoutMs}ms`)), timeoutMs);
  const upstream = init && init.signal;
  const onAbort = () => controller.abort(upstream && upstream.reason);
  if (upstream) {
    if (upstream.aborted) controller.abort(upstream.reason);
    else upstream.addEventListener('abort', onAbort, { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (upstream) upstream.removeEventListener('abort', onAbort);
  }
}
