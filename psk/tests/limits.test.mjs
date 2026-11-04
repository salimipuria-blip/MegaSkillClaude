import test from 'node:test';
import assert from 'node:assert/strict';
import {clientId, consume, rateLimit, resetRateLimits, DEFAULT_LIMITS} from '../api/_limits.mjs';
import health from '../api/health.js';

function res() {
  return {
    statusCode: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(n) { this.statusCode = n; return this; },
    json(v) { this.body = v; return this; },
  };
}

test('clientId prefers the headers Vercel sets and falls back safely', () => {
  assert.equal(clientId({headers: {'x-vercel-forwarded-for': '203.0.113.9, 10.0.0.1'}}), '203.0.113.9');
  assert.equal(clientId({headers: {'x-real-ip': '198.51.100.7'}}), '198.51.100.7');
  assert.equal(clientId({headers: {'x-forwarded-for': '192.0.2.5, 10.1.1.1'}}), '192.0.2.5');
  assert.equal(clientId({socket: {remoteAddress: '::1'}}), '::1');
  assert.equal(clientId({}), 'unknown');
  assert.equal(clientId(undefined), 'unknown');
});

test('consume allows exactly `limit` requests per window and then refuses', () => {
  const store = new Map();
  const now = 1_000_000;
  for (let i = 1; i <= 3; i++) {
    const r = consume('k', {limit: 3, windowMs: 60_000, now, store});
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, 3 - i);
  }
  const blocked = consume('k', {limit: 3, windowMs: 60_000, now: now + 1_000, store});
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 60);
});

test('the window resets after windowMs and separate keys are independent', () => {
  const store = new Map();
  const t0 = 5_000_000;
  consume('a', {limit: 1, windowMs: 1_000, now: t0, store});
  assert.equal(consume('a', {limit: 1, windowMs: 1_000, now: t0 + 10, store}).allowed, false);
  assert.equal(consume('b', {limit: 1, windowMs: 1_000, now: t0 + 10, store}).allowed, true);
  assert.equal(consume('a', {limit: 1, windowMs: 1_000, now: t0 + 1_001, store}).allowed, true);
});

test('rateLimit writes standard headers and a JSON 429 body', () => {
  const store = new Map();
  const r1 = res();
  assert.equal(rateLimit({headers: {'x-real-ip': '198.51.100.1'}}, r1, 'tasks', {store, now: 1, env: {'PSK_RATE_LIMIT_TASKS': '2'}}), true);
  assert.equal(r1.headers['X-RateLimit-Limit'], '2');
  assert.equal(r1.headers['X-RateLimit-Remaining'], '1');
  assert.equal(rateLimit({headers: {'x-real-ip': '198.51.100.1'}}, res(), 'tasks', {store, now: 2, env: {'PSK_RATE_LIMIT_TASKS': '2'}}), true);
  const r3 = res();
  assert.equal(rateLimit({headers: {'x-real-ip': '198.51.100.1'}}, r3, 'tasks', {store, now: 3, env: {'PSK_RATE_LIMIT_TASKS': '2'}}), false);
  assert.equal(r3.statusCode, 429);
  assert.equal(r3.body.error, 'Too many requests');
  assert.ok(Number(r3.headers['Retry-After']) >= 1);
  assert.equal(r3.body.limit, 2);
});

test('scopes do not share a bucket for the same client', () => {
  const store = new Map();
  const env = {'PSK_RATE_LIMIT_HEALTH': '1', 'PSK_RATE_LIMIT_TASKS': '1'};
  const req = {headers: {'x-real-ip': '203.0.113.77'}};
  assert.equal(rateLimit(req, res(), 'health', {store, now: 1, env}), true);
  assert.equal(rateLimit(req, res(), 'tasks', {store, now: 1, env}), true);
  assert.equal(rateLimit(req, res(), 'health', {store, now: 2, env}), false);
});

test('the bucket store is pruned so a long-lived instance cannot grow without bound', () => {
  const store = new Map();
  for (let i = 0; i < 12_000; i++) consume(`bulk-${i}`, {limit: 5, windowMs: 1_000, now: 1, store});
  assert.ok(store.size <= 10_001, `store grew to ${store.size}`);
  consume('later', {limit: 5, windowMs: 1_000, now: 1_000_000, store});
  assert.ok(store.size <= 10_001);
});

test('the health endpoint answers 429 (not 401) once the bucket is empty, i.e. limits apply before auth', () => {
  const previous = process.env.ENGINE_TOKEN;
  const previousLimit = process.env.PSK_RATE_LIMIT_HEALTH;
  process.env.ENGINE_TOKEN = 'test-example-token-1234567890123456';
  process.env.PSK_RATE_LIMIT_HEALTH = '2';
  resetRateLimits();
  const req = {method: 'GET', headers: {'x-real-ip': '192.0.2.42'}};
  try {
    const first = res(); health(req, first);
    assert.equal(first.statusCode, 401, 'unauthenticated call is answered by guard, but counted');
    const second = res(); health(req, second);
    assert.equal(second.statusCode, 401);
    const third = res(); health(req, third);
    assert.equal(third.statusCode, 429);
    assert.equal(third.body.error, 'Too many requests');
  } finally {
    if (previous === undefined) delete process.env.ENGINE_TOKEN; else process.env.ENGINE_TOKEN = previous;
    if (previousLimit === undefined) delete process.env.PSK_RATE_LIMIT_HEALTH; else process.env.PSK_RATE_LIMIT_HEALTH = previousLimit;
    resetRateLimits();
  }
});

test('documented defaults are conservative and non-zero', () => {
  for (const [scope, cfg] of Object.entries(DEFAULT_LIMITS)) {
    assert.ok(cfg.limit > 0 && cfg.limit <= 200, `${scope} limit sane`);
    assert.equal(cfg.windowMs, 60_000, `${scope} window is one minute`);
  }
});

test('rateLimit honours the windowMs override — regression for the dead test seam', () => {
  // 2026-11-04: `windowMs ?? opts.windowMs` made DEFAULT_LIMITS always win and the
  // override never reached consume(); the bucket used to reset after 60s here.
  const store = new Map();
  const req = {headers: {'x-real-ip': '203.0.113.9'}};
  const res = () => { const h = {}; return {h, setHeader: (k, v) => { h[k] = v; }, status: () => ({json: () => {}})}; };
  assert.equal(rateLimit(req, res(), 'tasks', {store, now: 10_000, windowMs: 250}), true);
  const bucket = store.get('tasks:203.0.113.9');
  assert.equal(bucket.resetAt - 10_000, 250, 'override must reach the bucket, not the default 60_000');
  // same key inside the short window is limited; after it, allowed again
  assert.equal(rateLimit(req, res(), 'tasks', {store, now: 10_100, windowMs: 250, env: {PSK_RATE_LIMIT_TASKS: '1'}}), false);
  assert.equal(rateLimit(req, res(), 'tasks', {store, now: 10_251, windowMs: 250, env: {PSK_RATE_LIMIT_TASKS: '1'}}), true);
});
