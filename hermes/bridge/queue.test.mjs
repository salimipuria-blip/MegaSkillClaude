// Tests for the bridge queue, the HTTP routes, and the device client.
// No network: routes are called with Web Request objects, and the client talks to them through
// an injected fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createQueue, QueueError, QUEUE_LIMITS } from './queue.mjs';
import { createBridgeHandler } from './routes.mjs';
import { createHttpTransport, runOnce } from './client.mjs';
import { createContext, P0_ACTIONS, runJob } from './dispatcher.mjs';
import { BridgeError } from './paths.mjs';

const ACTIONS = new Set(Object.keys(P0_ACTIONS));
const ORIGIN = 'https://bridge.example.test';

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

function makeQueue(extra = {}) {
  const c = clock();
  let n = 0;
  const queue = createQueue({ allowedActions: ACTIONS, now: c.now, newId: () => `job-${(n += 1)}`, ...extra });
  return { queue, clock: c };
}

function makeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'bridge-queue-'));
  mkdirSync(path.join(root, '.git'));
  writeFileSync(path.join(root, 'README.md'), 'hello queue\n');
  writeFileSync(path.join(root, '.env'), 'SECRET=1\n');
  return root;
}

// ---------- enqueue rules ----------

test('enqueue accepts only allowed actions and bounded ttl', () => {
  const { queue } = makeQueue();
  assert.throws(() => queue.enqueue({ ownerId: 'u1', action: 'propose_edit' }), (e) => e.code === 'NOT_ALLOWED');
  assert.throws(() => queue.enqueue({ ownerId: 'u1', action: '__proto__' }), (e) => e.code === 'NOT_ALLOWED');
  assert.throws(() => queue.enqueue({ ownerId: 'u1', action: 'read_file', ttlMs: 1 }), (e) => e.code === 'BAD_TTL');
  assert.throws(() => queue.enqueue({ ownerId: 'u1', action: 'read_file', ttlMs: 1.5 }), (e) => e.code === 'BAD_TTL');
  assert.throws(() => queue.enqueue({ ownerId: '', action: 'read_file' }), (e) => e.code === 'BAD_OWNER');
  assert.throws(() => queue.enqueue({ ownerId: 'u1', action: 'read_file', args: [] }), (e) => e.code === 'BAD_ARGS');
});

test('enqueue refuses when the open-job limit is reached', () => {
  const { queue } = makeQueue({ limits: { ...QUEUE_LIMITS, maxQueued: 2 } });
  queue.enqueue({ ownerId: 'u1', action: 'read_file' });
  queue.enqueue({ ownerId: 'u1', action: 'read_file' });
  assert.throws(() => queue.enqueue({ ownerId: 'u1', action: 'read_file' }), (e) => e.code === 'QUEUE_FULL');
});

test('construction requires a non-empty allowlist', () => {
  assert.throws(() => createQueue({ allowedActions: new Set() }), (e) => e.code === 'BAD_CONFIG');
  assert.throws(() => createQueue({ allowedActions: ['read_file'] }), (e) => e.code === 'BAD_CONFIG');
});

// ---------- device tokens ----------

test('tokens authenticate only while active and are never stored raw', () => {
  const { queue } = makeQueue();
  const { deviceId, token } = queue.issueDevice('owner-1');
  assert.deepEqual(queue.authenticate(token), { deviceId, ownerId: 'owner-1' });
  assert.equal(queue.authenticate(token + 'x'), null);
  assert.equal(queue.authenticate(''), null);
  assert.equal(queue.authenticate(undefined), null);
  assert.equal(queue.authenticate('x'.repeat(300)), null);
  assert.equal(queue.revokeDevice(deviceId), true);
  assert.equal(queue.authenticate(token), null);
  assert.equal(queue.revokeDevice('nope'), false);
});

test('a raw token never appears in the queue state', () => {
  const { queue } = makeQueue();
  const { token } = queue.issueDevice('owner-1');
  const dump = JSON.stringify(queue);
  assert.ok(!dump.includes(token));
});

