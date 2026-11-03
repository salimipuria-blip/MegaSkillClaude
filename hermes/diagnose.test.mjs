import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, explainFailure, formatDiagnosis } from './diagnose.mjs';
import { skillsBlock, PROMPT_SKILL_CHARS } from './skill-router.mjs';
import worker from './worker.mjs';

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// One fake upstream for every provider; each case below says how that provider behaves.
function upstream({ gemini = 400, github = 200, groq = 401, hf = 200, pollinations = 402, freeText = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, headers: (init && init.headers) || {} });
    if (u.includes('generativelanguage')) return gemini === 200 ? json({ models: [] }) : json({ error: { message: 'API key not valid. Please pass a valid API key.' } }, gemini);
    if (u.includes('models.github.ai/catalog')) return github === 200 ? json([{ id: 'openai/gpt-4.1' }, { id: 'openai/gpt-4o' }]) : json({}, github);
    if (u.includes('api.groq.com')) return groq === 200 ? json({ data: [] }) : json({ error: { message: 'Invalid API Key' } }, groq);
    if (u.includes('huggingface.co/api/whoami-v2')) return hf === 200 ? json({ name: 'puria' }) : json({ error: 'Invalid credentials' }, hf);
    if (u.includes('image.pollinations.ai')) return pollinations === 200 ? new Response(new Uint8Array(10), { headers: { 'content-type': 'image/jpeg' } }) : json({ error: 'Payment Required' }, pollinations);
    if (u.includes('text.pollinations.ai')) return freeText === 200 ? json({ choices: [{ message: { content: 'o' } }] }) : json({}, freeText);
    return json({}, 404);
  };
  return calls;
}

const env = (extra = {}) => ({
  GEMINI_API_KEY: 'g', GITHUB_MODELS_TOKEN: 'gh', GROQ_API_KEY: 'gq', HF_TOKEN: 'hf',
  AI: { run: async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } },
  ...extra,
});

test('diagnose names each source and why it fails, and never echoes a key', async () => {
  const calls = upstream();
  const d = await diagnose(env({ GROQ_API_KEY: 'secret-groq-key' }));
  const by = Object.fromEntries(d.checks.map((c) => [c.name, c]));
  assert.equal(by.Gemini.ok, false);
  // task 19: the owner gets the fix, and the upstream reason stays as evidence
  assert.match(by.Gemini.detail, /کلید GEMINI_API_KEY نامعتبر است؛ در Cloudflare .*عوض یا حذف کن/);
  assert.match(by.Gemini.detail, /400 API key not valid/);
  assert.equal(by['GitHub Models'].ok, true);
  assert.match(by['GitHub Models'].detail, /2 مدل/);
  assert.equal(by.Groq.ok, false);
  assert.match(by.Groq.detail, /کلید GROQ_API_KEY پذیرفته نشد/);
  assert.match(by.Groq.detail, /401/);
  assert.equal(by['Workers AI (Cloudflare)'].ok, false);
  assert.match(by['Workers AI (Cloudflare)'].detail, /4006/);
  assert.equal(by['Hugging Face'].ok, true);
  assert.equal(by['Pollinations (عکس)'].ok, false);
  assert.match(by['Pollinations (عکس)'].detail, /402/);
  assert.equal(d.text, true, 'GitHub answers text');
  assert.equal(d.image, true, 'Hugging Face can still make images');
  assert.doesNotMatch(JSON.stringify(d), /secret-groq-key/);
  assert.ok(calls.every((c) => !String(c.url).includes('secret-groq-key')));
});

test('without any working image source the verdict says so in Persian', async () => {
  upstream({ hf: 401 });
  const d = await diagnose(env());
  assert.equal(d.image, false);
  const text = formatDiagnosis(d);
  assert.match(text, /❌ ساخت عکس: هیچ منبع عکسی سالم نیست/);
  assert.match(text, /❌ Gemini: کلید GEMINI_API_KEY نامعتبر است/);
  assert.match(text, /400 API key not valid/);
});

