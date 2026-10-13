// node --test hermes/  (Node 20+, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { webhookSecret, appKey, setupKey, chunks, MODELS, CF_MODELS } from './worker.mjs';
import { imageRequest, IMAGE_MODEL } from './image.mjs';
import { hashPassword } from './auth.mjs';
import { USERS } from './users.mjs';
import { loadLog, loadNotes, addNote, appendTurn, archiveAndClear, clearNotes } from './memory.mjs';

const OWNER = '123456789';
const baseEnv = () => ({ FREE_TEXT: 'off', TELEGRAM_BOT_TOKEN: '1:abc', GEMINI_API_KEY: 'g', ALLOWED_USER_ID: OWNER, MEMORY: kv() });

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
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : init ? init.body : null;
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

const message = (text, from = OWNER) => ({ message: { chat: { id: Number(from), type: 'private' }, from: { id: Number(from) }, text } });
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
  const history = JSON.parse(env.MEMORY.store.get(`history:${OWNER}`));
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

test('a model whose free quota is full hands over to the next Gemini model, not to Workers AI', async () => {
  const env = { ...baseEnv(), AI: { run: async () => { throw new Error('Workers AI must not be used'); } } };
  const calls = mockFetch([429, 429, 200]);
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls), ['سلام پوریا']);
  assert.equal(env.MEMORY.store.get('model'), MODELS[1]);
});

test('/reset clears history', async () => {
  const env = baseEnv();
  env.MEMORY.store.set(`history:${OWNER}`, '[]');
  mockFetch();
  await post(env, message('/reset'));
  assert.equal(env.MEMORY.store.has(`history:${OWNER}`), false);
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
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/setup', { method: 'POST', headers: { authorization: `Bearer ${await setupKey(env)}` } }), env, {});
  assert.equal(res.status, 200);
  const hook = calls.find((c) => c.url.endsWith('/setWebhook'));
  assert.equal(hook.body.url, 'https://hermes.example.workers.dev/telegram');
  assert.equal(hook.body.secret_token, await webhookSecret(env));
  assert.equal((await res.text()).includes('1:abc'), false);
});

test('public home is read-only and makes no Telegram calls', async () => {
  const calls = mockFetch();
  for (let i = 0; i < 2; i++) {
    const res = await worker.fetch(new Request('https://hermes.example.workers.dev/'), baseEnv(), {});
    assert.equal(res.status, 200);
    assert.match(await res.text(), /running/);
  }
  assert.equal(calls.length, 0);
});

test('authorized setup lists missing model configuration by name only', async () => {
  const calls = mockFetch();
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined };
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/setup', { method: 'POST', headers: { authorization: `Bearer ${await setupKey(env)}` } }), env, {});
  assert.equal(res.status, 400);
  assert.match(await res.text(), /GEMINI_API_KEY/);
  assert.equal(calls.length, 0);
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
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/setup', { method: 'POST', headers: { authorization: `Bearer ${await setupKey(env)}` } }), env, {});
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
  assert.deepEqual(body.user, { username: 'tester', name: 'Tester', role: 'member', locks: [] });
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

test('locked abilities are refused before the AI is called; the owner has no locks', async () => {
  USERS.nov = { name: 'NoViking', role: 'admin', locks: ['viking'], salt: 'salt-v', hash: await hashPassword('nov-pass-1', 'salt-v') };
  USERS.nofj = { name: 'NoFJ', role: 'member', locks: ['fjcod'], salt: 'salt-f', hash: await hashPassword('nofj-pass-1', 'salt-f') };
  const env = baseEnv();
  const calls = mockFetch();
  const nov = (await loginAs(env, 'nov', 'nov-pass-1')).body;
  assert.deepEqual(nov.user.locks, ['viking']);
  const refused = await callApi(env, '/api/chat', { message: 'متن معرفی تور آخر هفته بنویس' }, nov.token);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.locked, 'viking');
  assert.equal(calls.some((c) => c.url.includes('generativelanguage')), false);
  assert.equal((await callApi(env, '/api/chat', { message: 'وضعیت FJCod چیه؟' }, nov.token)).status, 200);
  assert.equal((await callApi(env, '/api/chat', { message: 'یک دستور پخت بده' }, nov.token)).status, 200);
  const gemini = calls.filter((c) => c.url.includes('generativelanguage')).pop();
  assert.match(gemini.body.systemInstruction.parts[0].text, /NO access to: Viking Offroad/);
  const nofj = (await loginAs(env, 'nofj', 'nofj-pass-1')).body.token;
  assert.equal((await callApi(env, '/api/chat', { message: 'fj-cod data' }, nofj)).status, 403);
  assert.equal((await callApi(env, '/api/chat', { message: 'تور آفرود' }, nofj)).status, 200);
  const owner = await callApi(env, '/api/chat', { message: 'FJCod و تور وایکینگ' });
  assert.equal(owner.status, 200);
  assert.deepEqual((await callApi(env, '/api/me')).body.locks, []);
});

// ── Permanent memory ──
test('memory keeps every message; the AI sees only recent ones, without extra fields', async () => {
  const env = baseEnv();
  const old = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', parts: [{ text: `m${i}` }], t: i }));
  env.MEMORY.store.set(`history:${OWNER}`, JSON.stringify(old));
  const calls = mockFetch();
  await post(env, message('سلام'));
  const stored = JSON.parse(env.MEMORY.store.get(`history:${OWNER}`));
  assert.equal(stored.length, 62);
  assert.equal(stored[0].parts[0].text, 'm0');
  const sentContents = calls.find((c) => c.url.includes('generativelanguage')).body.contents;
  assert.equal(sentContents.length, 41);
  assert.ok(sentContents.every((c) => !('t' in c)));
  assert.match(calls.find((c) => c.url.includes('generativelanguage')).body.systemInstruction.parts[0].text, /PLAYBOOKS/);
});

test('/reset archives the conversation instead of deleting it', async () => {
  const env = baseEnv();
  env.MEMORY.store.set(`history:${OWNER}`, JSON.stringify([{ role: 'user', parts: [{ text: 'کهنه' }] }]));
  const calls = mockFetch();
  await post(env, message('/reset'));
  assert.equal(env.MEMORY.store.has(`history:${OWNER}`), false);
  const archived = [...env.MEMORY.store.keys()].filter((k) => k.startsWith(`archive:history:${OWNER}:`));
  assert.equal(archived.length, 1);
  assert.match(env.MEMORY.store.get(archived[0]), /کهنه/);
  assert.match(sent(calls)[0], /بایگانی/);
});

