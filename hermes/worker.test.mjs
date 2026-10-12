// node --test hermes/  (Node 20+, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { webhookSecret, appKey, chunks, MODELS, CF_MODELS } from './worker.mjs';

const OWNER = '123456789';
const baseEnv = () => ({ TELEGRAM_BOT_TOKEN: '1:abc', GEMINI_API_KEY: 'g', ALLOWED_USER_ID: OWNER, MEMORY: kv() });

function kv() {
  const store = new Map();
  return {
    store,
    async get(k, type) { const v = store.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}

function mockFetch(geminiStatuses = [200]) {
  const calls = [];
  let g = 0;
  globalThis.fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    if (String(url).includes('generativelanguage')) {
      const status = geminiStatuses[Math.min(g++, geminiStatuses.length - 1)];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'سلام پوریا' }] } }] }), { status });
    }
    return new Response(JSON.stringify({ ok: true, result: { username: 'hermes_bot' } }));
  };
  return calls;
}

async function post(env, update, secret) {
  const pending = [];
  const req = new Request('https://hermes.example.workers.dev/telegram', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret ?? await webhookSecret(env) },
    body: JSON.stringify(update),
  });
  const res = await worker.fetch(req, env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return res;
}

const message = (text, from = OWNER) => ({ message: { chat: { id: 42 }, from: { id: Number(from) }, text } });
const sent = (calls) => calls.filter((c) => c.url.endsWith('/sendMessage')).map((c) => c.body.text);

test('rejects webhook calls without the secret header', async () => {
  const calls = mockFetch();
  const res = await post(baseEnv(), message('hi'), 'wrong');
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test('strangers get a refusal and Gemini is never called', async () => {
  const calls = mockFetch();
  await post(baseEnv(), message('hi', '999'));
  assert.equal(calls.some((c) => c.url.includes('generativelanguage')), false);
  assert.match(sent(calls)[0], /خصوصی/);
});

test('owner message is answered and stored in memory', async () => {
  const env = baseEnv();
  const calls = mockFetch();
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls), ['سلام پوریا']);
  const history = JSON.parse(env.MEMORY.store.get('history:42'));
  assert.deepEqual(history.map((m) => m.role), ['user', 'model']);
  const gem = calls.find((c) => c.url.includes('generativelanguage'));
  assert.equal(JSON.stringify(gem).includes('1:abc'), false, 'bot token must not reach Gemini');
});

test('falls back to the next model on 404 and remembers it', async () => {
  const env = baseEnv();
  const calls = mockFetch([404, 200]);
  await post(env, message('سلام'));
  const models = calls.filter((c) => c.url.includes('generativelanguage')).map((c) => c.url.split('/models/')[1].split(':')[0]);
  assert.deepEqual(models, MODELS.slice(0, 2));
  assert.equal(env.MEMORY.store.get('model'), MODELS[1]);
});

test('quota errors are reported to the owner, not thrown', async () => {
  const calls = mockFetch([429]);
  await post(baseEnv(), message('سلام'));
  assert.match(sent(calls)[0], /سهمیه/);
});

test('/reset clears history', async () => {
  const env = baseEnv();
  env.MEMORY.store.set('history:42', '[]');
  mockFetch();
  await post(env, message('/reset'));
  assert.equal(env.MEMORY.store.has('history:42'), false);
});

test('works without a MEMORY binding', async () => {
  const env = { ...baseEnv(), MEMORY: undefined };
  const calls = mockFetch();
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls), ['سلام پوریا']);
});

test('setup registers the webhook with the derived secret', async () => {
  const env = baseEnv();
  const calls = mockFetch();
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/setup'), env, {});
  assert.equal(res.status, 200);
  const hook = calls.find((c) => c.url.endsWith('/setWebhook'));
  assert.equal(hook.body.url, 'https://hermes.example.workers.dev/telegram');
  assert.equal(hook.body.secret_token, await webhookSecret(env));
  assert.equal((await res.text()).includes('1:abc'), false);
});

