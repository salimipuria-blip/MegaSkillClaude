// Providers: one small adapter layer for the four wire formats that cover almost everything.
//
// Keys live in this browser only (localStorage) and are sent directly to the provider. That is a
// real trade-off: no server means no secret to leak server-side, but the key is in the page. The
// UI says so plainly, and the optional Netlify proxy exists for people who prefer server-side keys.

export const PROVIDERS = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['deepseek/deepseek-chat-v3.1:free', 'z-ai/glm-4.5-air:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen3-coder:free'],
    keyHint: 'sk-or-…',
    free: true,
    browser: true,
    docs: 'https://openrouter.ai/keys',
    note: 'چند مدل رایگان دارد؛ برای کدنویسی qwen3-coder و deepseek را امتحان کن.',
  },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'moonshotai/kimi-k2-instruct'],
    keyHint: 'gsk_…',
    free: true,
    browser: false,
    docs: 'https://console.groq.com/keys',
    note: 'سریع و رایگان با سقف روزانه؛ در مرورگر معمولاً CORS می‌بندد — از پروکسی Netlify استفاده کن.',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    kind: 'openai',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    models: ['llama-3.3-70b', 'qwen-3-coder-480b'],
    keyHint: 'csk-…',
    free: true,
    browser: false,
    docs: 'https://cloud.cerebras.ai',
    note: 'توکن‌های خیلی سریع؛ سقف رایگان روزانه.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    kind: 'openai',
    url: 'https://api.mistral.ai/v1/chat/completions',
    models: ['mistral-large-latest', 'codestral-latest', 'mistral-small-latest'],
    keyHint: '…',
    free: false,
    browser: false,
    docs: 'https://console.mistral.ai/api-keys',
    note: 'Codestral برای کد خوب است؛ سقف رایگان ندارد و کلیدش پولی است.',
  },
  {
    id: 'github',
    label: 'GitHub Models',
    kind: 'openai',
    url: 'https://models.github.ai/inference/chat/completions',
    models: ['openai/gpt-4.1', 'openai/gpt-4.1-mini', 'deepseek/DeepSeek-V3-0324'],
    keyHint: 'github_pat_…',
    free: true,
    browser: false,
    docs: 'https://github.com/settings/tokens',
    note: 'با توکن GitHub و دسترسی Models؛ رایگان ولی محدود.',
  },
  {
    id: 'together',
    label: 'Together',
    kind: 'openai',
    url: 'https://api.together.xyz/v1/chat/completions',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-Coder-32B-Instruct'],
    keyHint: '…',
    free: false,
    browser: true,
    docs: 'https://api.together.xyz/settings/api-keys',
    note: 'مدل‌های باز بزرگ را ارزان می‌دهد؛ برای کد، Qwen2.5-Coder را امتحان کن.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    url: 'https://api.deepseek.com/chat/completions',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'sk-…',
    free: false,
    browser: true,
    docs: 'https://platform.deepseek.com/api_keys',
    note: 'برای کد و استدلال خوب است؛ کلید از پلتفرم خودش و پرداختی.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    url: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
    keyHint: 'sk-…',
    free: false,
    browser: true,
    docs: 'https://platform.openai.com/api-keys',
    note: 'گران‌ترین گزینه؛ برای مقایسهٔ کیفیت خوب است، برای کار روزمره لازم نیست.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
    keyHint: 'sk-ant-…',
    free: false,
    browser: true,
    docs: 'https://console.anthropic.com/settings/keys',
    note: 'کیفیت بالا در کد؛ هدر دسترسیِ مرورگر لازم است و در مرورگر کار می‌کند.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    keyHint: 'AIza…',
    free: true,
    browser: true,
    docs: 'https://aistudio.google.com/app/apikey',
    note: 'سطح رایگان دارد؛ از ایران برای ساخت کلید معمولاً VPN لازم است.',
  },
  {
    id: 'ollama',
    label: 'Ollama (محلی)',
    kind: 'openai',
    url: 'http://localhost:11434/v1/chat/completions',
    models: ['qwen2.5-coder:7b', 'llama3.1:8b'],
    keyHint: 'بدون کلید',
    free: true,
    browser: true,
    docs: 'https://ollama.com/download',
    note: 'صفر هزینه و صفر دادهٔ بیرونی؛ باید OLLAMA_ORIGINS را برای این دامنه باز کنی.',
  },
  {
    id: 'proxy',
    label: 'پروکسی Netlify',
    kind: 'openai',
    url: '/api/llm',
    models: ['(همان مدلِ سرور)'],
    keyHint: 'توکن پروکسی',
    free: true,
    browser: true,
    docs: 'README § پروکسی',
    note: 'کلید روی سرور می‌ماند؛ تابع در netlify/functions/llm.mjs است.',
  },
  {
    id: 'custom',
    label: 'سازگار با OpenAI (دلخواه)',
    kind: 'openai',
    url: '',
    models: ['…'],
    keyHint: 'اختیاری',
    free: true,
    browser: true,
    docs: '',
    note: 'هر آدرسی که با OpenAI سازگار است: پروکسی خودت، LM Studio یا درگاه سازمانی.',
  },
];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id) {
  return PROVIDER_BY_ID.get(id) || PROVIDER_BY_ID.get('openrouter');
}