test('"یادت باشه" saves a long-term note that reaches later prompts; /notes and /forget manage it', async () => {
  const env = baseEnv();
  let calls = mockFetch();
  await post(env, message('یادت باشه: تور بعدی ۲۵ آبان به دماوند است'));
  assert.deepEqual(JSON.parse(env.MEMORY.store.get(`notes:history:${OWNER}`)), ['تور بعدی ۲۵ آبان به دماوند است']);
  calls = mockFetch();
  await post(env, message('تور بعدی کی است؟'));
  const sys = calls.find((c) => c.url.includes('generativelanguage')).body.systemInstruction.parts[0].text;
  assert.match(sys, /LONG-TERM NOTES[\s\S]*دماوند/);
  calls = mockFetch();
  await post(env, message('/notes'));
  assert.match(sent(calls)[0], /دماوند/);
  await post(env, message('/forget'));
  assert.equal(env.MEMORY.store.has(`notes:history:${OWNER}`), false);
});

test('web notes endpoints and archived reset work for team members too', async () => {
  const env = baseEnv();
  mockFetch();
  const token = (await loginAs(env, 'tester', 'pass-1234')).body.token;
  await callApi(env, '/api/chat', { message: 'remember that I prefer short answers' }, token);
  assert.deepEqual((await callApi(env, '/api/notes', undefined, token)).body.notes, ['I prefer short answers']);
  await callApi(env, '/api/reset', {}, token);
  assert.ok([...env.MEMORY.store.keys()].some((k) => k.startsWith('archive:history:user:tester:')));
  assert.deepEqual((await callApi(env, '/api/notes', undefined, token)).body.notes, ['I prefer short answers']);
  await callApi(env, '/api/notes/clear', {}, token);
  assert.deepEqual((await callApi(env, '/api/notes', undefined, token)).body.notes, []);
});

// ── Mega Skills routing ──
import { buildPostings, tokens, relevantSkills, shardOf } from './skill-router.mjs';

function fakeAssets(skills, docs) {
  const shards = buildPostings(skills);
  const files = new Map([['skills/meta.json', JSON.stringify({ total: skills.length })]]);
  shards.forEach((sh, n) => files.set(`skills/t/${n}.json`, JSON.stringify(sh)));
  docs.forEach((d, id) => files.set(`skills/s/${id}.md`, `# ${skills[id].name}\n${d}`));
  return { fetch: async (req) => {
    const p = new URL(req.url).pathname.slice(1);
    return files.has(p) ? new Response(files.get(p)) : new Response('', { status: 404 });
  } };
}

const LIB = [
  { name: 'instagram-caption-writer', triggers: ['instagram caption', 'کپشن اینستاگرام', 'نوشتن کپشن'] },
  { name: 'desert-tour-planner', triggers: ['desert tour plan', 'برنامه تور کویر', 'سفر کویر'] },
  { name: 'csv-cleaner', triggers: ['clean csv data', 'python csv'] },
  { name: 'constructor-guide', triggers: ['javascript constructor pattern'] },
];

test('skill router: Persian aliases, no prototype collisions, stable shards', () => {
  assert.ok(tokens('یک کپشن اینستاگرام بنویس').has('instagram'));
  assert.ok(tokens('constructor toString').has('constructor'));
  assert.equal(shardOf('instagram'), shardOf('instagram'));
  assert.doesNotThrow(() => buildPostings([{ name: 'x', triggers: ['constructor __proto__ hasOwnProperty'] }]));
});

test('relevant skills are injected into the prompt; chit-chat gets none', async () => {
  const env = { ...baseEnv(), ASSETS: fakeAssets(LIB, ['HOOK FIRST, then CTA.', 'Carry water.', 'Use pandas.', 'Use class.']) };
  const picked = await relevantSkills(env, 'برای تور کویر سه روزه برنامه سفر بده');
  assert.equal(picked[0].name, 'desert-tour-planner');
  assert.deepEqual(await relevantSkills(env, 'سلام خوبی؟'), []);
  const calls = mockFetch();
  await post(env, message('یک کپشن اینستاگرام جذاب برای عکس جدیدم بنویس'));
  const sys = calls.find((c) => c.url.includes('generativelanguage')).body.systemInstruction.parts[0].text;
  assert.match(sys, /SPECIALIZED SKILLS[\s\S]*instagram-caption-writer[\s\S]*HOOK FIRST/);
});

test('skill routing failures never break chat', async () => {
  const env = { ...baseEnv(), ASSETS: { fetch: async () => { throw new Error('boom'); } } };
  const calls = mockFetch();
  await post(env, message('یک کپشن اینستاگرام جذاب بنویس'));
  assert.deepEqual(sent(calls), ['سلام پوریا']);
});

// Security regressions: never publish owner credentials or private replies outside a DM.
test('group/channel messages, including /app and /notes, are ignored without outbound calls', async () => {
  for (const type of ['group', 'supergroup', 'channel']) {
    for (const text of ['/app', '/notes', 'یادت باشه: خصوصی', 'سلام']) {
      const env = baseEnv(), calls = mockFetch();
      const update = message(text);
      update.message.chat = { id: -100123, type };
      await post(env, update);
      assert.equal(calls.length, 0);
      assert.equal(env.MEMORY.store.size, 0);
    }
  }
});

test('a private chat id that does not belong to the verified sender is ignored', async () => {
  const env = baseEnv(), calls = mockFetch(), update = message('/app');
  update.message.chat.id = 999;
  await post(env, update);
  assert.equal(calls.length, 0);
});

test('previous owner links are revoked by the v2 key derivation', async () => {
  const env = baseEnv();
  const old = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`app:${env.TELEGRAM_BOT_TOKEN}`));
  const oldKey = [...new Uint8Array(old)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  assert.notEqual(oldKey, await appKey(env));
  assert.equal((await callApi(env, '/api/history', undefined, oldKey)).status, 401);
});

