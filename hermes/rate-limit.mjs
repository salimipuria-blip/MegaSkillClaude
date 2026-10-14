/**
 * Consume one request from a fixed-window counter stored in Cloudflare KV.
 *
 * This is a best-effort abuse guard, not an atomic/distributed quota: concurrent KV
 * read-modify-write operations can race. Use a Durable Object or another atomic store
 * if the limit is a security boundary. Missing storage and storage errors fail closed.
 */
const unavailable = (retryAfterSeconds = 0) => ({
  allowed: false,
  status: 'unavailable',
  remaining: 0,
  retryAfterSeconds,
});

async function digestKey(namespace, identity) {
  const data = new TextEncoder().encode(`${namespace}\0${identity}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {{get: Function, put: Function} | null | undefined} storage KV-compatible binding
 * @param {string} namespace Stable limiter name, e.g. "booking"
 * @param {string} identity Trusted caller identity, e.g. Cloudflare's client IP header
 * @param {{limit: number, windowSeconds: number, now?: number}} options
 * @returns {Promise<{allowed: boolean, status: 'allowed'|'limited'|'unavailable', remaining: number, retryAfterSeconds: number}>}
 */
export async function consumeFixedWindow(storage, namespace, identity, {limit, windowSeconds, now = Date.now()} = {}) {
  if (typeof namespace !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(namespace)) {
    throw new TypeError('namespace must contain 1-40 lowercase letters, digits, underscores, or hyphens');
  }
  if (typeof identity !== 'string' || identity.trim().length === 0 || identity.length > 512) {
    throw new TypeError('identity must be a non-empty string of at most 512 characters');
  }
  identity = identity.trim();
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('limit must be a positive safe integer');
  }
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 31_536_000) {
    throw new TypeError('windowSeconds must be a positive safe integer');
  }
  if (!Number.isFinite(now) || now < 0) {
    throw new TypeError('now must be a non-negative timestamp in milliseconds');
  }
  if (!storage || typeof storage.get !== 'function' || typeof storage.put !== 'function') {
    return unavailable();
  }

  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));

  try {
    const storageKey = `rl:v1:${namespace}:${windowStart}:${await digestKey(namespace, identity)}`;
    const rawCount = await storage.get(storageKey);
    let count = 0;
    if (rawCount !== null && rawCount !== undefined) {
      if (typeof rawCount !== 'string' || !/^(0|[1-9]\d*)$/.test(rawCount)) return unavailable(retryAfterSeconds);
      count = Number(rawCount);
      if (!Number.isSafeInteger(count)) return unavailable(retryAfterSeconds);
    }

    if (count >= limit) {
      return {allowed: false, status: 'limited', remaining: 0, retryAfterSeconds};
    }

    await storage.put(storageKey, String(count + 1), {expirationTtl: windowSeconds});
    return {allowed: true, status: 'allowed', remaining: limit - count - 1, retryAfterSeconds};
  } catch {
    return unavailable(retryAfterSeconds);
  }
}
