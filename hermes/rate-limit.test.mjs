import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumeFixedWindow} from './rate-limit.mjs';

function memory({failGet = false, failPut = false} = {}) {
  const values = new Map();
  return {
    values,
    async get(key) {
      if (failGet) throw new Error('KV read failed');
      return values.get(key) ?? null;
    },
    async put(key, value, options) {
      if (failPut) throw new Error('KV write failed');
      values.set(key, value);
      this.lastPut = {key, value, options};
    },
  };
}

test('fixed-window limiter allows up to the limit, then returns retry timing', async () => {
  const kv = memory();
  const options = {limit: 2, windowSeconds: 60, now: 61_000};

  const first = await consumeFixedWindow(kv, 'booking', '203.0.113.7', options);
  const second = await consumeFixedWindow(kv, 'booking', '203.0.113.7', options);
  const third = await consumeFixedWindow(kv, 'booking', '203.0.113.7', options);

  assert.deepEqual(
    [first.status, first.remaining, second.status, second.remaining, third.status],
    ['allowed', 1, 'allowed', 0, 'limited'],
  );
  assert.equal(third.retryAfterSeconds, 59);
  assert.equal(kv.lastPut.options.expirationTtl, 60);
});

test('counter is isolated by identity, namespace, and fixed-window boundary', async () => {
  const kv = memory();
  const base = {limit: 1, windowSeconds: 60, now: 119_000};

  assert.equal((await consumeFixedWindow(kv, 'booking', '203.0.113.7', base)).allowed, true);
  assert.equal((await consumeFixedWindow(kv, 'booking', '203.0.113.7', base)).status, 'limited');
  assert.equal((await consumeFixedWindow(kv, 'booking', '203.0.113.8', base)).allowed, true);
  assert.equal((await consumeFixedWindow(kv, 'login', '203.0.113.7', base)).allowed, true);
  assert.equal((await consumeFixedWindow(kv, 'booking', '203.0.113.7', {...base, now: 120_000})).allowed, true);
  assert.ok([...kv.values.keys()].every((key) => !key.includes('203.0.113.7')));
});

test('missing storage and KV failures fail closed', async () => {
  assert.equal((await consumeFixedWindow(null, 'booking', 'ip', {limit: 1, windowSeconds: 60})).status, 'unavailable');
  assert.equal((await consumeFixedWindow(memory({failGet: true}), 'booking', 'ip', {limit: 1, windowSeconds: 60})).status, 'unavailable');
  assert.equal((await consumeFixedWindow(memory({failPut: true}), 'booking', 'ip', {limit: 1, windowSeconds: 60})).status, 'unavailable');
});

test('malformed counters fail closed instead of resetting the quota', async () => {
  const kv = memory();
  const options = {limit: 2, windowSeconds: 60, now: 61_000};
  const accepted = await consumeFixedWindow(kv, 'booking', '203.0.113.7', options);
  const key = [...kv.values.keys()][0];
  kv.values.set(key, 'not-a-counter');
  const rejected = await consumeFixedWindow(kv, 'booking', '203.0.113.7', options);

  assert.equal(accepted.allowed, true);
  assert.equal(rejected.status, 'unavailable');
});

test('invalid limiter configuration is rejected', async () => {
  await assert.rejects(
    consumeFixedWindow(memory(), 'Booking', 'ip', {limit: 1, windowSeconds: 60}),
    /namespace/,
  );
  await assert.rejects(
    consumeFixedWindow(memory(), 'booking', 'ip', {limit: 0, windowSeconds: 60}),
    /limit/,
  );
});