test('two concurrent legacy/local turns do not overwrite each other', async () => {
  const env = baseEnv();
  mockFetch();
  const results = await Promise.all([
    callApi(env, '/api/chat', { message: 'first' }), callApi(env, '/api/chat', { message: 'second' }),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(JSON.parse(env.MEMORY.store.get(`history:${OWNER}`)).length, 4);
});

test('configured deployments fail closed for every memory operation if the binding is absent', async () => {
  const env = { ...baseEnv(), REQUIRE_CONVERSATIONS: 'true' };
  const key = `history:${OWNER}`;
  env.MEMORY.store.set(key, JSON.stringify([{ role: 'user', parts: [{ text: 'preserve me' }] }]));
  env.MEMORY.store.set(`notes:${key}`, JSON.stringify(['preserve my note']));
  const before = [...env.MEMORY.store.entries()];
  const calls = mockFetch();
  for (const required of ['true', true]) {
    env.REQUIRE_CONVERSATIONS = required;
    for (const [path, body] of [['/api/chat', { message: 'hello' }], ['/api/history'], ['/api/reset', {}], ['/api/notes'], ['/api/notes/clear', {}]]) {
      const res = await callApi(env, path, body);
      assert.equal(res.status, 503);
      assert.match(res.body.error, /CONVERSATIONS/);
    }
    for (const operation of [() => loadLog(env, key), () => loadNotes(env, key), () => addNote(env, key, 'new'),
      () => appendTurn(env, key, [], 'hello', 'reply'), () => archiveAndClear(env, key), () => clearNotes(env, key)]) {
      await assert.rejects(operation, /CONVERSATIONS/);
    }
  }
  assert.equal(calls.length, 0);
  assert.deepEqual([...env.MEMORY.store.entries()], before);
});


test('incomplete skills are packaged but never appear in runtime token postings', () => {
  const shards = buildPostings([
    { name: 'safe-guide', triggers: ['safe guide'] },
    { name: 'broken-guide', triggers: ['broken guide'], incomplete: true },
  ]);
  const postings = shards.flatMap((shard) => Object.values(shard));
  assert.ok(postings.some((ids) => ids.includes(0)));
  assert.ok(postings.every((ids) => !ids.includes(1)));
});


test('setup rejects unauthenticated, app and webhook credentials before any upstream call', async () => {
  const env = baseEnv();
  const calls = mockFetch();
  for (const credential of ['', 'Bearer wrong', `Bearer ${await appKey(env)}`, `Bearer ${await webhookSecret(env)}`, `Bearer ${await setupKey({ ...env, ALLOWED_USER_ID: 'another-owner' })}`]) {
    const res = await worker.fetch(new Request('https://hermes.example.workers.dev/setup', { method: 'POST', headers: { authorization: credential } }), env, {});
    assert.equal(res.status, 403);
  }
  assert.equal(calls.length, 0);
});

test('setup is POST-only even for an authorized owner', async () => {
  const env = baseEnv();
  const calls = mockFetch();
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const res = await worker.fetch(new Request('https://hermes.example.workers.dev/setup', { method, headers: { authorization: `Bearer ${await setupKey(env)}` } }), env, {});
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');
  }
  assert.equal(calls.length, 0);
});

test('setup fails closed when owner configuration is absent', async () => {
  const calls = mockFetch();
  for (const env of [{}, { TELEGRAM_BOT_TOKEN: 'fixture-secret' }, { ALLOWED_USER_ID: OWNER }]) {
    const res = await worker.fetch(new Request('https://hermes.example.workers.dev/setup', { method: 'POST' }), env, {});
    assert.equal(res.status, 503);
    assert.equal(await res.text(), 'not configured');
  }
  assert.equal(calls.length, 0);
});

// Image generation: FLUX on Workers AI, prompt rewritten to English by the text brain.
function imageAI() {
  const calls = [];
  return { calls, async run(model, input) {
    calls.push({ model, input });
    return model === IMAGE_MODEL ? { image: btoa('jpeg-bytes') } : { response: 'misty forest lake, ultra realistic' };
  } };
}

test('image requests are recognised in Persian and with /img', () => {
  assert.equal(imageRequest('عکس بساز: کمپ کنار دریاچه'), 'کمپ کنار دریاچه');
  assert.equal(imageRequest('یه عکس بساز از جنگل پاییزی'), 'از جنگل پاییزی');
  assert.equal(imageRequest('تصویر بساز دریاچه'), 'دریاچه');
  assert.equal(imageRequest('/img a jeep in snow'), 'a jeep in snow');
  assert.equal(imageRequest('عکس بساز'), '');
  assert.equal(imageRequest('این عکس رو ببین'), null);
  assert.equal(imageRequest('سلام'), null);
});

test('Telegram: «عکس بساز» sends a generated photo and keeps the prompt in memory', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, AI: imageAI() };
  const calls = mockFetch();
  await post(env, message('عکس بساز: کمپ کنار دریاچه در جنگل'));
  const photo = calls.find((c) => c.url.endsWith('/sendPhoto'));
  assert.ok(photo, 'sendPhoto called');
  assert.equal(photo.body.get('chat_id'), OWNER);
  assert.equal(photo.body.get('caption'), 'misty forest lake, ultra realistic');
  const img = env.AI.calls.find((c) => c.model === IMAGE_MODEL);
  assert.equal(img.input.prompt, 'misty forest lake, ultra realistic');
  const log = JSON.parse(env.MEMORY.store.get(`history:${OWNER}`));
  assert.match(log[1].parts[0].text, /عکس ساخته شد/);
});

test('web app: image request returns a data URL; empty request asks for a description', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, AI: imageAI() };
  mockFetch();
  const res = await callApi(env, '/api/chat', { message: 'عکس بساز: جیپ در برف' });
  assert.equal(res.status, 200);
  assert.match(res.body.image, /^data:image\/jpeg;base64,/);
  assert.equal((await callApi(env, '/api/chat', { message: 'عکس بساز' })).status, 400);
});

test('without Gemini, the AI binding and the free image service, image requests fail with a clear message', async () => {
  mockFetch();
  const res = await callApi({ ...baseEnv(), GEMINI_API_KEY: undefined, FREE_IMAGES: 'off' }, '/api/chat', { message: 'عکس بساز: دریاچه' });
  assert.equal(res.status, 502);
  assert.match(res.body.error, /Workers AI/);
});

function geminiImageFetch(imageStatus = 200) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, body: init && typeof init.body === 'string' ? JSON.parse(init.body) : init ? init.body : null });
    if (u.endsWith('/models?pageSize=1000')) return new Response(JSON.stringify({ models: [
      { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] },
      { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
    ] }));
    if (u.includes('-image:generateContent')) {
      return imageStatus === 200
        ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: btoa('png') } }] } }] }))
        : new Response('{}', { status: imageStatus });
    }
    if (u.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'autumn forest lake' }] } }] }));
    return new Response(JSON.stringify({ ok: true }));
  };
  return calls;
}

