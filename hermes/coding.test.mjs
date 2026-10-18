// Coding mode (detection, Pro skills, code models, code as files) and the owner's GitHub tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { webhookSecret } from './worker.mjs';
import { askWorkersAI } from './brain.mjs';
import { askProviders } from './providers.mjs';
import { isCodeRequest, codeSkillNames, codeFiles, CODE_PLAYBOOK } from './coding.mjs';
import { safePath, readFile, ciStatus, openPRs, githubCommand, reviewPrompt, FILE_CHARS } from './github.mjs';

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

// Skill assets: two Pro skills reachable by name (build-skills writes skills/names.json), no search index.
const FILES = {
  'skills/meta.json': JSON.stringify({ total: 0 }),
  'skills/names.json': JSON.stringify({ 'pro-debugging': 0, 'pro-code-review': 1 }),
  'skills/s/0.md': '# pro-debugging\nDEBUG-SKILL-MARK reproduce first.',
  'skills/s/1.md': '# pro-code-review\nREVIEW-SKILL-MARK rank findings.',
};
const assets = () => ({ fetch: async (req) => {
  const p = new URL(req.url).pathname.slice(1);
  return Object.hasOwn(FILES, p) ? new Response(FILES[p]) : new Response('', { status: 404 });
} });
const baseEnv = (extra = {}) => ({ FREE_TEXT: 'off', TELEGRAM_BOT_TOKEN: '1:abc', GEMINI_API_KEY: 'g', ALLOWED_USER_ID: OWNER,
  MEMORY: kv(), ASSETS: assets(), ...extra });

const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

// GitHub + Telegram + Gemini mock; `gh` maps a GitHub API path suffix to [status, body].
function mockFetch(gh = {}, geminiText = 'باشه') {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ url: u, body, headers: init.headers || {} });
    if (u.includes('generativelanguage')) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: geminiText }] } }] }));
    }
    if (u.startsWith('https://api.github.com/')) {
      const key = Object.keys(gh).find((k) => u.includes(k));
      const [status, data] = key ? gh[key] : [404, { message: 'Not Found' }];
      return new Response(JSON.stringify(data), { status });
    }
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  return calls;
}
const sent = (calls) => calls.filter((c) => c.url.endsWith('/sendMessage')).map((c) => c.body.text);
const docs = (calls) => calls.filter((c) => c.url.endsWith('/sendDocument')).map((c) => c.body);
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

test('isCodeRequest: code, errors and programming words count; everyday Persian does not', () => {
  for (const t of ['یه اسکریپت پایتون بنویس', 'کدم ارور میده', '```js\nconst a = 1\n```', 'API بک‌اند با Supabase',
    'TypeError: x is undefined', 'این PR رو ریویو کن', 'def main():\n  pass']) assert.equal(isCodeRequest(t), true, t);
  for (const t of ['کد تخفیف چیه؟', 'کد عضویتم کار نمی‌کنه', 'کپشن اینستا بنویس', 'امنیت تور چطوره', 'تست رانندگی', '']) {
    assert.equal(isCodeRequest(t), false, t);
  }
});

test('codeSkillNames: most specific Pro skills first, at most two', () => {
  assert.deepEqual(codeSkillNames('این کد باگ داره، TypeError میده'), ['pro-debugging']);
  assert.deepEqual(codeSkillNames('این PR رو ریویو کن و امنیتش رو چک کن'), ['pro-security-review', 'pro-code-review']);
  assert.deepEqual(codeSkillNames('یه اسکریپت ساده بنویس'), []);
  assert.ok(codeSkillNames('review the API tests for security bugs').length <= 2);
});

test('codeFiles: big blocks become files named from a path comment; small ones stay inline', () => {
  const big = 'x'.repeat(1600);
  const reply = `متن\n\`\`\`js\n// path: src/app.js\n${big}\n\`\`\`\n\`\`\`py\nprint(1)\n\`\`\`\n\`\`\`python\n${big}\n\`\`\``;
  const files = codeFiles(reply);
  assert.deepEqual(files.map((f) => f.name), ['app.js', 'code-2.py']);
  assert.match(files[0].text, /^\/\/ path: src\/app\.js/);
  assert.deepEqual(codeFiles('بدون کد'), []);
});

test('coding mode: owner prompt gets the playbook and the matching Pro skill; normal chat does not', async () => {
  const env = baseEnv();
  let calls = mockFetch();
  await telegram(env, 'این کد پایتون ارور میده: TypeError: unsupported operand');
  const sys = systemOf(calls);
  assert.ok(sys.includes(CODE_PLAYBOOK.trim().slice(0, 40)));
  assert.match(sys, /DEBUG-SKILL-MARK/);
  calls = mockFetch();
  await telegram(env, 'یه کپشن برای غروب کویر بنویس');
  assert.doesNotMatch(systemOf(calls), /CODING MODE|DEBUG-SKILL-MARK/);
});

test('a long code answer is also sent as a file', async () => {
  const env = baseEnv();
  const code = `\`\`\`js\n// path: tools/sort.js\n${'console.log(1);\n'.repeat(120)}\`\`\``;
  const calls = mockFetch({}, `این هم کد:\n${code}`);
  await telegram(env, 'یه اسکریپت node بنویس که فایل‌ها رو مرتب کنه');
  const files = docs(calls);
  assert.equal(files.length, 1);
  assert.equal(files[0].get('document').name, 'sort.js');
  assert.ok(sent(calls).some((t) => t.includes('این هم کد')));
});