// ---------- claim, lease, complete ----------

test('a device claims only its own owner jobs, oldest first', () => {
  const { queue } = makeQueue();
  const mine = queue.issueDevice('owner-1');
  const theirs = queue.issueDevice('owner-2');
  queue.enqueue({ ownerId: 'owner-2', action: 'read_file', args: { path: 'README.md' } });
  const first = queue.enqueue({ ownerId: 'owner-1', action: 'read_file', args: { path: 'README.md' } });
  const second = queue.enqueue({ ownerId: 'owner-1', action: 'search', args: { query: 'hello' } });

  const claimed = queue.claim(mine.deviceId);
  assert.equal(claimed.id, first.id);
  assert.equal(claimed.attempt, 1);
  assert.equal(queue.claim(mine.deviceId).id, second.id);
  assert.equal(queue.claim(mine.deviceId), null);
  assert.equal(queue.claim(theirs.deviceId).action, 'read_file');
});

test('only the leaseholder can complete, and only while the lease is live', () => {
  const { queue, clock: c } = makeQueue();
  const a = queue.issueDevice('owner-1');
  const b = queue.issueDevice('owner-1');
  const { id } = queue.enqueue({ ownerId: 'owner-1', action: 'git_status' });
  queue.claim(a.deviceId);
  assert.throws(() => queue.complete(b.deviceId, id, {}), (e) => e.code === 'NOT_HOLDER');
  assert.throws(() => queue.complete(a.deviceId, 'missing', {}), (e) => e.code === 'NOT_HOLDER');

  c.advance(QUEUE_LIMITS.leaseMs + 1);
  assert.throws(() => queue.complete(a.deviceId, id, {}), (e) => e.code === 'LEASE_EXPIRED' || e.code === 'NOT_HOLDER');
});

test('complete stores the result and the job is not handed out again', () => {
  const { queue } = makeQueue();
  const dev = queue.issueDevice('owner-1');
  const { id } = queue.enqueue({ ownerId: 'owner-1', action: 'read_file', args: { path: 'README.md' } });
  queue.claim(dev.deviceId);
  queue.complete(dev.deviceId, id, { content: 'hi' });
  assert.equal(queue.claim(dev.deviceId), null);
  const view = queue.status('owner-1', id);
  assert.equal(view.status, 'done');
  assert.deepEqual(view.result, { content: 'hi' });
  assert.equal(queue.status('owner-2', id), null);
});

test('complete refuses oversized results', () => {
  const { queue } = makeQueue();
  const dev = queue.issueDevice('owner-1');
  const { id } = queue.enqueue({ ownerId: 'owner-1', action: 'read_file' });
  queue.claim(dev.deviceId);
  assert.throws(
    () => queue.complete(dev.deviceId, id, 'x'.repeat(QUEUE_LIMITS.maxResultChars + 10)),
    (e) => e.code === 'RESULT_TOO_LARGE',
  );
});

// ---------- failures, expiry, retries ----------

test('a failed job is retried until maxAttempts, then marked failed', () => {
  const { queue } = makeQueue();
  const dev = queue.issueDevice('owner-1');
  const { id } = queue.enqueue({ ownerId: 'owner-1', action: 'read_file' });
  for (let attempt = 1; attempt <= QUEUE_LIMITS.maxAttempts; attempt += 1) {
    assert.equal(queue.claim(dev.deviceId).attempt, attempt);
    const out = queue.fail(dev.deviceId, id, { code: 'BINARY', message: 'x'.repeat(2000) });
    assert.equal(out.status, attempt < QUEUE_LIMITS.maxAttempts ? 'queued' : 'failed');
  }
  assert.equal(queue.claim(dev.deviceId), null);
  const view = queue.status('owner-1', id);
  assert.equal(view.status, 'failed');
  assert.equal(view.error.code, 'BINARY');
  assert.ok(view.error.message.length <= QUEUE_LIMITS.maxErrorChars);
});