test('without Cloudflare image models, Gemini image models are used, newest version first', async () => {
  const env = { ...baseEnv() };
  const calls = geminiImageFetch();
  const res = await callApi(env, '/api/chat', { message: 'عکس بساز: دریاچه پاییزی' });
  assert.equal(res.status, 200);
  assert.match(res.body.image, /^data:image\/png;base64,/);
  assert.match(res.body.reply, /gemini-3\.5-flash-image/);
  const imageCall = calls.find((c) => c.url.includes('-image:generateContent'));
  assert.match(imageCall.url, /gemini-3\.5-flash-image/);
  assert.deepEqual(imageCall.body.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
  assert.equal(await env.MEMORY.get('image-model'), 'gemini-3.5-flash-image');
});

test('best free Cloudflare model first (FLUX.2 dev, multipart, 4:5 for a post); cheaper ones when it fails', async () => {
  const png = new Uint8Array(200); png[0] = 0x89; png[1] = 0x50;
  const runs = [];
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, AI: { async run(model, input) {
    runs.push({ model, input });
    if (model.includes('flux-2-dev')) return { image: btoa(String.fromCharCode(...png)) };
    return { response: 'prompt' };
  } } };
  mockFetch();
  const res = await callApi(env, '/api/chat', { message: 'عکس بساز: پست اینستاگرام جیپ در جنگل' });
  assert.equal(res.status, 200);
  assert.match(res.body.reply, /flux-2-dev/);
  assert.match(res.body.image, /^data:image\/png;base64,/);
  const dev = runs.find((r) => r.model.includes('flux-2-dev'));
  const form = await new Response(dev.input.multipart.body, { headers: { 'content-type': dev.input.multipart.contentType } }).formData();
  assert.equal(form.get('width'), '1024');
  assert.equal(form.get('height'), '1280');

  const runs2 = [];
  const env2 = { ...env, AI: { async run(model, input) {
    runs2.push(model);
    if (model.includes('flux-2-dev') || model.includes('lucid')) throw new Error('daily free allocation exceeded');
    if (model.includes('phoenix')) return new Response(png).body;
    return { response: 'prompt' };
  } } };
  const res2 = await callApi(env2, '/api/chat', { message: 'عکس بساز: کمپ' });
  assert.match(res2.body.reply, /phoenix-1\.0/);
  assert.deepEqual(runs2.filter((m) => m.includes('flux-2-dev') || m.includes('leonardo')),
    ['@cf/black-forest-labs/flux-2-dev', '@cf/leonardo/lucid-origin', '@cf/leonardo/phoenix-1.0']);
});

test('when the better models are out, FLUX.1 schnell still makes the image', async () => {
  const env = { ...baseEnv(), AI: imageAI() };
  geminiImageFetch(429);
  const res = await callApi(env, '/api/chat', { message: 'عکس بساز: جیپ در جنگل' });
  assert.equal(res.status, 200);
  assert.match(res.body.image, /^data:image\/jpeg;base64,/);
  assert.match(res.body.reply, /flux/);
});

// Voice, photos and Google Search.
function mediaFetch({ gemini = 'جواب هرمس', grounding = null, searchStatus = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url: u, body });
    if (u.endsWith('/getFile')) {
      const path = body.file_id.startsWith('v') ? 'voice/file_1.oga' : 'photos/file_2.jpg';
      return new Response(JSON.stringify({ ok: true, result: { file_path: path } }));
    }
    if (u.includes('/file/bot')) return new Response(new Uint8Array([1, 2, 3, 4]));
    if (u.includes('generativelanguage')) {
      if (body.tools && searchStatus !== 200) return new Response('{}', { status: searchStatus });
      const isTranscribe = body.contents.at(-1).parts.some((p) => p.text && p.text.startsWith('Transcribe'));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: isTranscribe ? 'فردا هوا چطوره' : gemini }] },
        ...(grounding ? { groundingMetadata: grounding } : {}) }] }));
    }
    return new Response(JSON.stringify({ ok: true }));
  };
  return calls;
}
const gem = (calls) => calls.filter((c) => c.url.includes('generativelanguage'));

test('Telegram voice is transcribed and answered, transcript shown first', async () => {
  const env = baseEnv();
  const calls = mediaFetch();
  await post(env, { message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) }, voice: { file_id: 'v1', mime_type: 'audio/ogg' } } });
  const audio = gem(calls)[0].body.contents[0].parts[0].inlineData;
  assert.equal(audio.mimeType, 'audio/ogg');
  assert.equal(gem(calls)[0].body.tools, undefined, 'no search for transcription');
  assert.deepEqual(sent(calls), ['🎙️ «فردا هوا چطوره»\n\nجواب هرمس']);
  assert.equal(JSON.parse(env.MEMORY.store.get(`history:${OWNER}`))[0].parts[0].text, 'فردا هوا چطوره');
});

test('voice falls back to Whisper on Workers AI without Gemini', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, AI: { calls: [], async run(model, input) {
    this.calls.push({ model, input }); return model.includes('whisper') ? { text: 'سلام' } : { response: 'سلام از کلادفلر' }; } } };
  const calls = mediaFetch();
  await post(env, { message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) }, voice: { file_id: 'v1' } } });
  assert.equal(env.AI.calls[0].model, '@cf/openai/whisper-large-v3-turbo');
  assert.deepEqual(sent(calls), ['🎙️ «سلام»\n\nسلام از کلادفلر']);
});

test('Telegram photo is shown to Gemini with its caption and kept in memory as text', async () => {
  const env = baseEnv();
  const calls = mediaFetch({ gemini: 'یک جیپ در جنگل' });
  await post(env, { message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) }, caption: 'کپشن بنویس',
    photo: [{ file_id: 'p-small' }, { file_id: 'p-big' }] } });
  assert.equal(calls.find((c) => c.url.endsWith('/getFile')).body.file_id, 'p-big');
  const parts = gem(calls)[0].body.contents.at(-1).parts;
  assert.equal(parts[0].inlineData.mimeType, 'image/jpeg');
  assert.equal(parts[1].text, 'کپشن بنویس');
  assert.deepEqual(sent(calls), ['یک جیپ در جنگل']);
  const log = JSON.parse(env.MEMORY.store.get(`history:${OWNER}`));
  assert.equal(log[0].parts[0].text, '[عکس] کپشن بنویس');
  assert.equal(JSON.stringify(log).includes('inlineData'), false);
});

