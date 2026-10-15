// HTTP surface for the bridge device side. Only three routes exist:
//   POST /bridge/claim      -> next job for this device, or 204
//   POST /bridge/complete   -> { id, result }
//   POST /bridge/fail       -> { id, code, message }
// Devices cannot create jobs or read other owners' data. Every route needs a Bearer token.
import { QueueError } from './queue.mjs';

const MAX_BODY_BYTES = 64 * 1024;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const HTTP_BY_CODE = {
  UNAUTHORIZED: 401,
  NOT_HOLDER: 409,
  LEASE_EXPIRED: 409,
  RESULT_TOO_LARGE: 413,
};

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9_\-.~+/=]{1,200})$/.exec(header);
  return match ? match[1] : null;
}

async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) return { error: json(413, { ok: false, code: 'TOO_LARGE' }) };
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return { error: json(413, { ok: false, code: 'TOO_LARGE' }) };
  try {
    const body = text.length ? JSON.parse(text) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return { body };
  } catch {
    return { error: json(400, { ok: false, code: 'BAD_JSON' }) };
  }
}

export function createBridgeHandler(queue) {
  return async function handle(request) {
    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, '');
    if (!['/bridge/claim', '/bridge/complete', '/bridge/fail'].includes(route)) {
      return json(404, { ok: false, code: 'NOT_FOUND' });
    }
    if (request.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

    const device = queue.authenticate(bearer(request));
    if (!device) return json(401, { ok: false, code: 'UNAUTHORIZED' });

    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;

    try {
      if (route === '/bridge/claim') {
        const job = queue.claim(device.deviceId);
        return job ? json(200, { ok: true, job }) : new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
      }
      if (route === '/bridge/complete') {
        const out = queue.complete(device.deviceId, parsed.body.id, parsed.body.result);
        return json(200, { ok: true, ...out });
      }
      const out = queue.fail(device.deviceId, parsed.body.id, {
        code: parsed.body.code,
        message: parsed.body.message,
      });
      return json(200, { ok: true, ...out });
    } catch (err) {
      if (err instanceof QueueError) {
        return json(HTTP_BY_CODE[err.code] ?? 400, { ok: false, code: err.code, message: err.message });
      }
      return json(500, { ok: false, code: 'INTERNAL' });
    }
  };
}
