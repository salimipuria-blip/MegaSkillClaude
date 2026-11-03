// Owner-only portfolio knowledge: project detection, clipping, and that only the owner's prompt gets it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { webhookSecret, appKey } from './worker.mjs';
import { createAccount } from './accounts.mjs';
import { mentionedProjects, projectKnowledge, clip, PORTFOLIO_CHARS, MAX_PROJECTS } from './knowledge.mjs';

const OWNER = '123456789';

function kv() {
  const store = new Map();
  return {
    store,
    async get(k, type) { const v = store.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}

const FILES = {
  'knowledge/portfolio.md': '# نقشهٔ کل پروژه‌ها\nMegaSkillClaude مخزن اصلی است. PORTFOLIO-MARK',
  'knowledge/fjcod.md': 'چام: انتشار روی Supabase مانده. FJCOD-MARK',
  'knowledge/hermes.md': 'هرمس: جست‌وجوی بایگانی بعدی است. HERMES-MARK',
};
const assets = () => ({ fetch: async (req) => {
  const p = new URL(req.url).pathname.slice(1);
  return Object.hasOwn(FILES, p) ? new Response(FILES[p]) : new Response('', { status: 404 });
} });
const baseEnv = () => ({ FREE_TEXT: 'off', TELEGRAM_BOT_TOKEN: '1:abc', GEMINI_API_KEY: 'g', ALLOWED_USER_ID: OWNER, MEMORY: kv(), ASSETS: assets() });

function mockFetch() {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    if (String(url).includes('generativelanguage')) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'باشه' }] } }] }));
    }
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  return calls;
}
const systemOf = (calls) => calls.find((c) => c.url.includes('generativelanguage')).body.systemInstruction.parts[0].text;

async function telegram(env, text) {
  const pending = [];
  await worker.fetch(new Request('https://h.workers.dev/telegram', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': await webhookSecret(env) },
    body: JSON.stringify({ message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) }, text } }),
  }), env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
}
const api = (env, path, body, key) => worker.fetch(new Request(`https://h.workers.dev${path}`, {
  method: body ? 'POST' : 'GET',
  headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}), env, { waitUntil() {} });

test('mentionedProjects: Persian and English names, word boundaries, capped', () => {
  assert.deepEqual(mentionedProjects('وضعیت چام چیه؟').map((p) => p.id), ['fjcod']);
  assert.deepEqual(mentionedProjects('Hermes and Lithos status').map((p) => p.id), ['hermes', 'lithos']);
  assert.deepEqual(mentionedProjects('herMESSAGE'), []); // not a whole word
  assert.equal(mentionedProjects('هرمس چام وایکینگ لیتوس').length, MAX_PROJECTS);
});

test('clip keeps short text and cuts long text at a line', () => {
  assert.equal(clip('abc', 10), 'abc');
  const long = 'line one\n'.repeat(400);
  const out = clip(long, PORTFOLIO_CHARS);
  assert.ok(out.length <= PORTFOLIO_CHARS + 2);
  assert.ok(out.endsWith('\n…'));
});

test('projectKnowledge: portfolio + named projects; nothing for unrelated chat or without assets', async () => {
  const env = baseEnv();
  const block = await projectKnowledge(env, 'کار مانده‌ی چام و هرمس چیه؟');
  assert.match(block, /PORTFOLIO-MARK/);
  assert.match(block, /FJCOD-MARK/);
  assert.match(block, /HERMES-MARK/);
  assert.match(block, /never invent/);
  assert.match(await projectKnowledge(env, 'وضعیت ریپوها رو بگو'), /PORTFOLIO-MARK/);
  assert.equal(await projectKnowledge(env, 'یک کپشن برای عکس غروب بنویس'), '');
  assert.equal(await projectKnowledge({}, 'وضعیت چام'), '');
  assert.equal(await projectKnowledge({ ASSETS: { fetch: async () => { throw new Error('boom'); } } }, 'وضعیت چام'), '');
});

test('owner Telegram prompt carries the knowledge; /projects returns the portfolio', async () => {
  const env = baseEnv();
  let calls = mockFetch();
  await telegram(env, 'وضعیت چام چیه؟');
  assert.match(systemOf(calls), /FJCOD-MARK/);
  calls = mockFetch();
  await telegram(env, '/projects');
  const sent = calls.filter((c) => c.url.endsWith('/sendMessage')).map((c) => c.body.text);
  assert.ok(sent.some((t) => t.includes('PORTFOLIO-MARK')));
  assert.equal(calls.some((c) => c.url.includes('generativelanguage')), false);
});

test('app: owner gets the knowledge, a team member never does', async () => {
  const env = baseEnv();
  let calls = mockFetch();
  await api(env, '/api/chat', { message: 'وضعیت چام چیه؟' }, await appKey(env));
  assert.match(systemOf(calls), /FJCOD-MARK/);

  const acct = await createAccount(env, { username: 'sara', name: 'سارا' });
  const login = await (await api(env, '/api/login', { username: 'sara', password: acct.password })).json();
  calls = mockFetch();
  await api(env, '/api/chat', { message: 'وضعیت چام چیه؟' }, login.token);
  const sys = systemOf(calls);
  assert.doesNotMatch(sys, /FJCOD-MARK|PORTFOLIO-MARK|OWNER PORTFOLIO/);
});

test('knowledge files are never served over HTTP, even with ASSETS bound', async () => {
  const env = baseEnv();
  mockFetch();
  for (const path of ['/knowledge/portfolio.md', '/knowledge/fjcod.md']) {
    const res = await worker.fetch(new Request(`https://h.workers.dev${path}`), env, { waitUntil() {} });
    assert.doesNotMatch(await res.text(), /PORTFOLIO-MARK|FJCOD-MARK/);
  }
});

test('focusDoc: a CLAUDE.md brief keeps its yaml spec and work queue; a roadmap starts at its queue', async () => {
  const { focusDoc } = await import('./knowledge.mjs');
  const brief = '# x — دستور کار Claude\n> status\n\n```yaml\nname: x\nstatus: live\n```\n\n## نقشهٔ کد\n- a.mjs\n\n' +
    '## صف کار\n- P0: ship it\n\n## پروتکل به‌روزرسانی\n- update';
  const out = focusDoc('CLAUDE.md', brief);
  assert.match(out, /status: live/);
  assert.match(out, /P0: ship it/);
  assert.doesNotMatch(out, /نقشهٔ کد|پروتکل/);
  assert.match(focusDoc('CLAUDE.md', '## صف کار\n- last section'), /last section/);
  assert.equal(focusDoc('CLAUDE.md', 'no structure'), 'no structure');
  assert.equal(focusDoc('ROADMAP.md', '# r\n## done\n- a\n## صف کارها\n- b'), '## صف کارها\n- b');
});

test('the mega skill plugin is a project of its own, read from plugins/', () => {
  const p = mentionedProjects('وضعیت پلاگین مگا اسکیل چیه؟');
  assert.equal(p[0].id, 'mega-skills-router');
  assert.equal(p[0].dir, 'plugins/mega-skills-router');
});
