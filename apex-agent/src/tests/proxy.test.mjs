// The optional LLM proxy. It holds a server-side key, so every guard here is the difference between
// a proxy and an open relay somebody else pays for. Tested against the shared handler that both the
// Netlify function and the Vercel edge function export.
import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../netlify/functions/llm.mjs';

const SECRET = 'proxy-token-for-tests';
const UPSTREAM_KEY = 'sk-upstream-secret-key';

const call = async ({ method = 'POST', headers = {}, body = '{}', env = {} } = {}) => {
  const saved = { ...process.env };
  process.env.APEX_PROXY_TOKEN = env.token === null ? '' : env.token ?? SECRET;
  process.env.APEX_UPSTREAM_KEY = env.key === null ? '' : env.key ?? UPSTREAM_KEY;
  if (env.token === null) delete process.env.APEX_PROXY_TOKEN;
  if (env.key === null) delete process.env.APEX_UPSTREAM_KEY;
  try {
    const request = new Request('https://proxy.example/api/llm', {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: method === 'GET' ? undefined : body,
    });
    const res = await handler(request);
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, json: safeJson(text) };
  } finally {
    process.env = saved;
  }
};

const safeJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

test('the proxy refuses to act as an open relay', async () => {
  assert.equal((await call({ method: 'GET' })).status, 405, 'only POST is proxied');

  const off = await call({ env: { token: null } });
  assert.equal(off.status, 503);
  assert.match(off.text, /APEX_PROXY_TOKEN/, 'a disabled proxy says which variable is missing');

  assert.equal((await call({ headers: { 'x-apex-token': 'wrong' } })).status, 401, 'a wrong token is rejected');
  assert.equal((await call({})).status, 401, 'a missing token is rejected');

  const noUpstream = await call({ headers: { 'x-apex-token': SECRET } });
  assert.equal(noUpstream.status, 400);

  const plain = await call({
    headers: { 'x-apex-token': SECRET, 'x-apex-upstream': 'http://api.openai.com/v1/chat/completions' },
  });
  assert.equal(plain.status, 403, 'plain http is refused');

  const evil = await call({ headers: { 'x-apex-token': SECRET, 'x-apex-upstream': 'https://evil.example/v1' } });
  assert.equal(evil.status, 403);
  assert.match(evil.text, /هاست مجاز نیست/);

  const huge = await call({
    headers: { 'x-apex-token': SECRET, 'x-apex-upstream': 'https://api.openai.com/v1/chat/completions' },
    body: JSON.stringify({ pad: 'x'.repeat(513 * 1024) }),
  });
  assert.equal(huge.status, 413, 'a giant body is refused');
});

test('a valid request is forwarded with the server key and without leaking it', async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const res = await call({
      headers: { 'x-apex-token': SECRET, 'x-apex-upstream': 'https://api.openai.com/v1/chat/completions' },
      body: JSON.stringify({ model: 'm', messages: [] }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-apex-proxy'), '1');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.ok(!res.text.includes(UPSTREAM_KEY), 'the upstream key must never reach the browser');

    assert.equal(seen.length, 1, 'exactly one upstream call');
    assert.equal(seen[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(seen[0].init.headers.authorization, `Bearer ${UPSTREAM_KEY}`, 'the key goes in the header');
    assert.match(seen[0].init.body, /"model":"m"/, 'the body is forwarded unchanged');

    // Anthropic wants its own header; Google wants the key in the query string.
    seen.length = 0;
    await call({ headers: { 'x-apex-token': SECRET, 'x-apex-upstream': 'https://api.anthropic.com/v1/messages' } });
    assert.equal(seen[0].init.headers['x-api-key'], UPSTREAM_KEY);
    assert.equal(seen[0].init.headers['anthropic-version'], '2023-06-01');

    seen.length = 0;
    await call({
      headers: {
        'x-apex-token': SECRET,
        'x-apex-upstream': 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent',
      },
    });
    assert.match(seen[0].url, /key=/, 'the google key is a query parameter');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('an upstream failure is explained, and a key is never echoed back', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error(`connect ECONNREFUSED with ${UPSTREAM_KEY}`);
  };
  try {
    const res = await call({
      headers: { 'x-apex-token': SECRET, 'x-apex-upstream': 'https://api.openai.com/v1/chat/completions' },
    });
    assert.equal(res.status, 502);
    assert.match(res.json?.error || '', /بالادست/);
    assert.ok(!res.text.includes(UPSTREAM_KEY), 'the upstream key leaked through an error message');
  } finally {
    globalThis.fetch = realFetch;
  }
});