test('home page registers the webhook once, then only reports status', async () => {
  const env = baseEnv();
  let calls = mockFetch();
  await worker.fetch(new Request('https://hermes.example.workers.dev/'), env, {});
  assert.ok(calls.some((c) => c.url.endsWith('/setWebhook')));
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/getWebhookInfo')) {
      return new Response(JSON.stringify({ ok: true, result: { url: 'https://hermes.example.workers.dev/telegram' } }));
    }
    throw new Error(`unexpected call ${url}`);
  };
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/'), env, {});
  assert.match(await res.text(), /connected/);
});

test('setup lists missing secrets by name only', async () => {
  mockFetch();
  const res = await worker.fetch(new Request('https://x.workers.dev/setup'), { GEMINI_API_KEY: 'g' }, {});
  assert.equal(res.status, 400);
  assert.match(await res.text(), /TELEGRAM_BOT_TOKEN, ALLOWED_USER_ID/);
});

function fakeAI(reply = 'سلام از کلادفلر') {
  const calls = [];
  return { calls, async run(model, input) { calls.push({ model, input }); return { response: reply }; } };
}

test('without a Gemini key the bot answers with Workers AI', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, AI: fakeAI() };
  const calls = mockFetch();
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls), ['سلام از کلادفلر']);
  assert.equal(calls.some((c) => c.url.includes('generativelanguage')), false);
  assert.equal(env.AI.calls[0].model, CF_MODELS[0]);
  assert.equal(env.AI.calls[0].input.messages[0].role, 'system');
});

test('a rejected Gemini key falls back to Workers AI', async () => {
  const env = { ...baseEnv(), AI: fakeAI() };
  const calls = mockFetch([403]);
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls), ['سلام از کلادفلر']);
});

test('Workers AI falls through to the next model when the first one fails', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, AI: {
    calls: [],
    async run(model) { this.calls.push(model); if (model === CF_MODELS[0]) throw new Error('down'); return { response: 'ok' }; },
  } };
  const calls = mockFetch();
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls), ['ok']);
  assert.deepEqual(env.AI.calls, CF_MODELS);
});

test('setup accepts the AI binding instead of a Gemini key', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, AI: fakeAI() };
  mockFetch();
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/setup'), env, {});
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Workers AI/);
});

async function callApi(env, path, body, key) {
  const req = new Request(`https://hermes.example.workers.dev${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${key ?? await appKey(env)}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await worker.fetch(req, env, {});
  return { status: res.status, body: await res.json() };
}

test('web app page and assets are served', async () => {
  for (const [path, type] of [['/app', 'text/html'], ['/manifest.webmanifest', 'application/manifest+json'], ['/icon.svg', 'image/svg+xml']]) {
    const res = await worker.fetch(new Request(`https://x.workers.dev${path}`), baseEnv(), {});
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').startsWith(type));
  }
});

test('api rejects a wrong key', async () => {
  mockFetch();
  const res = await callApi(baseEnv(), '/api/chat', { message: 'hi' }, 'nope');
  assert.equal(res.status, 401);
});

test('web chat replies and shares memory with the owner Telegram chat', async () => {
  const env = baseEnv();
  mockFetch();
  const res = await callApi(env, '/api/chat', { message: 'سلام' });
  assert.deepEqual(res, { status: 200, body: { reply: 'سلام پوریا' } });
  const stored = JSON.parse(env.MEMORY.store.get(`history:${OWNER}`));
  assert.equal(stored.length, 2);
  const hist = await callApi(env, '/api/history');
  assert.deepEqual(hist.body.messages.map((m) => m.role), ['user', 'assistant']);
  await callApi(env, '/api/reset', {});
  assert.equal(env.MEMORY.store.has(`history:${OWNER}`), false);
});

test('/app in Telegram sends the private link with the derived key', async () => {
  const env = baseEnv();
  const calls = mockFetch();
  await post(env, message('/app'));
  assert.ok(sent(calls)[0].includes(`https://hermes.example.workers.dev/app#k=${await appKey(env)}`));
});

test('long replies are split under the Telegram limit', () => {
  const parts = chunks('x'.repeat(9000));
  assert.equal(parts.length, 3);
  assert.ok(parts.every((p) => p.length <= 4000));
});