test('photo without Gemini: Workers AI describes it, then the text brain answers', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, AI: { calls: [], async run(model, input) {
    this.calls.push({ model, input }); return model.includes('llava') ? { description: 'a jeep in a forest' } : { response: 'جیپ در جنگل' }; } } };
  const calls = mediaFetch();
  await post(env, { message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) }, photo: [{ file_id: 'p1' }] } });
  assert.equal(env.AI.calls[0].model, '@cf/llava-hf/llava-1.5-7b-hf');
  assert.match(env.AI.calls[1].input.messages.at(-1).content, /a jeep in a forest/);
  assert.deepEqual(sent(calls), ['جیپ در جنگل']);
});

test('Gemini answers with Google Search and lists sources', async () => {
  const env = baseEnv();
  const calls = mediaFetch({ gemini: 'دلار امروز ...', grounding: { groundingChunks: [{ web: { uri: 'https://example.com/a', title: 'example.com' } }] } });
  await post(env, message('قیمت دلار امروز؟'));
  assert.deepEqual(gem(calls)[0].body.tools, [{ google_search: {} }]);
  assert.deepEqual(sent(calls), ['دلار امروز ...\n\nمنابع:\n• example.com: https://example.com/a']);
});

test('a model that rejects the search tool is retried without it', async () => {
  const env = baseEnv();
  const calls = mediaFetch({ searchStatus: 400 });
  await post(env, message('سلام'));
  assert.equal(gem(calls).length, 2);
  assert.equal(gem(calls)[1].body.tools, undefined);
  assert.deepEqual(sent(calls), ['جواب هرمس']);
});

test('web app: transcribe endpoint and photo chat', async () => {
  const env = baseEnv();
  const calls = mediaFetch();
  const t = await callApi(env, '/api/transcribe', { audio: 'data:audio/webm;codecs=opus;base64,AAAA' });
  assert.equal(t.status, 200);
  assert.equal(t.body.text, 'فردا هوا چطوره');
  assert.equal(gem(calls)[0].body.contents[0].parts[0].inlineData.mimeType, 'audio/webm');
  assert.equal((await callApi(env, '/api/transcribe', { audio: 'data:image/png;base64,AAAA' })).status, 400);
  const c = await callApi(env, '/api/chat', { image: 'data:image/jpeg;base64,AAAA' });
  assert.equal(c.status, 200);
  assert.equal(c.body.reply, 'جواب هرمس');
  assert.equal(gem(calls).at(-1).body.contents.at(-1).parts[0].inlineData.mimeType, 'image/jpeg');
  assert.equal((await callApi(env, '/api/chat', { message: 'x', image: 'data:text/html;base64,AAAA' })).status, 400);
});

// Google connectors (owner only): OAuth connect flow and Gemini function calling.
const gEnv = () => ({ ...baseEnv(), GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret' });
function googleFetch({ geminiSteps }) {
  const calls = [];
  let step = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url: u, body, headers: init.headers || {} });
    if (u === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify(body.grant_type === 'authorization_code'
        ? { access_token: 'at1', refresh_token: 'rt1', expires_in: 3600 } : { access_token: 'at2', expires_in: 3600 }));
    }
    if (u.includes('/gmail/v1/users/me/messages?')) return new Response(JSON.stringify({ messages: [{ id: 'm1' }] }));
    if (u.includes('/gmail/v1/users/me/messages/m1')) return new Response(JSON.stringify({ snippet: 'tour booking',
      labelIds: ['UNREAD'], payload: { headers: [{ name: 'From', value: 'ali@x.com' }, { name: 'Subject', value: 'رزرو' }, { name: 'Date', value: 'Mon' }] } }));
    if (u.includes('/gmail/v1/users/me/drafts')) return new Response(JSON.stringify({ id: 'd1' }));
    if (u.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: geminiSteps[Math.min(step++, geminiSteps.length - 1)] } }] }));
    return new Response(JSON.stringify({ ok: true }));
  };
  return calls;
}

test('Google connect: one-time link from /google, state-checked callback stores the refresh token', async () => {
  const env = gEnv();
  const calls = googleFetch({ geminiSteps: [[{ text: 'x' }]] });
  assert.equal((await worker.fetch(new Request('https://h.workers.dev/connect/google'), env, {})).status, 403);
  assert.equal((await worker.fetch(new Request(`https://h.workers.dev/connect/google?t=${'a'.repeat(32)}`), env, {})).status, 403);
  await post(env, message('/google'));
  const link = sent(calls)[0].match(/https:\/\/\S+\/connect\/google\?t=[0-9a-f]{32}/)[0];
  const startUrl = link.replace(/^https:\/\/[^/]+/, 'https://h.workers.dev');
  const start = await worker.fetch(new Request(startUrl), env, {});
  assert.equal(start.status, 302);
  assert.equal((await worker.fetch(new Request(startUrl), env, {})).status, 403, 'connect link is single-use');
  const to = new URL(start.headers.get('location'));
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(to.searchParams.get('redirect_uri'), 'https://h.workers.dev/connect/google/callback');
  assert.match(to.searchParams.get('scope'), /gmail\.readonly.*calendar\.events.*spreadsheets/);
  assert.equal(to.searchParams.get('access_type'), 'offline');
  const bad = await worker.fetch(new Request('https://h.workers.dev/connect/google/callback?code=c&state=nope'), env, {});
  assert.equal(bad.status, 400);
  const ok = await worker.fetch(new Request(`https://h.workers.dev/connect/google/callback?code=c1&state=${to.searchParams.get('state')}`), env, {});
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /وصل شد/);
  assert.equal(env.MEMORY.store.get('google:refresh'), 'rt1');
  assert.equal(calls.find((c) => c.url.includes('oauth2')).body.code, 'c1');
  const replay = await worker.fetch(new Request(`https://h.workers.dev/connect/google/callback?code=c1&state=${to.searchParams.get('state')}`), env, {});
  assert.equal(replay.status, 400, 'state is single-use');
});

test('/google without client secrets explains what to set', async () => {
  const env = baseEnv();
  const calls = googleFetch({ geminiSteps: [[{ text: 'x' }]] });
  await post(env, message('/google'));
  assert.match(sent(calls)[0], /GOOGLE_CLIENT_ID/);
});

