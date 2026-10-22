import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithTimeout, retryWithBackoff, CircuitBreaker, isTransientStatus, ServicePark, isAuthStatus, PARK_THRESHOLD, PARK_MS } from './resilience.mjs';
import { askProviders } from './providers.mjs';

test('fetchWithTimeout returns the response on success', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('ok', { status: 200 });
  try {
    const res = await fetchWithTimeout('https://example.com', {}, 1000);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  } finally { globalThis.fetch = original; }
});

test('fetchWithTimeout aborts when the upstream hangs', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    if (init && init.signal) init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  try {
    await assert.rejects(fetchWithTimeout('https://example.com', {}, 20), /aborted|timeout/i);
  } finally { globalThis.fetch = original; }
});

test('fetchWithTimeout passes through an already-aborted signal', async () => {
  const original = globalThis.fetch;
  const ac = new AbortController(); ac.abort();
  globalThis.fetch = async (_url, init) => {
    if (init.signal.aborted) throw new Error('aborted');
    return new Response('ok');
  };
  try {
    await assert.rejects(fetchWithTimeout('https://example.com', { signal: ac.signal }, 1000), /aborted/);
  } finally { globalThis.fetch = original; }
});

test('fetchWithTimeout with non-positive timeout disables the timer', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('ok');
  try {
    const res = await fetchWithTimeout('https://example.com', {}, 0);
    assert.equal(res.status, 200);
  } finally { globalThis.fetch = original; }
});

// A KV binding shaped like the Workers one (env.MEMORY): get/put/delete over a Map.
function kv() {
  const store = new Map();
  return {
    store,
    async get(key, type) { const value = store.get(key); return value == null ? null : type === 'json' ? JSON.parse(value) : value; },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
  };
}

test('task 20: three consecutive auth failures park a service in KV for one hour', async () => {
  let now = 1_000;
  const memory = kv();
  const park = new ServicePark({ kv: memory, now: () => now });
  assert.equal(isAuthStatus(401), true); assert.equal(isAuthStatus(403), true); assert.equal(isAuthStatus(429), false);

  assert.equal(await park.parked('Groq'), null);
  for (let round = 1; round < PARK_THRESHOLD; round++) {
    const after = await park.failAuth('Groq', 401);
    assert.equal(after.failures, round);
    assert.equal(after.parked, false, `failure ${round} must not park yet`);
    assert.equal(await park.parked('Groq'), null);
  }
  const third = await park.failAuth('Groq', 403);
  assert.equal(third.failures, PARK_THRESHOLD);
  assert.equal(third.parked, true);
  assert.equal(third.parkedUntil, now + PARK_MS);

  const record = JSON.parse(memory.store.get('service-park:Groq'));
  assert.equal(record.failures, 3);
  assert.equal(record.reason, 'HTTP 403', 'the reason is the status, never the key');
  assert.equal(memory.store.has('service-park:Groq'), true, 'the park lives in KV, so it survives a new isolate');

  // still parked one millisecond before the hour is up, and free right after
  now += PARK_MS - 1;
  assert.ok(await park.parked('Groq'));
  now += 2;
  assert.equal(await park.parked('Groq'), null);
});

test('task 20: a success clears the counter, so only consecutive failures park a service', async () => {
  const memory = kv();
  const park = new ServicePark({ kv: memory });
  await park.failAuth('Groq', 401);
  await park.failAuth('Groq', 401);
  await park.succeed('Groq');
  assert.equal(memory.store.has('service-park:Groq'), false, 'a working answer wipes the record');
  await park.failAuth('Groq', 401);
  await park.failAuth('Groq', 401);
  assert.equal(await park.parked('Groq'), null, 'two fresh failures are not three consecutive ones');
});

test('task 20: ServicePark refuses to run without a KV binding and survives a broken one', async () => {
  assert.throws(() => new ServicePark({}), /KV binding/);
  assert.throws(() => new ServicePark({ kv: kv(), threshold: 0 }), /positive integer/);
  assert.throws(() => new ServicePark({ kv: kv(), parkMs: -1 }), /positive number/);
  const broken = { async get() { throw new Error('kv down'); }, async put() { throw new Error('kv down'); } };
  const park = new ServicePark({ kv: broken });
  assert.equal(await park.parked('Groq'), null, 'an unreadable KV must not block an answer');
  assert.deepEqual((await park.failAuth('Groq', 401)).failures, 1, 'an unwritable KV must not throw either');
});

test('task 20: askProviders stops calling a provider whose key was rejected three times', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }),
      { status: 401, headers: { 'content-type': 'application/json' } });
  };
  try {
    const env = { GROQ_API_KEY: 'k', FREE_TEXT: 'off', MEMORY: kv() };
    const contents = [{ role: 'user', parts: [{ text: 'سلام' }] }];
    for (let round = 1; round <= PARK_THRESHOLD; round++) {
      const before = calls;
      await assert.rejects(askProviders(env, contents, 'sys'), /کلید پذیرفته نشد \(401\)/);
      assert.ok(calls > before, `round ${round}: the provider must still be tried before it is parked`);
    }
    assert.equal(JSON.parse(env.MEMORY.store.get('service-park:Groq')).failures, PARK_THRESHOLD);

    const before = calls;
    await assert.rejects(askProviders(env, contents, 'sys'), /3 بار پشت‌سرهم رد شد/);
    assert.equal(calls, before, 'a parked service must not be called at all — that is the whole point');
    assert.equal(await askProviders(env, contents, 'sys').catch((e) => e.message.split(':')[0]), 'Groq');
  } finally { globalThis.fetch = original; }
});

test('task 20: a parked provider is tried again after the hour, and one good answer clears it', async () => {
  const original = globalThis.fetch;
  let answer = false;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (answer) return new Response(JSON.stringify({ choices: [{ message: { content: 'جواب' }, finish_reason: 'stop' }] }));
    return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }),
      { status: 401, headers: { 'content-type': 'application/json' } });
  };
  try {
    const env = { GROQ_API_KEY: 'k', FREE_TEXT: 'off', MEMORY: kv() };
    const contents = [{ role: 'user', parts: [{ text: 'سلام' }] }];
    // Parked with the real clock, because askProviders builds its own ServicePark on Date.now().
    const park = new ServicePark({ kv: env.MEMORY });
    for (let round = 0; round < PARK_THRESHOLD; round++) await park.failAuth('Groq', 401);
    assert.ok(await park.parked('Groq'));

    const before = calls;
    await assert.rejects(askProviders(env, contents, 'sys'), /3 بار پشت‌سرهم رد شد/);
    assert.equal(calls, before, 'while parked, not one outbound call is spent on this key');

    // An hour later: the stored expiry is in the past, which is all the real clock would change.
    answer = true;
    const record = JSON.parse(env.MEMORY.store.get('service-park:Groq'));
    env.MEMORY.store.set('service-park:Groq',
      JSON.stringify({ ...record, parkedUntil: Date.now() - 1000 }));
    assert.equal(await park.parked('Groq'), null, 'the park expired');
    assert.equal(await askProviders(env, contents, 'sys'), 'جواب');
    assert.ok(calls > before, 'after the hour the provider is used again');
    assert.equal(env.MEMORY.store.has('service-park:Groq'), false, 'the good answer cleared the record');
  } finally { globalThis.fetch = original; }
});