export function providerModels(id) {
  return getProvider(id).models;
}

/** Resolve {baseUrl}/{model} placeholders and strip trailing slashes from custom bases. */
export function resolveUrl({providerId, kind, baseUrl, model}) {
  const p = getProvider(providerId);
  if (providerId === 'custom' && !baseUrl) {
    // A relative URL would quietly hit this app's own origin and 404. Say what is missing instead.
    throw new Error('برای ارائه‌دهندهٔ «دلخواه» آدرس پایه لازم است (مثلاً http://localhost:11434).');
  }
  if (providerId === 'custom' || baseUrl) {
    const base = String(baseUrl || p.url).replace(/\/$/, '');
    if (base.endsWith('/chat/completions')) return base;
    // A bare host (http://localhost:11434) needs the /v1 segment; a host that already has a path
    // (…/v1) must not get a second one. Ollama users type the bare host, so this is the common case.
    const bareHost = /^https?:\/\/[^/]+$/.test(base);
    return `${base}${bareHost ? '/v1' : ''}/chat/completions`;
  }
  if (p.kind === 'gemini' || p.kind === 'anthropic') {
    return p.url.replace('{model}', encodeURIComponent(model));
  }
  return p.url;
}

/**
 * Build a provider request. Keys are only ever placed in headers or a Gemini query parameter —
 * never in a body, so a logged body cannot leak them.
 */
export function buildRequest({
  providerId = 'openrouter',
  model,
  key = '',
  messages = [],
  system = '',
  temperature = 0.3,
  maxTokens = 1600,
  tools = [],
  stream = true,
  baseUrl = '',
} = {}) {
  const p = getProvider(providerId);
  const chosenModel = model || p.models[0];
  const url = resolveUrl({providerId, kind: p.kind, baseUrl, model: chosenModel});
  const headers = { 'content-type': 'application/json' };
  let body;

  if (p.kind === 'anthropic') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    // Required for calls from a browser origin; without it the API refuses the request.
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    body = {
      model: chosenModel,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      stream,
    };
    if (tools.length) {
      body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    }
    return { url, headers, body, kind: p.kind };
  }

  if (p.kind === 'gemini') {
    const withKey = key ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : url;
    body = {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
    return { url: withKey, headers, body, kind: p.kind };
  }

  // OpenAI-compatible: OpenRouter, Groq, Cerebras, Mistral, GitHub Models, Together, DeepSeek,
  // OpenAI, Ollama, the Netlify proxy, and anything else that speaks this shape.
  if (key) headers.authorization = `Bearer ${key}`;
  if (providerId === 'openrouter') {
    headers['http-referer'] = typeof location !== 'undefined' ? location.origin : 'https://apex-metacode.vercel.app';
    headers['x-title'] = 'APEX MetaCode';
  }
  body = {
    model: chosenModel,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    temperature,
    max_tokens: maxTokens,
    stream,
  };
  if (tools.length) {
    body.tools = tools.map((t) => ({ type: 'function', function: t }));
    body.tool_choice = 'auto';
  }
  return { url, headers, body, kind: p.kind };
}

