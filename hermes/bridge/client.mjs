// Device side of the bridge: claim one job, run it locally, report the result.
// The transport is injected, so the same loop runs against the real HTTPS endpoint or a test double.
import { BridgeError } from './paths.mjs';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function createHttpTransport({ baseUrl, token, fetchImpl = globalThis.fetch }) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new BridgeError('BAD_CONFIG', 'baseUrl is not a valid URL');
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
  if (!secure) throw new BridgeError('BAD_CONFIG', 'baseUrl must use https (http only for localhost)');
  if (typeof token !== 'string' || token.length < 20) throw new BridgeError('BAD_CONFIG', 'device token is missing');

  async function post(path, body) {
    const res = await fetchImpl(new URL(path, url), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      redirect: 'error',
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new BridgeError(`TRANSPORT_${data.code || res.status}`, `bridge endpoint answered ${res.status}`);
    return data;
  }

  return {
    claim: async () => (await post('/bridge/claim'))?.job ?? null,
    complete: (id, result) => post('/bridge/complete', { id, result }),
    fail: (id, code, message) => post('/bridge/fail', { id, code, message }),
  };
}

/** Claim at most one job, run it locally, and report done or failed. */
export async function runOnce({ transport, ctx, runJob }) {
  const job = await transport.claim();
  if (!job) return { idle: true };
  try {
    const out = await runJob(ctx, { action: job.action, args: job.args });
    await transport.complete(job.id, out.result);
    return { idle: false, id: job.id, status: 'done' };
  } catch (err) {
    const code = err instanceof BridgeError ? err.code : 'INTERNAL';
    const message = err instanceof BridgeError ? err.message : 'unexpected error';
    await transport.fail(job.id, code, message);
    return { idle: false, id: job.id, status: 'failed', code };
  }
}

/** Poll until the signal aborts. Idle polls back off; a transport error waits before retrying. */
export async function runLoop({ transport, ctx, runJob, signal, idleMs = 5000, errorMs = 15000, sleep = defaultSleep }) {
  while (!signal?.aborted) {
    let delay = idleMs;
    try {
      const outcome = await runOnce({ transport, ctx, runJob });
      if (!outcome.idle) delay = 0;
    } catch {
      delay = errorMs;
    }
    if (delay > 0) await sleep(delay, signal);
  }
}

function defaultSleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