test('an abandoned lease is requeued, and expires after maxAttempts', () => {
  const { queue, clock: c } = makeQueue();
  const dev = queue.issueDevice('owner-1');
  const { id } = queue.enqueue({ ownerId: 'owner-1', action: 'read_file' });
  for (let i = 0; i < QUEUE_LIMITS.maxAttempts; i += 1) {
    assert.ok(queue.claim(dev.deviceId));
    c.advance(QUEUE_LIMITS.leaseMs + 1);
  }
  assert.equal(queue.claim(dev.deviceId), null);
  assert.equal(queue.status('owner-1', id).status, 'failed');
});

test('a job past its ttl is never handed out', () => {
  const { queue, clock: c } = makeQueue();
  const dev = queue.issueDevice('owner-1');
  const { id } = queue.enqueue({ ownerId: 'owner-1', action: 'read_file', ttlMs: QUEUE_LIMITS.minTtlMs });
  c.advance(QUEUE_LIMITS.minTtlMs + 1);
  assert.equal(queue.claim(dev.deviceId), null);
  assert.equal(queue.status('owner-1', id).status, 'expired');
});

test('revoking a device returns its running job to the queue', () => {
  const { queue } = makeQueue();
  const dev = queue.issueDevice('owner-1');
  const other = queue.issueDevice('owner-1');
  const { id } = queue.enqueue({ ownerId: 'owner-1', action: 'read_file' });
  queue.claim(dev.deviceId);
  queue.revokeDevice(dev.deviceId);
  assert.equal(queue.status('owner-1', id).status, 'queued');
  assert.equal(queue.claim(other.deviceId).id, id);
});

// ---------- HTTP routes ----------

function call(handler, path, { token, body, method = 'POST', raw } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return handler(new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: raw ?? (method === 'POST' ? JSON.stringify(body ?? {}) : undefined),
  }));
}

test('routes require a valid Bearer token', async () => {
  const { queue } = makeQueue();
  const handler = createBridgeHandler(queue);
  assert.equal((await call(handler, '/bridge/claim')).status, 401);
  assert.equal((await call(handler, '/bridge/claim', { token: 'nope-nope-nope-nope-nope' })).status, 401);
});

test('routes reject unknown paths and wrong methods', async () => {
  const { queue } = makeQueue();
  const handler = createBridgeHandler(queue);
  const { token } = queue.issueDevice('owner-1');
  assert.equal((await call(handler, '/bridge/create-job', { token })).status, 404);
  assert.equal((await call(handler, '/bridge/claim', { token, method: 'GET' })).status, 405);
});

test('routes reject oversized and malformed bodies', async () => {
  const { queue } = makeQueue();
  const handler = createBridgeHandler(queue);
  const { token } = queue.issueDevice('owner-1');
  const big = JSON.stringify({ id: 'x', result: 'a'.repeat(70 * 1024) });
  assert.equal((await call(handler, '/bridge/complete', { token, raw: big })).status, 413);
  assert.equal((await call(handler, '/bridge/complete', { token, raw: '[1]' })).status, 400);
  assert.equal((await call(handler, '/bridge/complete', { token, raw: '{bad' })).status, 400);
});

test('routes map claim, complete and conflict responses', async () => {
  const { queue } = makeQueue();
  const handler = createBridgeHandler(queue);
  const dev = queue.issueDevice('owner-1');
  const other = queue.issueDevice('owner-1');
  const { id } = queue.enqueue({ ownerId: 'owner-1', action: 'read_file', args: { path: 'README.md' } });

  assert.equal((await call(handler, '/bridge/claim', { token: dev.token })).status, 200);
  const conflict = await call(handler, '/bridge/complete', { token: other.token, body: { id, result: {} } });
  assert.equal(conflict.status, 409);
  const done = await call(handler, '/bridge/complete', { token: dev.token, body: { id, result: { ok: 1 } } });
  assert.equal(done.status, 200);
  assert.equal((await done.json()).status, 'done');
  assert.equal((await call(handler, '/bridge/claim', { token: dev.token })).status, 204);
});