/** Normalise a non-streaming response into {text, toolCalls, usage}. */
export function readResponse(kind, json) {
  if (!json) return { text: '', toolCalls: [], usage: { in: 0, out: 0 } };
  if (kind === 'anthropic') {
    const text = (json.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const toolCalls = (json.content || [])
      .filter((c) => c.type === 'tool_use')
      .map((c) => ({ id: c.id, name: c.name, args: c.input }));
    return { text, toolCalls, usage: { in: json.usage?.input_tokens || 0, out: json.usage?.output_tokens || 0 } };
  }
  if (kind === 'gemini') {
    const cand = json.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const text = parts.map((p) => p.text || '').join('');
    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({ id: `gem-${i}`, name: p.functionCall.name, args: p.functionCall.args }));
    return {
      text,
      toolCalls,
      usage: {
        in: json.usageMetadata?.promptTokenCount || 0,
        out: json.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }
  const msg = json.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((t) => ({
    id: t.id,
    name: t.function?.name,
    args: safeJson(t.function?.arguments),
  }));
  return {
    text: msg.content || '',
    toolCalls,
    usage: { in: json.usage?.prompt_tokens || 0, out: json.usage?.completion_tokens || 0 },
  };
}

function safeJson(text) {
  if (typeof text === 'object' && text) return text;
  try {
    return JSON.parse(text || '{}');
  } catch {
    return { __raw: String(text || '') };
  }
}

/** Incremental SSE reader: accepts arbitrary chunk boundaries and emits parsed events. */
export class SSEParser {
  constructor() {
    this.buffer = '';
    this.event = null;
  }

  /** @param {string} chunk @returns {Array<{event:string, data:string}>} */
  push(chunk) {
    this.buffer += chunk;
    const events = [];
    let idx;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, '');
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) {
        if (this.event) events.push(this.event);
        this.event = null;
        continue;
      }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') {
        this.event = this.event || { event: value, data: '' };
        this.event.event = value;
      } else if (field === 'data') {
        this.event = this.event || { event: 'message', data: '' };
        this.event.data += (this.event.data ? '\n' : '') + value;
      }
    }
    return events;
  }
}

/** Turn one SSE event into a normalised delta. Returns null for keep-alives. */
export function readStreamEvent(kind, { event, data }) {
  if (data === '[DONE]') return { type: 'done' };
  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  if (kind === 'anthropic') {
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      return { type: 'delta', text: json.delta.text };
    }
    if (json.type === 'message_delta' && json.usage) {
      return { type: 'usage', out: json.usage.output_tokens || 0 };
    }
    if (json.type === 'message_start' && json.message?.usage) {
      return { type: 'usage', in: json.message.usage.input_tokens || 0 };
    }
    if (json.type === 'message_stop') return { type: 'done' };
    return null;
  }
  const choice = json.choices?.[0];
  if (!choice) {
    if (json.usage) return { type: 'usage', in: json.usage.prompt_tokens || 0, out: json.usage.completion_tokens || 0 };
    return null;
  }
  const delta = choice.delta || {};
  if (delta.content) return { type: 'delta', text: delta.content };
  if (delta.tool_calls) return { type: 'tool_delta', toolCalls: delta.tool_calls };
  if (choice.finish_reason) return { type: 'finish', reason: choice.finish_reason };
  return null;
}

/** Merge streaming tool_call deltas (OpenAI sends the name once, then argument fragments). */
export function mergeToolDeltas(state, deltas) {
  for (const d of deltas) {
    const idx = d.index ?? 0;
    if (!state[idx]) state[idx] = { id: d.id || `call-${idx}`, name: '', args: '' };
    if (d.id) state[idx].id = d.id;
    if (d.function?.name) state[idx].name += d.function.name;
    if (d.function?.arguments) state[idx].args += d.function.arguments;
  }
  return state;
}

/** Human-readable reason for the most common failure modes, in Persian. */
/**
 * Provider error bodies sometimes quote the key that failed. That text ends up in a toast, the
 * settings panel and the exported bundle, so it is redacted before it goes anywhere.
 */
