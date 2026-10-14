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
