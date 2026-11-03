// A tiny OpenAI-compatible chat client for a LOCAL model (DeepSeek via Ollama or LM Studio).
// Zero dependencies: Node's global fetch and AbortController only. Nothing here reaches the network
// until you call it, and the loop injects this client so tests can run with a fake instead.
//
// Common local endpoints (both speak the OpenAI /v1/chat/completions shape):
//   Ollama      base http://localhost:11434/v1   model e.g. deepseek-r1 / deepseek-coder-v2
//   LM Studio   base http://localhost:1234/v1    model = whatever you loaded
// Override with env: INFINITY_LOOP_BASE_URL, INFINITY_LOOP_MODEL, INFINITY_LOOP_API_KEY.

export const KNOWN_ENDPOINTS = [
  { name: 'ollama', base: 'http://localhost:11434/v1', tags: 'http://localhost:11434/api/tags' },
  { name: 'lmstudio', base: 'http://localhost:1234/v1', tags: null },
];

export function resolveConfig(env = process.env) {
  return {
    baseUrl: env.INFINITY_LOOP_BASE_URL || null,
    model: env.INFINITY_LOOP_MODEL || null,
    apiKey: env.INFINITY_LOOP_API_KEY || 'not-needed',
    timeoutMs: Number(env.INFINITY_LOOP_TIMEOUT_MS || 120000),
  };
}

async function getJSON(url, { timeoutMs = 4000, headers = {} } = {}, fetchImpl = fetch) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Find a reachable local endpoint and a model id to use. Returns null if nothing answers. */
export async function probe({ env = process.env, fetchImpl = fetch } = {}) {
  const cfg = resolveConfig(env);
  const candidates = cfg.baseUrl ? [{ name: 'custom', base: cfg.baseUrl, tags: null }] : KNOWN_ENDPOINTS;
  for (const ep of candidates) {
    try {
      const data = await getJSON(`${ep.base}/models`, { headers: authHeader(cfg.apiKey) }, fetchImpl);
      const ids = (data?.data || []).map((m) => m.id);
      const model = cfg.model || ids.find((id) => /deepseek/i.test(id)) || ids[0];
      if (model) return { endpoint: ep.name, baseUrl: ep.base, model, models: ids };
    } catch {
      // Ollama also answers /api/tags with {models:[{name}]} when /v1/models is quiet.
      if (ep.tags) {
        try {
          const data = await getJSON(ep.tags, {}, fetchImpl);
          const ids = (data?.models || []).map((m) => m.name);
          const model = cfg.model || ids.find((id) => /deepseek/i.test(id)) || ids[0];
          if (model) return { endpoint: ep.name, baseUrl: ep.base, model, models: ids };
        } catch { /* keep trying */ }
      }
    }
  }
  return null;
}

const authHeader = (key) => (key && key !== 'not-needed' ? { Authorization: `Bearer ${key}` } : {});

/**
 * One chat completion against an OpenAI-compatible endpoint.
 * @returns {Promise<{content:string, model:string}>}
 */
export async function chat({ baseUrl, model, apiKey = 'not-needed', messages, temperature = 0, timeoutMs = 120000 }, fetchImpl = fetch) {
  if (!baseUrl || !model) throw new Error('chat needs baseUrl and model (run `infinity-loop doctor` to detect them)');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(apiKey) },
      body: JSON.stringify({ model, temperature, stream: false, messages }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`chat HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('no message content in response');
    return { content, model: data?.model || model };
  } finally {
    clearTimeout(t);
  }
}

/** Build a client the loop can call: client({messages}) -> {content}. */
export function makeClient(resolved) {
  return ({ messages, temperature }) => chat({ ...resolved, messages, temperature });
}