test('providers: coding mode tries code models first, longer answers, separate model memory', async () => {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push(body);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
  };
  const env = { GROQ_API_KEY: 'k', FREE_TEXT: 'off', MEMORY: kv() };
  const contents = [{ role: 'user', parts: [{ text: 'write a function' }] }];
  assert.equal(await askProviders(env, contents, 'sys', { code: true }), 'ok');
  assert.equal(seen[0].model, 'openai/gpt-oss-120b');
  assert.equal(seen[0].max_tokens, 4096);
  assert.equal(env.MEMORY.store.get('provider-model:code:Groq'), 'openai/gpt-oss-120b');
  assert.equal(env.MEMORY.store.has('provider-model:Groq'), false);
  await askProviders(env, contents, 'sys');
  assert.equal(seen[1].model, 'llama-3.3-70b-versatile');
  assert.equal(seen[1].max_tokens, 2048);
});

test('Workers AI: coding mode starts with the code models', async () => {
  const models = [];
  const env = { AI: { run: async (model, input) => { models.push([model, input.max_tokens]); return { response: 'ok' }; } } };
  await askWorkersAI(env, [{ role: 'user', parts: [{ text: 'x' }] }], 'sys', { code: true });
  assert.deepEqual(models[0], ['@cf/moonshotai/kimi-k2.7-code', 2048]);
  await askWorkersAI(env, [{ role: 'user', parts: [{ text: 'x' }] }], 'sys');
  assert.equal(models[1][0], '@cf/google/gemma-3-12b-it');
});

test('github: safe paths only', () => {
  assert.equal(safePath('/hermes/worker.mjs'), 'hermes/worker.mjs');
  for (const bad of ['../etc/passwd', 'a/../../b', 'a b', '', 'x;rm']) assert.throws(() => safePath(bad), /نامعتبر/);
});

test('github: CI, PRs and files through the API with the token; help without it', async () => {
  const env = { GITHUB_REPO_TOKEN: 'tok' };
  const calls = mockFetch({
    'actions/runs': [200, { workflow_runs: [
      { name: 'CI', status: 'completed', conclusion: 'success', head_sha: 'abcdef123', display_title: 'feat: x' },
      { name: 'CI', status: 'completed', conclusion: 'failure', head_sha: 'old', display_title: 'old' },
      { name: 'CI · Hermes', status: 'in_progress', head_sha: 'abcdef123', display_title: 'feat: x' },
    ] }],
    pulls: [200, [{ number: 7, title: 'Fix', draft: true, user: { login: 'puria' } }, { number: 8, title: 'Bump', user: { login: 'dependabot[bot]' } }]],
    'contents/hermes/a.mjs': [200, { type: 'file', content: b64('export const a = "سلام";\n') }],
    'contents/hermes?': [200, [{ type: 'file', name: 'a.mjs' }, { type: 'dir', name: 'tests' }]],
  });
  const ci = await ciStatus(env);
  assert.match(ci, /✅ CI — abcdef1/);
  assert.match(ci, /⏳ CI · Hermes/);
  assert.doesNotMatch(ci, /old/);
  assert.equal(calls[0].headers.authorization, 'Bearer tok');
  const prs = await openPRs(env);
  assert.match(prs, /📝 #7 Fix/);
  assert.match(prs, /1 PR خودکار/);
  assert.equal((await readFile(env, 'hermes/a.mjs')).text, 'export const a = "سلام";\n');
  assert.match((await readFile(env, 'hermes')).text, /📁 tests/);
  mockFetch();
  await assert.rejects(ciStatus({}), /GITHUB_REPO_TOKEN/);
});

test('github: review prompt is cut to FILE_CHARS and carries the language', () => {
  const p = reviewPrompt('src/x.py', 'a'.repeat(FILE_CHARS + 10));
  assert.match(p, /```python/);
  assert.match(p, /10 more characters/);
});

test('Telegram: /ci, /file as a document, /review through coding mode; not a command → null', async () => {
  assert.equal(await githubCommand({}, 'hello'), null);
  assert.match((await githubCommand({}, '/file')).reply, /مسیر فایل/);
  const env = baseEnv({ GITHUB_REPO_TOKEN: 'tok' });
  const gh = {
    'actions/runs': [200, { workflow_runs: [{ name: 'CI', status: 'completed', conclusion: 'success', head_sha: 'abc1234', display_title: 't' }] }],
    'contents/hermes/a.mjs': [200, { type: 'file', content: b64('export const a = 1;\n') }],
  };
  let calls = mockFetch(gh);
  await telegram(env, '/ci');
  assert.ok(sent(calls).some((t) => t.includes('✅ CI')));
  calls = mockFetch(gh);
  await telegram(env, '/file hermes/a.mjs');
  assert.equal(docs(calls)[0].get('document').name, 'a.mjs');
  calls = mockFetch(gh);
  await telegram(env, '/review hermes/a.mjs');
  const sys = systemOf(calls);
  assert.match(sys, /CODING MODE/);
  assert.match(sys, /REVIEW-SKILL-MARK/);
  calls = mockFetch({});
  await telegram(baseEnv(), '/ci');
  assert.ok(sent(calls).some((t) => t.includes('GITHUB_REPO_TOKEN')));
});

test('github: a file over 1 MB is reported, never sent as an empty file', async () => {
  mockFetch({ 'contents/big.json': [200, { type: 'file', encoding: 'none', content: '', size: 2500000 }] });
  await assert.rejects(readFile({ GITHUB_REPO_TOKEN: 'tok' }, 'big.json'), /۱ مگابایت/);
});
