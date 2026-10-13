// Free text brains with an OpenAI-compatible API. GitHub Models gives every model its own daily quota, so many models
// are listed (and more are read from its catalog when those are busy) to get as many free answers a day as possible.
// Each one is used only when its key is set as a Cloudflare
// secret; they run in this order after Gemini and before Workers AI, so a full quota on one hands over to the next.
// Model names go stale, so when none of the listed ones exist (404) the provider's own model list is read and the
// best match is used (and remembered in KV). A comma-separated secret/var (e.g. GROQ_MODELS) overrides the list.
// Free tiers cap the request size (GitHub ~8k tokens, Groq 6–12k tokens/min), so the prompt is trimmed to `budget`
// characters and retried much shorter when a provider still says it is too large (413).
export const PROVIDERS = [
  { name: 'GitHub Models', key: 'GITHUB_MODELS_TOKEN', list: 'GITHUB_MODELS', url: 'https://models.github.ai/inference/chat/completions',
    budget: 12000, catalog: 'https://models.github.ai/catalog/models', models: [
      'openai/gpt-4.1', 'openai/gpt-4o', 'deepseek/DeepSeek-V3-0324', 'xai/grok-3', 'meta/Llama-4-Maverick-17B-128E-Instruct-FP8',
      'mistral-ai/mistral-medium-2505', 'openai/gpt-4.1-mini', 'meta/Llama-3.3-70B-Instruct', 'openai/gpt-4o-mini',
      'xai/grok-3-mini', 'cohere/cohere-command-a',
    ], discover: 8 },
  { name: 'Groq', key: 'GROQ_API_KEY', list: 'GROQ_MODELS', url: 'https://api.groq.com/openai/v1/chat/completions',
    budget: 14000, catalog: 'https://api.groq.com/openai/v1/models', models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3-32b'] },
  { name: 'Cerebras', key: 'CEREBRAS_API_KEY', list: 'CEREBRAS_MODELS', url: 'https://api.cerebras.ai/v1/chat/completions',
    catalog: 'https://api.cerebras.ai/v1/models', models: ['llama-3.3-70b', 'gpt-oss-120b', 'qwen-3-32b'] },
  { name: 'OpenRouter', key: 'OPENROUTER_API_KEY', list: 'OPENROUTER_MODELS', url: 'https://openrouter.ai/api/v1/chat/completions',
    catalog: 'https://openrouter.ai/api/v1/models', models: ['deepseek/deepseek-chat-v3-0324:free', 'meta-llama/llama-3.3-70b-instruct:free'] },
];

// Preferred families when discovering, best first; chat models only.
const PREFER = [/gpt-4\.1(?!-nano)/i, /gpt-4o(?!-mini)/i, /gpt-oss-120b/i, /deepseek.*(v3|chat)/i, /llama-?3\.3-70b|llama-4/i, /qwen-?3/i, /gpt|llama|qwen|mistral|gemma/i];
const NOT_CHAT = /whisper|tts|embed|guard|vision-preview|audio|image|moderation|(^|\/)o\d/i;

export const configuredProviders = (env) => PROVIDERS.filter((p) => env[p.key]);

const FULL_BUDGET = 24000;
const SMALL_BUDGET = 5000;
const MAX_CALLS = 16;

const modelsOf = (env, p) => (env[p.list] ? String(env[p.list]).split(',').map((s) => s.trim()).filter(Boolean) : p.models);

export function toMessages(contents, system) {
  return [
    { role: 'system', content: system },
    ...contents.map((c) => ({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: (c.parts || []).map((p) => p.text || '').join(''),
    })).filter((m) => m.content),
  ];
}

// Picks up to three live chat models from the provider's catalog, best family first.
export async function discoverModels(env, p) {
  const res = await fetch(p.catalog, { headers: { authorization: `Bearer ${String(env[p.key]).trim()}` } });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const list = Array.isArray(data) ? data : (data && data.data) || [];
  const ids = list.map((m) => m && (m.id || m.name)).filter((id) => typeof id === 'string' && !NOT_CHAT.test(id))
    .filter((id) => p.name !== 'OpenRouter' || id.endsWith(':free'));
  const rank = (id) => { const i = PREFER.findIndex((re) => re.test(id)); return i < 0 ? PREFER.length : i; };
  return ids.sort((a, b) => rank(a) - rank(b)).slice(0, p.discover || 3);
}

const cut = (text, max) => (text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text);

// Keeps the system prompt (up to ~45% of the budget), the latest message, and as much recent history as fits.
export function fitContext(messages, budget) {
  const [system, ...rest] = messages;
  if (!rest.length) return [{ ...system, content: cut(system.content, budget) }];
  const last = rest.at(-1);
  const lastText = cut(last.content, Math.floor(budget * 0.4));
  const sys = cut(system.content, Math.max(500, Math.floor(budget * 0.45)));
  let left = budget - sys.length - lastText.length;
  const kept = [];
  for (let i = rest.length - 2; i >= 0 && left > 0; i--) {
    if (rest[i].content.length > left) break;
    left -= rest[i].content.length;
    kept.unshift(rest[i]);
  }
  while (kept.length && kept[0].role !== 'user') kept.shift();
  return [{ ...system, content: sys }, ...kept, { ...last, content: lastText }];
}

const tooLarge = (r) => r.status === 413 || (r.status === 400 && /token|too large|context|length/i.test(r.why || ''));

async function callModel(env, p, model, messages) {
  const res = await fetch(p.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${String(env[p.key]).trim()}` },
    body: JSON.stringify({ model, messages, max_tokens: 2048 }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const err = data && (data.error || data);
    const why = err && (typeof err === 'string' ? err : err.message || err.code);
    return { status: res.status, why: why ? String(why).slice(0, 120) : '' };
  }
  const data = await res.json().catch(() => null);
  const choice = data && data.choices && data.choices[0];
  const raw = choice && choice.message && choice.message.content;
  const text = Array.isArray(raw) ? raw.map((x) => (x && x.text) || '').join('') : raw;
  return { status: 200, finish: (choice && choice.finish_reason) || '', text: text ? String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim() : '' };
}

// Tries every configured provider; returns the first non-empty answer, or throws with every model's reason.
export async function askProviders(env, contents, system) {
  const all = toMessages(contents, system);
  const errors = [];
  for (const p of configuredProviders(env)) {
    const cacheKey = `provider-model:${p.name}`;
    const cached = env.MEMORY ? await env.MEMORY.get(cacheKey) : null;
    const full = fitContext(all, p.budget || FULL_BUDGET);
    const small = fitContext(all, SMALL_BUDGET);
    const tried = new Set();
    const reasons = [];
    let allMissing = true, calls = 0;
    const attempt = async (models) => {
      for (const model of models) {
        if (tried.has(model)) continue;
        if (calls >= MAX_CALLS) break; // stay well under the Workers limit of 50 outbound requests per message
        tried.add(model);
        try {
          calls++;
          let r = await callModel(env, p, model, full);
          if (tooLarge(r)) { calls++; r = await callModel(env, p, model, small); }
          if (r.status === 401 || r.status === 403) { reasons.push(`کلید پذیرفته نشد (${r.status})`); allMissing = false; return 'stop'; }
          if (r.status !== 200) {
            reasons.push(`${model}: ${r.status}${r.why ? ` ${r.why}` : ''}`);
            if (r.status !== 404 && !(r.status === 400 && !tooLarge(r))) allMissing = false;
            continue;
          }
          if (r.text) {
            if (env.MEMORY && model !== cached) await env.MEMORY.put(cacheKey, model);
            return r.text;
          }
          reasons.push(`${model}: پاسخ خالی${r.finish ? ` (${r.finish})` : ''}`); allMissing = false;
        } catch (err) {
          reasons.push(`${model}: ${err.message}`); allMissing = false;
        }
      }
      return null;
    };
    let out = await attempt([...(cached ? [cached] : []), ...modelsOf(env, p)]);
    if (out === null && (allMissing || p.discover) && p.catalog) {
      try { out = await attempt(await discoverModels(env, p)); } catch { /* keep the earlier reasons */ }
    }
    if (out && out !== 'stop') return out;
    errors.push(`${p.name}: ${reasons.join('، ') || 'بی‌جواب'}`);
  }
  throw new Error(errors.join(' | ') || 'هیچ مغز رایگان دیگری تنظیم نشده.');
}