export function redactSecrets(text) {
  return String(text ?? '')
    .replace(/\b(sk|rk|gsk|csk|xai|pplx|hf|ghp|glpat)[-_][A-Za-z0-9_-]{6,}/gi, '$1-***')
    .replace(/\bAIza[0-9A-Za-z_-]{10,}/g, 'AIza***')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]{8,}=*/gi, '$1 ***')
    .replace(/([?&](?:key|api_key|token|access_token)=)[^&\s"']+/gi, '$1***')
    .replace(/("(?:api_?key|key|token|authorization)"\s*:\s*")[^"]*(")/gi, '$1***$2');
}

/**
 * A request can fail before any HTTP status exists: offline, DNS, or a browser CORS block. Browsers
 * say only "Failed to fetch", which tells a user nothing — this turns it into a cause and a next step.
 */
export function explainNetworkError(err) {
  const raw = String(err?.message || err || '').slice(0, 80);
  return (
    `درخواست به شبکه نرسید${raw ? ` (${raw})` : ''}. سه علت رایج: قطع اینترنت، بلاک‌شدن درخواست ` +
    'توسط مرورگر به‌خاطر CORS، یا خاموش بودن سرور محلی. اگر کلید و اینترنت درست است، همین ارائه‌دهنده را ' +
    'از مسیر پروکسی Netlify صدا بزن؛ برای Ollama سرور را با CORS اجرا کن.'
  );
}

export function explainHttpError(status, bodyText = '') {
  const snippet = redactSecrets(String(bodyText || '')).slice(0, 240);
  if (status === 401 || status === 403) return `کلید رد شد (${status}). کلید و دسترسی مدل را بررسی کن. ${snippet}`;
  if (status === 404) return `مدل یا مسیر پیدا نشد (404). نام مدل را عوض کن. ${snippet}`;
  if (status === 429) return `سقف مصرف (429). کمی صبر کن یا مدل رایگان دیگر را انتخاب کن. ${snippet}`;
  if (status >= 500) return `خطای سمت ارائه‌دهنده (${status}). چند ثانیه بعد دوباره تلاش کن. ${snippet}`;
  if (/Failed to fetch|NetworkError|CORS/i.test(snippet)) {
    return 'درخواست از مرورگر بلاک شد (احتمالاً CORS). همین ارائه‌دهنده را از طریق پروکسی Netlify صدا بزن.';
  }
  return `خطای ${status}. ${snippet}`;
}

/**
 * Chat completion with streaming. The only function that touches the network.
 * @param {object} opts
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {(delta:{type:string,text?:string})=>void} [opts.onDelta]
 * @param {AbortSignal} [opts.signal]
 */
export async function chat(opts) {
  const {
    fetchImpl = typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null,
    onDelta,
    signal,
    stream = true,
    retries = 1,
    retryDelay = 700,
  } = opts;
  if (!fetchImpl) throw new Error('fetch در این محیط نیست');
  const req = buildRequest({ ...opts, stream });

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchImpl(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(explainHttpError(res.status, text));
        err.status = res.status;
        err.body = text;
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          lastError = err;
          await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
          continue;
        }
        throw err;
      }
      if (!stream || !res.body || !res.headers.get('content-type')?.includes('event-stream')) {
        const json = await res.json();
        const out = readResponse(req.kind, json);
        if (out.text && onDelta) onDelta({ type: 'delta', text: out.text });
        return { ...out, kind: req.kind, streamed: false };
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SSEParser();
      const toolState = {};
      let text = '';
      let usage = { in: 0, out: 0 };
      let stop = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const event of parser.push(decoder.decode(value, { stream: true }))) {
          const norm = readStreamEvent(req.kind, event);
          if (!norm) continue;
          if (norm.type === 'delta') {
            text += norm.text;
            onDelta?.({ type: 'delta', text: norm.text });
          } else if (norm.type === 'tool_delta') {
            mergeToolDeltas(toolState, norm.toolCalls);
          } else if (norm.type === 'usage') {
            usage = { in: usage.in + (norm.in || 0), out: usage.out + (norm.out || 0) };
          } else if (norm.type === 'finish') {
            stop = norm.reason;
          }
        }
      }
      const toolCalls = Object.values(toolState).map((t) => ({ id: t.id, name: t.name, args: safeJson(t.args) }));
      if (toolCalls.length && onDelta) onDelta({ type: 'tools', toolCalls });
      return { text, toolCalls, usage, kind: req.kind, streamed: true, stop };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      // No status means the request never reached the provider (offline, DNS, CORS). Retrying cannot
      // fix that and only delays the explanation, so fail fast with something the user can act on.
      if (!err?.status) {
        const explained = new Error(explainNetworkError(err));
        explained.cause = err;
        explained.offline = true;
        throw explained;
      }
      lastError = err;
      if (attempt >= retries || (err.status && err.status !== 429 && err.status < 500)) break;
      await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
    }
  }
  throw lastError || new Error('درخواست ناموفق بود');
}