test('owner asks about email: Gemini calls gmail_search, gets the result, then answers', async () => {
  const env = gEnv();
  env.MEMORY.store.set('google:refresh', 'rt1');
  const calls = googleFetch({ geminiSteps: [
    [{ functionCall: { name: 'gmail_search', args: { query: 'is:unread newer_than:1d' } } }],
    [{ text: 'یک ایمیل رزرو از علی داری.' }],
  ] });
  await post(env, message('ایمیل‌های امروزم رو چک کن'));
  const gem = calls.filter((c) => c.url.includes('generativelanguage'));
  assert.equal(gem.length, 2);
  assert.ok(gem[0].body.tools.some((t) => t.functionDeclarations && t.functionDeclarations.some((d) => d.name === 'gmail_draft')));
  const fr = gem[1].body.contents.at(-1).parts[0].functionResponse;
  assert.equal(fr.name, 'gmail_search');
  assert.equal(fr.response.result.messages[0].subject, 'رزرو');
  assert.equal(calls.find((c) => c.url.includes('/gmail/v1/')).headers.authorization, 'Bearer at2');
  assert.match(calls.find((c) => c.url.includes('/messages?')).url, /q=is%3Aunread/);
  assert.deepEqual(sent(calls), ['یک ایمیل رزرو از علی داری.']);
});

test('gmail_draft only drafts (UTF-8 subject), and team members never get Google tools', async () => {
  const env = gEnv();
  env.MEMORY.store.set('google:refresh', 'rt1');
  const calls = googleFetch({ geminiSteps: [
    [{ functionCall: { name: 'gmail_draft', args: { to: 'ali@x.com', subject: 'تایید رزرو', body: 'سلام علی' } } }],
    [{ text: 'پیش‌نویس ساخته شد.' }],
  ] });
  await post(env, message('یه جواب برای علی بنویس'));
  const draft = calls.find((c) => c.url.includes('/drafts'));
  const raw = atob(draft.body.message.raw.replace(/-/g, '+').replace(/_/g, '/'));
  assert.match(raw, /^To: ali@x\.com\r\nSubject: =\?UTF-8\?B\?/);
  assert.equal(calls.some((c) => c.url.includes('gmail') && c.url.includes('/send')), false);

  USERS.tester = { name: 'Tester', role: 'member', locks: [], salt: 's', hash: await hashPassword('pw-123456', 's') };
  const login = await worker.fetch(new Request('https://h.workers.dev/api/login', { method: 'POST', body: JSON.stringify({ username: 'tester', password: 'pw-123456' }) }), env, {});
  const { token } = await login.json();
  const calls2 = googleFetch({ geminiSteps: [[{ text: 'سلام' }]] });
  await callApi(env, '/api/chat', { message: 'ایمیل‌هام' }, token);
  const gem = calls2.filter((c) => c.url.includes('generativelanguage'));
  assert.equal(JSON.stringify(gem[0].body.tools || []).includes('functionDeclarations'), false);
  delete USERS.tester;
});

test('natural image requests anywhere in the sentence are recognised; questions about photos are not', () => {
  for (const t of ['یه عکس از جنگل پاییزی با جیپ بساز', 'یک تصویر خفن از پدل سواری بده', 'پوستر تور آخر هفته رو طراحی کن',
    'یه عکس بفرست از کمپ', 'make me a cool poster for the tour']) assert.equal(imageRequest(t), t);
  for (const t of ['کپشن برای این عکس بنویس', 'این عکس رو ببین چیه', 'میخوام عکس پست بذارم چه کپشنی خوبه',
    'عکس پروفایلمو چطور عوض کنم', 'بهترین ساعت عکاسی چیه']) assert.equal(imageRequest(t), null);
});

// Bookings: public form → team Telegram with ✅/❌ → traveller sees payment info only after approval.
function bookingFetch() {
  const calls = [];
  let msgId = 100;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url: u, body });
    if (u.endsWith('/getMe')) return new Response(JSON.stringify({ ok: true, result: { username: 'Pouragent_bot' } }));
    if (u.endsWith('/sendMessage')) return new Response(JSON.stringify({ ok: true, result: { chat: { id: body.chat_id }, message_id: msgId++ } }));
    return new Response(JSON.stringify({ ok: true }));
  };
  return calls;
}
const book = (env, body, ip = '1.2.3.4') => worker.fetch(new Request('https://h.workers.dev/api/booking', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }), env, {});
const okBody = { name: 'سارا', phone: '۰۹۱۲ ۳۴۵ ۶۷۸۹', count: '۲', car: 'خودروی شخصی', note: 'گیاهخوارم', agree: true };

test('trip page is public and has the booking form', async () => {
  const res = await worker.fetch(new Request('https://h.workers.dev/trip'), baseEnv(), {});
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /\/api\/booking/);
  assert.match(html, /کنسلی و برگشت وجه نداره/);
  assert.match(html, /ig\.me\/m\/viking\.offroad/);
});

test('booking is sent privately only to the owner (not other admins), with no payment info; bad input is refused', async () => {
  const env = { ...baseEnv(), BOOKING_ADMIN_IDS: '555, 42' };
  const calls = bookingFetch();
  assert.equal((await book(env, { ...okBody, agree: false })).status, 400);
  assert.equal((await book(env, { ...okBody, phone: '12' })).status, 400);
  const noCar = await book(env, { ...okBody, car: '' });
  assert.equal(noCar.status, 200, 'car choice is optional');
  calls.length = 0;
  const res = await book(env, okBody);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.match(data.id, /^[a-z2-9]{6}$/);
  const msgs = calls.filter((c) => c.url.endsWith('/sendMessage')).map((c) => c.body);
  assert.deepEqual(msgs.map((m) => String(m.chat_id)), [String(env.ALLOWED_USER_ID).trim()]);
  for (const m of msgs) {
    assert.match(m.text, /سارا[\s\S]*09123456789[\s\S]*2 نفر[\s\S]*خودروی شخصی/);
    assert.doesNotMatch(m.text, /پرداخت/);
    assert.equal(m.reply_markup, undefined, 'no approve/payment buttons');
  }
  assert.ok(env.MEMORY.store.get(`booking:${data.id}`));
});

