// node --test hermes/  (Node 20+, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { webhookSecret, appKey, setupKey, chunks, MODELS, CF_MODELS } from './worker.mjs';
import { hashPassword } from './auth.mjs';
import { USERS } from './users.mjs';
import { loadLog, loadNotes, addNote, appendTurn, archiveAndClear, clearNotes } from './memory.mjs';

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
