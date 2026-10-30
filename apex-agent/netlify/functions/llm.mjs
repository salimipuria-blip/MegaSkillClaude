// Optional LLM proxy. Off by default: without APEX_PROXY_TOKEN every request is refused.
//
// Why it exists: three of the free providers do not send CORS headers, so a browser cannot call
// them. Why it is locked: a public function holding a server-side key is an open relay, and an open
// relay is somebody else's bill. So: shared token required, host allowlist, no logging of content,
// no key in the response, and a body size cap.

const ALLOWED_HOSTS = new Set([
  'openrouter.ai',
  'api.groq.com',
  'api.cerebras.ai',
  'api.mistral.ai',
  'models.github.ai',
  'api.together.xyz',
  'api.deepseek.com',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
]);

const MAX_BODY = 512 * 1024;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-apex-proxy': '1',
    },
  });

/** Constant-time-ish comparison: length is compared first, then every byte. */
function safeEqual(a, b) {
  const A = String(a || '');
  const B = String(b || '');
  if (A.length !== B.length || !A.length) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i += 1) diff |= A.charCodeAt(i) ^ B.charCodeAt(i);
  return diff === 0;
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method not allowed' });

  const secret = process.env.APEX_PROXY_TOKEN;
  if (!secret) {
    return json(503, {
      error: 'پروکسی خاموش است: APEX_PROXY_TOKEN در متغیرهای محیطی Netlify تنظیم نشده.',
      hint: 'Site settings → Environment variables → APEX_PROXY_TOKEN و APEX_UPSTREAM_KEY را بگذار.',
    });
  }
  if (!safeEqual(request.headers.get('x-apex-token'), secret)) {
    return json(401, { error: 'توکن پروکسی نامعتبر است.' });
  }

  const upstream = request.headers.get('x-apex-upstream') || '';
  let target;
  try {
    target = new URL(upstream);
  } catch {
    return json(400, { error: 'آدرس بالادست نامعتبر است.' });
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return json(403, { error: `هاست مجاز نیست: ${target.hostname}` });
  }

  const text = await request.text();
  if (text.length > MAX_BODY) return json(413, { error: 'بدنهٔ درخواست بیش از حد بزرگ است.' });

  const key = process.env.APEX_UPSTREAM_KEY;
  if (!key) return json(503, { error: 'APEX_UPSTREAM_KEY تنظیم نشده.' });

  const headers = { 'content-type': 'application/json' };
  if (target.hostname === 'api.anthropic.com') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  } else if (target.hostname === 'generativelanguage.googleapis.com') {
    target.searchParams.set('key', key);
  } else {
    headers.authorization = `Bearer ${key}`;
  }

  let res;
  try {
    res = await fetch(target, { method: 'POST', headers, body: text });
  } catch (err) {
    return json(502, { error: `اتصال بالادست شکست خورد: ${err.message}` });
  }

  // Stream through untouched; the browser parses SSE exactly as it would directly.
  const out = new Headers({
    'content-type': res.headers.get('content-type') || 'application/json',
    'cache-control': 'no-store',
    'x-apex-proxy': '1',
  });
  return new Response(res.body, { status: res.status, headers: out });
};

export const config = { path: '/.netlify/functions/llm' };
