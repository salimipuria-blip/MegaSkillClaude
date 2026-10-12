// node --test hermes/  (Node 20+, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { webhookSecret, appKey, chunks, MODELS, CF_MODELS } from './worker.mjs';
import { hashPassword } from './auth.mjs';
import { USERS } from './users.mjs';

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

test('weather endpoint needs the key and falls back to Tehran', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ current: { temperature_2m: 21.4, weather_code: 0 } }));
  assert.equal((await callApi(baseEnv(), '/api/weather', undefined, 'nope')).status, 401);
  assert.deepEqual((await callApi(baseEnv(), '/api/weather')).body, { city: 'Tehran', temp: 21.4, code: 0 });
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

// ── Team accounts ──
USERS.tester = { name: 'Tester', role: 'member', salt: 'salt-t', hash: await hashPassword('pass-1234', 'salt-t') };
USERS.boss = { name: 'Boss', role: 'admin', salt: 'salt-b', hash: await hashPassword('boss-5678', 'salt-b') };

async function loginAs(env, username, password) {
  const res = await worker.fetch(new Request('https://x.workers.dev/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
  }), env, {});
  return { status: res.status, body: await res.json() };
}

test('team login: wrong password is refused, then too many tries are throttled', async () => {
  const env = baseEnv();
  assert.equal((await loginAs(env, 'tester', 'nope')).status, 401);
  assert.equal((await loginAs(env, 'ghost', 'nope')).status, 401);
  for (let i = 0; i < 8; i++) await loginAs(env, 'tester', 'nope');
  assert.equal((await loginAs(env, 'tester', 'pass-1234')).status, 429);
});

test('team member chats with private memory and a personal system prompt', async () => {
  const env = baseEnv();
  const calls = mockFetch();
  const { status, body } = await loginAs(env, 'Tester', 'pass-1234');
  assert.equal(status, 200);
  assert.deepEqual(body.user, { username: 'tester', name: 'Tester', role: 'member' });
  assert.deepEqual((await callApi(env, '/api/me', undefined, body.token)).body, body.user);
  const res = await callApi(env, '/api/chat', { message: 'سلام' }, body.token);
  assert.equal(res.body.reply, 'سلام پوریا');
  assert.ok(env.MEMORY.store.has('history:user:tester'));
  assert.equal(env.MEMORY.store.has(`history:${OWNER}`), false);
  const gemini = calls.find((c) => c.url.includes('generativelanguage'));
  assert.match(gemini.body.systemInstruction.parts[0].text, /talking with Tester/);
  assert.equal((await callApi(env, '/api/team', undefined, body.token)).status, 403);
});

test('tampered or foreign session tokens are rejected', async () => {
  const env = baseEnv();
  const { body } = await loginAs(env, 'tester', 'pass-1234');
  const [u, exp, sig] = body.token.split('.');
  assert.equal((await callApi(env, '/api/me', undefined, `boss.${exp}.${sig}`)).status, 401);
  assert.equal((await callApi(env, '/api/me', undefined, `${u}.${Number(exp) + 1}.${sig}`)).status, 401);
  assert.equal((await callApi({ ...env, TELEGRAM_BOT_TOKEN: '2:other' }, '/api/me', undefined, body.token)).status, 401);
});

test('admin sees the team; members can change their password', async () => {
  const env = baseEnv();
  const admin = (await loginAs(env, 'boss', 'boss-5678')).body.token;
  const team = await callApi(env, '/api/team', undefined, admin);
  assert.ok(team.body.team.some((m) => m.username === 'tester' && !('hash' in m)));
  const token = (await loginAs(env, 'tester', 'pass-1234')).body.token;
  assert.equal((await callApi(env, '/api/password', { old: 'wrong', new: 'new-pass-99' }, token)).status, 401);
  assert.equal((await callApi(env, '/api/password', { old: 'pass-1234', new: 'short' }, token)).status, 400);
  assert.equal((await callApi(env, '/api/password', { old: 'pass-1234', new: 'new-pass-99' }, token)).status, 200);
  assert.equal((await loginAs(env, 'tester', 'pass-1234')).status, 401);
  assert.equal((await loginAs(env, 'tester', 'new-pass-99')).status, 200);
});