test('routes never expose a queue error stack', async () => {
  const { queue } = makeQueue();
  const handler = createBridgeHandler(queue);
  const dev = queue.issueDevice('owner-1');
  const res = await call(handler, '/bridge/fail', { token: dev.token, body: { id: 'missing' } });
  const text = await res.text();
  assert.equal(res.status, 409);
  assert.ok(!text.includes('at '));
});

// ---------- device client ----------

function loopbackFetch(handler) {
  return (url, init) => handler(new Request(url, init));
}

test('createHttpTransport refuses plain http to remote hosts and short tokens', () => {
  assert.throws(() => createHttpTransport({ baseUrl: 'http://bridge.example.test', token: 'x'.repeat(30) }), BridgeError);
  assert.throws(() => createHttpTransport({ baseUrl: 'https://bridge.example.test', token: 'short' }), BridgeError);
  assert.ok(createHttpTransport({ baseUrl: 'http://127.0.0.1:8787', token: 'x'.repeat(30) }));
});

test('runOnce claims, runs the job locally and reports the result', async () => {
  const root = makeRepo();
  const ctx = createContext(root);
  const { queue } = makeQueue();
  const handler = createBridgeHandler(queue);
  const dev = queue.issueDevice('owner-1');
  const { id } = queue.enqueue({ ownerId: 'owner-1', action: 'read_file', args: { path: 'README.md' } });
  const transport = createHttpTransport({ baseUrl: ORIGIN, token: dev.token, fetchImpl: loopbackFetch(handler) });

  const out = await runOnce({ transport, ctx, runJob });
  assert.deepEqual(out, { idle: false, id, status: 'done' });
  assert.equal(queue.status('owner-1', id).status, 'done');
  assert.match(queue.status('owner-1', id).result.content, /hello queue/);
});

test('runOnce reports a protected file as a failed job with its code', async () => {
  const root = makeRepo();
  const ctx = createContext(root);
  const { queue } = makeQueue();
  const handler = createBridgeHandler(queue);
  const dev = queue.issueDevice('owner-1');
  const { id } = queue.enqueue({ ownerId: 'owner-1', action: 'read_file', args: { path: '.env' } });
  const transport = createHttpTransport({ baseUrl: ORIGIN, token: dev.token, fetchImpl: loopbackFetch(handler) });

  const out = await runOnce({ transport, ctx, runJob });
  assert.equal(out.status, 'failed');
  assert.equal(out.code, 'DENIED');
  const view = queue.status('owner-1', id);
  assert.equal(view.error.code, 'DENIED');
  assert.ok(!JSON.stringify(view).includes('SECRET=1'));
});

test('runOnce is idle when nothing is queued', async () => {
  const root = makeRepo();
  const { queue } = makeQueue();
  const dev = queue.issueDevice('owner-1');
  const transport = createHttpTransport({ baseUrl: ORIGIN, token: dev.token, fetchImpl: loopbackFetch(createBridgeHandler(queue)) });
  assert.deepEqual(await runOnce({ transport, ctx: createContext(root), runJob }), { idle: true });
});

test('a queue error is surfaced by the transport as a typed error', async () => {
  const { queue } = makeQueue();
  const dev = queue.issueDevice('owner-1');
  const transport = createHttpTransport({ baseUrl: ORIGIN, token: dev.token, fetchImpl: loopbackFetch(createBridgeHandler(queue)) });
  await assert.rejects(transport.complete('missing', {}), (e) => e instanceof BridgeError && e.code === 'TRANSPORT_NOT_HOLDER');
});

test('queue errors are typed', () => {
  const { queue } = makeQueue();
  try {
    queue.enqueue({ ownerId: 'u', action: 'commit' });
    assert.fail('expected error');
  } catch (err) {
    assert.ok(err instanceof QueueError);
    assert.equal(err.code, 'NOT_ALLOWED');
  }
});