test('booking rate limit: 5 per hour per IP', async () => {
  const env = baseEnv();
  bookingFetch();
  for (let i = 0; i < 5; i++) assert.equal((await book(env, okBody, '9.9.9.9')).status, 200);
  assert.equal((await book(env, okBody, '9.9.9.9')).status, 429);
  assert.equal((await book(env, okBody, '8.8.8.8')).status, 200);
});

test('owner /trip command returns the public page link', async () => {
  const calls = bookingFetch();
  await post(baseEnv(), message('/trip'));
  assert.match(sent(calls)[0], /https:\/\/hermes\.example\.workers\.dev\/trip/);
});

test('image prompt: Persian request never reaches the image model raw; vague asks become a Viking scene', async () => {
  const { imagePrompt, BRAND_SCENE } = await import('./image.mjs');
  const fails = async () => { throw new Error('down'); };
  assert.equal(await imagePrompt(fails, {}, 'یه پست واسه اینستاگرام بساز'), BRAND_SCENE);
  assert.equal(await imagePrompt(async () => '(no model)', {}, 'پست اینستا'), BRAND_SCENE);
  assert.equal(await imagePrompt(async () => 'a red jeep on a dune', {}, 'جیپ قرمز'), 'a red jeep on a dune');
  assert.equal(await imagePrompt(fails, {}, 'a red jeep'), 'a red jeep');
});

test('when every Gemini model is out of quota, the next free provider answers (bad keys are skipped)', async () => {
  const env = { ...baseEnv(), GITHUB_MODELS_TOKEN: 'bad', GROQ_API_KEY: 'k', AI: { run: async () => { throw new Error('Workers AI must not be used'); } } };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url: u, body });
    if (u.includes('generativelanguage')) return new Response('{}', { status: 429 });
    if (u.includes('models.github.ai')) return new Response('{}', { status: 401 });
    if (u.includes('api.groq.com')) return new Response(JSON.stringify({ choices: [{ message: { content: '<think>x</think>سلام از گروک' } }] }));
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls), ['سلام از گروک']);
  assert.equal(calls.filter((c) => c.url.includes('models.github.ai')).length, 1, 'a rejected key is not retried per model');
  const groq = calls.find((c) => c.url.includes('api.groq.com'));
  assert.equal(groq.body.messages[0].role, 'system');
  assert.equal(groq.body.messages.at(-1).content, 'سلام');
});

test('stale provider model names: the provider catalog is read and a live model is used and remembered', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, GROQ_API_KEY: 'k' };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url: u, body });
    if (u.endsWith('/openai/v1/models')) return new Response(JSON.stringify({ data: [{ id: 'whisper-large-v3' }, { id: 'llama-4-scout' }, { id: 'openai/gpt-oss-120b-new' }] }));
    if (u.includes('api.groq.com')) {
      return body.model === 'openai/gpt-oss-120b-new'
        ? new Response(JSON.stringify({ choices: [{ message: { content: 'جواب از مدل جدید' } }] }))
        : new Response('{}', { status: 404 });
    }
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls), ['جواب از مدل جدید']);
  assert.equal(env.MEMORY.store.get('provider-model:Groq'), 'openai/gpt-oss-120b-new');
  assert.equal(calls.some((c) => c.body && c.body.model === 'whisper-large-v3'), false, 'non-chat models are skipped');
});

test('Gemini 400 shows Google\'s own reason and every free provider\'s reason is reported', async () => {
  const env = { ...baseEnv(), GITHUB_MODELS_TOKEN: 'bad', GROQ_API_KEY: 'k' };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, body: init && typeof init.body === 'string' ? JSON.parse(init.body) : null });
    if (u.includes('generativelanguage')) return new Response(JSON.stringify({ error: { message: 'User location is not supported for the API use.' } }), { status: 400 });
    if (u.includes('models.github.ai')) return new Response('{}', { status: 401 });
    if (u.includes('api.groq.com')) return new Response('{}', { status: 429 });
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  await post(env, message('سلام'));
  const text = sent(calls).at(-1);
  assert.match(text, /User location is not supported/);
  assert.match(text, /GitHub Models: کلید پذیرفته نشد \(401\)/);
  assert.match(text, /Groq: .*429/);
});

test('a too-large prompt is trimmed and retried shorter; every failing model is listed', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, GITHUB_MODELS_TOKEN: 't', GROQ_API_KEY: 'k' };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url: u, body });
    const size = body && body.messages ? JSON.stringify(body.messages).length : 0;
    if (u.includes('models.github.ai')) return new Response(JSON.stringify({ error: { code: 'unavailable_model', message: 'Unknown model' } }), { status: 400 });
    if (u.includes('api.groq.com')) {
      return size > 9000
        ? new Response(JSON.stringify({ error: { message: 'Request too large: tokens per minute' } }), { status: 413 })
        : new Response(JSON.stringify({ choices: [{ message: { content: 'جواب کوتاه‌شده' } }] }));
    }
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  for (let i = 0; i < 12; i++) env.MEMORY.store.set(`history:${OWNER}`, JSON.stringify([...JSON.parse(env.MEMORY.store.get(`history:${OWNER}`) || '[]'),
    { role: 'user', parts: [{ text: 'س'.repeat(1500) }] }, { role: 'model', parts: [{ text: 'ج'.repeat(1500) }] }]));
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls).slice(-1), ['جواب کوتاه‌شده']);
  const groq = calls.filter((c) => c.url.includes('api.groq.com/openai/v1/chat'));
  assert.ok(JSON.stringify(groq[0].body.messages).length <= 16000, 'first try already fits the Groq budget');
  assert.ok(groq.length >= 2, 'retried after 413');
  assert.equal(groq.at(-1).body.messages.at(-1).content, 'سلام');
  assert.equal(groq.at(-1).body.messages[1].role, 'user');
});

test('GitHub Models: busy models hand over to the next one, then to more models from the catalog', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, GITHUB_MODELS_TOKEN: 't' };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url: u, body });
    if (u.endsWith('/catalog/models')) return new Response(JSON.stringify([{ id: 'openai/o3' }, { id: 'openai/text-embedding-3-large' }, { id: 'ai21-labs/AI21-Jamba-1.5-Large' }]));
    if (u.includes('models.github.ai')) {
      return body.model === 'ai21-labs/AI21-Jamba-1.5-Large'
        ? new Response(JSON.stringify({ choices: [{ message: { content: 'جواب از مدل کاتالوگ' } }] }))
        : new Response(JSON.stringify({ error: { message: 'Rate limit of 50 per 86400s exceeded' } }), { status: 429 });
    }
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls).slice(-1), ['جواب از مدل کاتالوگ']);
  const models = calls.filter((c) => c.url.includes('/inference/')).map((c) => c.body.model);
  assert.ok(models.length <= 16, 'never more than 16 calls');
  assert.equal(models.includes('openai/o3'), false, 'o-series reasoning models are skipped');
  assert.equal(models.some((m) => /embedding/.test(m)), false);
});