test('keys that are not set are skipped, not reported as failures', async () => {
  upstream();
  const d = await diagnose({ FREE_TEXT: 'off', FREE_IMAGES: 'off' });
  assert.deepEqual(d.checks, []);
});

test('/health/deep is hidden without HEALTH_KEY and needs the bearer key', async () => {
  upstream({ github: 200 });
  const req = (auth) => new Request('https://h.workers.dev/health/deep', { headers: auth ? { authorization: auth } : {} });
  assert.equal((await worker.fetch(req(), env(), {})).status, 404);
  assert.equal((await worker.fetch(req('Bearer nope'), env({ HEALTH_KEY: 'k' }), {})).status, 403);
  const ok = await worker.fetch(req('Bearer k'), env({ HEALTH_KEY: 'k' }), {});
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.ok(Array.isArray(body.checks));
  assert.equal(body.text, true);
});

test('each skill is clipped in the prompt so free tiers are not overrun', () => {
  const long = 'word '.repeat(3000);
  const block = skillsBlock([{ name: 'a', text: long }, { name: 'b', text: long }, { name: 'c', text: 'short' }]);
  assert.ok(block.length < PROMPT_SKILL_CHARS * 3 + 600, `prompt block too large: ${block.length}`);
  assert.match(block, /### c\nshort/);
  assert.match(block, /…/);
});

test('task 19: a token that authenticates but sees zero models is reported as a missing Models: Read scope', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('models.github.ai/catalog')) return json([]);          // 200, but nothing visible
    if (u.includes('generativelanguage')) return json({ models: [{ name: 'm' }] });
    return json({}, 404);
  };
  const d = await diagnose({ GITHUB_MODELS_TOKEN: 'gh', GEMINI_API_KEY: 'g', FREE_TEXT: 'off', FREE_IMAGES: 'off' });
  const by = Object.fromEntries(d.checks.map((c) => [c.name, c]));
  assert.equal(by['GitHub Models'].ok, false, 'a green tick next to "(0 مدل)" hid a broken token');
  assert.match(by['GitHub Models'].detail, /توکن GITHUB_MODELS_TOKEN مجوز Models: Read ندارد/);
  assert.match(by['GitHub Models'].detail, /کاتالوگ ۰ مدل داد/);
  assert.equal(by.Gemini.ok, true);
  assert.equal(d.text, true, 'Gemini still answers text, so the verdict must not say everything is dead');
});

test('task 19: explainFailure translates only the failures it knows and never invents a cause', () => {
  assert.match(explainFailure({ name: 'Gemini', keyVar: 'GEMINI_API_KEY', status: 401, message: 'INVALID API KEY' }),
    /کلید GEMINI_API_KEY نامعتبر است؛ در Cloudflare/);
  assert.match(explainFailure({ name: 'Gemini', keyVar: 'GEMINI_API_KEY', status: 400, message: 'User location is not supported' }),
    /کلید GEMINI_API_KEY نامعتبر است/);
  assert.match(explainFailure({ name: 'GitHub Models', keyVar: 'GITHUB_MODELS_TOKEN', status: 200, message: 'کاتالوگ خالی', models: 0 }),
    /Models: Read/);
  assert.match(explainFailure({ name: 'Groq', keyVar: 'GROQ_API_KEY', status: 200, message: 'empty', models: 0 }),
    /هیچ مدلی برنمی‌گرداند/);
  // unrelated failures pass through untouched: a translated guess would be worse than the raw reason
  assert.equal(explainFailure({ name: 'Pollinations (عکس)', keyVar: null, status: 402, message: 'Payment Required' }),
    '402 Payment Required');
  assert.equal(explainFailure({ name: 'Workers AI (Cloudflare)', keyVar: null, status: 0, message: '4006: daily allocation' }),
    '4006: daily allocation');
});
