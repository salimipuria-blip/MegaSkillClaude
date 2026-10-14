import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { liveness, readiness, fullHealth } from './health.mjs';
import { CircuitBreaker, retryWithBackoff, isTransientStatus } from './resilience.mjs';
import { recordRequest, snapshot, prometheusText } from './metrics.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('liveness never depends on config', () => {
  assert.equal(liveness().status, 'ok');
  assert.equal(readiness({}).ready, false);
});

test('readiness requires token + owner, and conversations when required', () => {
  const env = { TELEGRAM_BOT_TOKEN: 't', ALLOWED_USER_ID: '42', CONVERSATIONS: {}, REQUIRE_CONVERSATIONS: 'true' };
  assert.equal(readiness(env).ready, true);
  assert.equal(readiness({ ...env, CONVERSATIONS: undefined }).ready, false);
  // No secret values leak into the report.
  assert.equal(JSON.stringify(fullHealth(env)).includes('t'.repeat(2)) && JSON.stringify(fullHealth(env)).includes('"t"'), false);
});

test('retry: transient failures are retried with capped backoff, auth errors are not', async () => {
  const sleeps = [];
  let calls = 0;
  const out = await retryWithBackoff(async () => {
    calls += 1;
    if (calls < 3) { const e = new Error('busy'); e.status = 429; throw e; }
    return 'ok';
  }, { retries: 3, baseMs: 100, sleep: async (ms) => sleeps.push(ms), random: () => 0 });
  assert.equal(out, 'ok'); assert.equal(calls, 3); assert.deepEqual(sleeps, [50, 100]);

  let authCalls = 0;
  await assert.rejects(retryWithBackoff(async () => {
    authCalls += 1; const e = new Error('no'); e.status = 401; throw e;
  }, { sleep: async () => {} }));
  assert.equal(authCalls, 1);
  assert.equal(isTransientStatus(503), true); assert.equal(isTransientStatus(403), false);
});

test('circuit breaker opens after threshold and recovers after cooldown', async () => {
  let now = 0;
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: () => now });
  await assert.rejects(cb.exec(async () => { throw new Error('x'); }));
  await assert.rejects(cb.exec(async () => { throw new Error('x'); }));
  assert.equal(cb.state, 'open');
  await assert.rejects(cb.exec(async () => 'never'), (e) => e.code === 'CIRCUIT_OPEN');
  now = 1001; assert.equal(cb.state, 'half-open');
  assert.equal(await cb.exec(async () => 'back'), 'back'); assert.equal(cb.state, 'closed');
});

test('metrics render as Prometheus text and JSON snapshot', () => {
  recordRequest(false); recordRequest(true);
  const snap = snapshot();
  assert.ok(snap.requests_total >= 2 && snap.errors_total >= 1);
  assert.match(prometheusText(), /hermes_requests_total \d+/);
});

test('guard: all transitive local .mjs imports from entry/worker are bundled in conversation.test.mjs', () => {
  const visited = new Set();
  const queue = ['entry.mjs', 'worker.mjs'];
  const importRegex = /(?:import|export)\s+(?:(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))\s+from\s+)?['"](\.\/[^'"]+\.mjs)['"]/g;

  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const fullPath = join(here, file);
    if (!existsSync(fullPath)) continue;
    const content = readFileSync(fullPath, 'utf8');
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const dep = match[1].replace('./', '');
      if (!visited.has(dep)) {
        queue.push(dep);
      }
    }
  }

  const conversationTestContent = readFileSync(join(here, 'conversation.test.mjs'), 'utf8');
  const matchModules = conversationTestContent.match(/workerModuleNames\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(matchModules, 'workerModuleNames array must exist in conversation.test.mjs');
  const declaredNames = new Set(
    matchModules[1]
      .split(',')
      .map((s) => s.replace(/['"\s]/g, ''))
      .filter(Boolean)
  );

  for (const dep of visited) {
    const baseName = dep.replace(/\.mjs$/, '');
    assert.ok(
      declaredNames.has(baseName),
      `Transitive dependency "${dep}" is imported by worker but missing from conversation.test.mjs workerModuleNames bundle!`
    );
  }
});

