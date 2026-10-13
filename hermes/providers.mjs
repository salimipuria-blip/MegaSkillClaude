// Free text brains with an OpenAI-compatible API. Each one is used only when its key is set as a Cloudflare
// secret; they run in this order after Gemini and before Workers AI, so a full quota on one hands over to the next.
// Model lists can be overridden with a comma-separated secret/var (e.g. GROQ_MODELS) when providers rename models.
export const PROVIDERS = [
  { name: 'GitHub Models', key: 'GITHUB_MODELS_TOKEN', list: 'GITHUB_MODELS', url: 'https://models.github.ai/inference/chat/completions',
    models: ['openai/gpt-4.1', 'openai/gpt-4o', 'openai/gpt-4.1-mini'] },
  { name: 'Groq', key: 'GROQ_API_KEY', list: 'GROQ_MODELS', url: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.3-70b-versatile', 'qwen/qwen3-32b'] },
  { name: 'Cerebras', key: 'CEREBRAS_API_KEY', list: 'CEREBRAS_MODELS', url: 'https://api.cerebras.ai/v1/chat/completions',
    models: ['llama-3.3-70b', 'qwen-3-32b'] },
  { name: 'OpenRouter', key: 'OPENROUTER_API_KEY', list: 'OPENROUTER_MODELS', url: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['deepseek/deepseek-chat-v3-0324:free', 'meta-llama/llama-3.3-70b-instruct:free'] },
];

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

// Tries every configured provider and model; returns the first non-empty answer, or throws with the last error.
export async function askProviders(env, contents, system) {
  const messages = toMessages(contents, system);
  let last = '';
  for (const p of configuredProviders(env)) {
    for (const model of modelsOf(env, p)) {
      try {
        const res = await fetch(p.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${env[p.key]}` },
          body: JSON.stringify({ model, messages, max_tokens: 2048 }),
        });
        if (res.status === 401 || res.status === 403) { last = `${p.name}: کلید پذیرفته نشد (${res.status})`; break; }
        if (!res.ok) { last = `${p.name} ${model}: ${res.status}`; continue; }
        const data = await res.json();
        const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (text && String(text).trim()) return String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      } catch (err) {
        last = `${p.name}: ${err.message}`;
      }
    }
  }
  throw new Error(last || 'هیچ مغز رایگان دیگری تنظیم نشده.');
}
