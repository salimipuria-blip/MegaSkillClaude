// Free text brains with an OpenAI-compatible API. Each one is used only when its key is set as a Cloudflare
// secret; they run in this order after Gemini and before Workers AI, so a full quota on one hands over to the next.
// Model names go stale, so when none of the listed ones exist (404) the provider's own model list is read and the
// best match is used (and remembered in KV). A comma-separated secret/var (e.g. GROQ_MODELS) overrides the list.
export const PROVIDERS = [
  { name: 'GitHub Models', key: 'GITHUB_MODELS_TOKEN', list: 'GITHUB_MODELS', url: 'https://models.github.ai/inference/chat/completions',
    catalog: 'https://models.github.ai/catalog/models', models: ['openai/gpt-4.1', 'openai/gpt-4o', 'openai/gpt-4.1-mini'] },
  { name: 'Groq', key: 'GROQ_API_KEY', list: 'GROQ_MODELS', url: 'https://api.groq.com/openai/v1/chat/completions',
    catalog: 'https://api.groq.com/openai/v1/models', models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3-32b'] },
  { name: 'Cerebras', key: 'CEREBRAS_API_KEY', list: 'CEREBRAS_MODELS', url: 'https://api.cerebras.ai/v1/chat/completions',
    catalog: 'https://api.cerebras.ai/v1/models', models: ['llama-3.3-70b', 'gpt-oss-120b', 'qwen-3-32b'] },
  { name: 'OpenRouter', key: 'OPENROUTER_API_KEY', list: 'OPENROUTER_MODELS', url: 'https://openrouter.ai/api/v1/chat/completions',
    catalog: 'https://openrouter.ai/api/v1/models', models: ['deepseek/deepseek-chat-v3-0324:free', 'meta-llama/llama-3.3-70b-instruct:free'] },
];

// Preferred families when discovering, best first; chat models only.
const PREFER = [/gpt-4\.1(?!-nano)/i, /gpt-4o(?!-mini)/i, /gpt-oss-120b/i, /deepseek.*(v3|chat)/i, /llama-?3\.3-70b|llama-4/i, /qwen-?3/i, /gpt|llama|qwen|mistral|gemma/i];
const NOT_CHAT = /whisper|tts|embed|guard|vision-preview|audio|image|moderation/i;

export const configuredProviders = (env) => PROVIDERS.filter((p) => env[p.key]);

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
  const res = await fetch(p.catalog, { headers: { authorization: `Bearer ${env[p.key]}` } });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const list = Array.isArray(data) ? data : (data && data.data) || [];
  const ids = list.map((m) => m && (m.id || m.name)).filter((id) => typeof id === 'string' && !NOT_CHAT.test(id))
    .filter((id) => p.name !== 'OpenRouter' || id.endsWith(':free'));
  const rank = (id) => { const i = PREFER.findIndex((re) => re.test(id)); return i < 0 ? PREFER.length : i; };
  return ids.sort((a, b) => rank(a) - rank(b)).slice(0, 3);
}

async function callModel(env, p, model, messages) {
  const res = await fetch(p.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env[p.key]}` },
    body: JSON.stringify({ model, messages, max_tokens: 2048 }),
  });
  if (!res.ok) return { status: res.status };
  const data = await res.json().catch(() => null);
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return { status: 200, text: text ? String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim() : '' };
}

// Tries every configured provider; returns the first non-empty answer, or throws with every provider's reason.
export async function askProviders(env, contents, system) {
  const messages = toMessages(contents, system);
  const errors = [];
  for (const p of configuredProviders(env)) {
    const cacheKey = `provider-model:${p.name}`;
    const cached = env.MEMORY ? await env.MEMORY.get(cacheKey) : null;
    const tried = new Set();
    let reason = '', allMissing = true;
    const attempt = async (models) => {
      for (const model of models) {
        if (tried.has(model)) continue;
        tried.add(model);
        try {
          const r = await callModel(env, p, model, messages);
          if (r.status === 401 || r.status === 403) { reason = `کلید پذیرفته نشد (${r.status})`; allMissing = false; return 'stop'; }
          if (r.status !== 200) { reason = `${model}: ${r.status}`; if (r.status !== 404 && r.status !== 400) allMissing = false; continue; }
          if (r.text) {
            if (env.MEMORY && model !== cached) await env.MEMORY.put(cacheKey, model);
            return r.text;
          }
          reason = `${model}: پاسخ خالی`; allMissing = false;
        } catch (err) {
          reason = err.message; allMissing = false;
        }
      }
      return null;
    };
    let out = await attempt([...(cached ? [cached] : []), ...modelsOf(env, p)]);
    if (out === null && allMissing && p.catalog) {
      try { out = await attempt(await discoverModels(env, p)); } catch { /* keep the earlier reason */ }
    }
    if (out && out !== 'stop') return out;
    errors.push(`${p.name}: ${reason || 'بی‌جواب'}`);
  }
  throw new Error(errors.join(' | ') || 'هیچ مغز رایگان دیگری تنظیم نشده.');
}