test('booking manager registers by sharing their own matching phone; then bookings go only to them', async () => {
  const env = { ...baseEnv(), BOOKING_ADMIN_IDS: '555' };
  const calls = bookingFetch();
  const contact = (phone, userId = 777) => ({ message: { chat: { id: 777, type: 'private' }, from: { id: 777, first_name: 'Ali' }, contact: { phone_number: phone, user_id: userId } } });
  await post(env, message('سلام', 777));
  const ask = calls.find((c) => c.url.endsWith('/sendMessage') && c.body.chat_id === 777);
  assert.equal(ask.body.reply_markup.keyboard[0][0].request_contact, true);
  await post(env, contact('+98 912 000 0000'));
  assert.equal(env.MEMORY.store.get('booking:recipient'), undefined, 'other numbers are refused');
  await post(env, contact('+989123331540', 999));
  assert.equal(env.MEMORY.store.get('booking:recipient'), undefined, 'someone else\'s contact card is refused');
  await post(env, contact('09123331540'));
  assert.equal(env.MEMORY.store.get('booking:recipient'), '777');
  calls.length = 0;
  assert.equal((await book(env, okBody)).status, 200);
  assert.deepEqual(calls.filter((c) => c.url.endsWith('/sendMessage')).map((c) => String(c.body.chat_id)), ['777']);
});

test('images: when Workers AI quota and Gemini both fail, the free no-key image service is used', async () => {
  const { makeImage } = await import('./image.mjs');
  const env = { GEMINI_API_KEY: 'bad', AI: { run: async () => { throw new Error('4006: daily free allocation used up'); } } };
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('generativelanguage')) return new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 });
    if (u.startsWith('https://image.pollinations.ai/prompt/')) return new Response(new Uint8Array(5000).fill(7), { headers: { 'content-type': 'image/jpeg' } });
    return new Response('{}', { status: 404 });
  };
  const out = await makeImage(env, 'a red jeep on a dune', { width: 1024, height: 1280 });
  assert.equal(out.mime, 'image/jpeg');
  assert.match(out.model, /Pollinations/);
  assert.ok(out.image.length > 6000);
  const free = urls.find((u) => u.includes('pollinations'));
  assert.match(free, /a%20red%20jeep%20on%20a%20dune\?width=1024&height=1280/);
  await assert.rejects(makeImage({ ...env, FREE_IMAGES: 'off' }, 'x'), /سهمیهٔ رایگان/);
});

test('no-key Pollinations text brain answers when nothing else is configured; Hugging Face images come before it', async () => {
  const env = { ...baseEnv(), GEMINI_API_KEY: undefined, FREE_TEXT: undefined };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u === 'https://text.pollinations.ai/openai') return new Response(JSON.stringify({ choices: [{ message: { content: 'سلام از پولینیشنز' } }] }));
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  await post(env, message('سلام'));
  assert.deepEqual(sent(calls.map((c) => ({ url: c.url, body: c.init && typeof c.init.body === 'string' ? JSON.parse(c.init.body) : null }))).slice(-1), ['سلام از پولینیشنز']);
  const free = calls.find((c) => c.url === 'https://text.pollinations.ai/openai');
  assert.equal(free.init.headers.authorization, undefined, 'no key is sent');

  const { makeImage } = await import('./image.mjs');
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return String(url).includes('huggingface.co')
      ? new Response(new Uint8Array(4000).fill(1), { headers: { 'content-type': 'image/jpeg' } })
      : new Response('{}', { status: 500 });
  };
  const out = await makeImage({ HF_TOKEN: 'hf' }, 'a jeep');
  assert.match(out.model, /Hugging Face FLUX\.1-schnell/);
  assert.equal(urls.some((u) => u.includes('pollinations')), false);
});

test('images: Hugging Face falls back to routed providers, and a total failure lists every source', async () => {
  const { makeImage } = await import('./image.mjs');
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/together/v1/images/generations')) return new Response(JSON.stringify({ data: [{ b64_json: 'QUJD'.repeat(500) }] }));
    if (u.includes('pollinations')) return new Response('{}', { status: 402 });
    return new Response('{}', { status: 404 });
  };
  const out = await makeImage({ HF_TOKEN: 'hf' }, 'a jeep');
  assert.match(out.model, /together/);
  globalThis.fetch = async (url) => new Response('{}', { status: String(url).includes('pollinations') ? 402 : 404 });
  const env = { HF_TOKEN: 'hf', AI: { run: async () => { throw new Error('4006: daily free allocation used up'); } } };
  await assert.rejects(makeImage(env, 'a jeep'), (err) => /Cloudflare: 4006/.test(err.message) &&
    /Hugging Face: FLUX\.1-schnell 404/.test(err.message) && /together 404/.test(err.message) && /Pollinations: 402/.test(err.message));
});


test('private-chat safeguards also cover the new voice, photo and contact handlers', async () => {
  const payloads = [{ voice: { file_id: 'fixture-voice' } }, { photo: [{ file_id: 'fixture-photo' }] },
    { contact: { user_id: Number(OWNER), phone_number: 'fixture-phone' } }];
  for (const type of ['group', 'supergroup', 'channel', undefined, 'private']) {
    for (const payload of payloads) {
      const env = baseEnv(), calls = mockFetch();
      await post(env, { message: { chat: { id: -100123, type }, from: { id: Number(OWNER) }, ...payload } });
      assert.equal(calls.length, 0);
      assert.equal(env.MEMORY.store.size, 0);
    }
  }
});

test('generated-image turns fail closed before any model call when the required actor is absent', async () => {
  const { picture } = await import('./worker.mjs');
  const env = { ...baseEnv(), REQUIRE_CONVERSATIONS: true }, calls = mockFetch();
  await assert.rejects(picture(env, `history:${OWNER}`, '/img a jeep', 'a jeep'), /CONVERSATIONS/);
  assert.equal(calls.length, 0);
  assert.equal(env.MEMORY.store.size, 0);
});
