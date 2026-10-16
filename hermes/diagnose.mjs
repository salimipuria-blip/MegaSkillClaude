// Live self-check of every brain and image source (owner /status in Telegram, and GET /health/deep
// behind HEALTH_KEY). Unlike health.mjs this DOES call the providers, with the cheapest request
// each one offers (model lists, a 1-token Workers AI run, a 64px Pollinations image), so a bad key,
// a region block or a spent quota shows up by name instead of as "no picture". Never prints secrets.
import { fetchWithTimeout } from './resilience.mjs';
import { PROVIDERS, configuredProviders } from './providers.mjs';
import { FREE_IMAGE_API } from './image.mjs';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT = 8000;
const CF_PROBE_MODEL = '@cf/meta/llama-3.2-1b-instruct';
const trim = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 140);
const bearer = (v) => ({ authorization: `Bearer ${String(v).trim()}` });

async function reason(res) {
  const body = await res.text().catch(() => '');
  let msg = body;
  try {
    const data = JSON.parse(body);
    const err = data && (data.error || data);
    msg = typeof err === 'string' ? err : (err && (err.message || err.code || err.error)) || '';
  } catch { /* plain text */ }
  return `${res.status}${msg ? ` ${trim(msg)}` : ''}`;
}

async function probe(name, kind, run) {
  try {
    const detail = await run();
    return { name, kind, ok: true, detail: trim(detail || 'ok') };
  } catch (err) {
    return { name, kind, ok: false, detail: trim(err && err.message) };
  }
}

async function getOk(url, init) {
  const res = await fetchWithTimeout(url, init, TIMEOUT);
  if (!res.ok) throw new Error(await reason(res));
  return res;
}

// Every check runs in parallel; each one is skipped (not failed) when its key is not set.
export async function diagnose(env = {}) {
  const checks = [];
  if (env.GEMINI_API_KEY) {
    checks.push(probe('Gemini', 'text+image', async () => {
      await getOk(`${GEMINI_API}/models?pageSize=1`, { headers: { 'x-goog-api-key': String(env.GEMINI_API_KEY).trim() } });
      return 'کلید معتبر است';
    }));
  }
  for (const p of configuredProviders(env)) {
    if (!p.key) continue; // keyless public API: checked below with a real call
    checks.push(probe(p.name, 'text', async () => {
      const res = await getOk(p.catalog, { headers: bearer(env[p.key]) });
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data) ? data : (data && data.data) || [];
      return `کلید معتبر است (${list.length} مدل)`;
    }));
  }
  if (env.FREE_TEXT !== 'off') {
    const free = PROVIDERS.find((p) => !p.key);
    if (free) {
      checks.push(probe(free.name, 'text', async () => {
        const res = await getOk(free.url, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: free.models[0], messages: [{ role: 'user', content: 'ok' }], max_tokens: 1 }),
        });
        await res.text();
        return 'بدون کلید جواب می‌دهد';
      }));
    }
  }
  if (env.AI) {
    checks.push(probe('Workers AI (Cloudflare)', 'text+image', async () => {
      await env.AI.run(CF_PROBE_MODEL, { messages: [{ role: 'user', content: 'ok' }], max_tokens: 1 });
      return 'سهمیهٔ امروز باقی است';
    }));
  }
  if (env.HF_TOKEN) {
    checks.push(probe('Hugging Face', 'text+image', async () => {
      const res = await getOk('https://huggingface.co/api/whoami-v2', { headers: bearer(env.HF_TOKEN) });
      const data = await res.json().catch(() => ({}));
      return `کلید معتبر است${data && data.name ? ` (${data.name})` : ''}`;
    }));
  }
  if (env.FREE_IMAGES !== 'off') {
    checks.push(probe('Pollinations (عکس)', 'image', async () => {
      const init = env.POLLINATIONS_TOKEN ? { headers: bearer(env.POLLINATIONS_TOKEN) } : undefined;
      const res = await getOk(`${FREE_IMAGE_API}ok?width=64&height=64&nologo=true`, init);
      const mime = res.headers.get('content-type') || '';
      await res.arrayBuffer().catch(() => null);
      if (!mime.startsWith('image/')) throw new Error(`جواب عکس نبود (${trim(mime)})`);
      return env.POLLINATIONS_TOKEN ? 'با توکن جواب می‌دهد' : 'بدون کلید جواب می‌دهد';
    }));
  }
  const results = await Promise.all(checks);
  const has = (kind) => results.some((r) => r.ok && r.kind.includes(kind));
  return { ts: new Date().toISOString(), text: has('text'), image: has('image'), checks: results };
}

export function formatDiagnosis(d) {
  const lines = d.checks.map((c) => `${c.ok ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  const verdict = [
    d.text ? '✅ جواب متنی: حداقل یک مغز سالم است.' : '❌ جواب متنی: هیچ مغزی سالم نیست.',
    d.image ? '✅ ساخت عکس: حداقل یک منبع سالم است.' : '❌ ساخت عکس: هیچ منبع عکسی سالم نیست.',
  ];
  return ['وضعیت زندهٔ هرمس', '', ...lines, '', ...verdict].join('\n');
}
