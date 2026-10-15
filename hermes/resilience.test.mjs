import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithTimeout, retryWithBackoff, CircuitBreaker, isTransientStatus } from './resilience.mjs';

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
