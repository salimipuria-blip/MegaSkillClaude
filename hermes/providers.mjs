import { fetchWithTimeout, ServicePark, isAuthStatus } from './resilience.mjs';
import { SKILLS } from './skills.mjs';
// Free text brains with an OpenAI-compatible API. GitHub Models gives every model its own daily quota, so many models
// are listed (and more are read from its catalog when those are busy) to get as many free answers a day as possible.
// Each one is used only when its key is set as a Cloudflare
// secret; they run in this order after Gemini and before Workers AI, so a full quota on one hands over to the next.
// Model names go stale, so when none of the listed ones exist (404) the provider's own model list is read and the
// best match is used (and remembered in KV). A comma-separated secret/var (e.g. GROQ_MODELS) overrides the list.
// Coding mode tries each provider's code-specialist models (codeModels) first and allows longer answers.
// Free tiers cap the request size (GitHub ~8k tokens, Groq 6–12k tokens/min), so the prompt is trimmed to `budget`
// characters and retried much shorter when a provider still says it is too large (413).
export const PROVIDERS = [
  { name: 'GitHub Models', key: 'GITHUB_MODELS_TOKEN', list: 'GITHUB_MODELS', url: 'https://models.github.ai/inference/chat/completions',
    budget: 12000, catalog: 'https://models.github.ai/catalog/models', models: [
      'openai/gpt-4.1', 'openai/gpt-4o', 'deepseek/DeepSeek-V3-0324', 'xai/grok-3', 'meta/Llama-4-Maverick-17B-128E-Instruct-FP8',
      'mistral-ai/mistral-medium-2505', 'openai/gpt-4.1-mini', 'meta/Llama-3.3-70B-Instruct', 'openai/gpt-4o-mini',
      'xai/grok-3-mini', 'cohere/cohere-command-a',
    ], codeModels: ['openai/gpt-4.1', 'deepseek/DeepSeek-V3-0324', 'mistral-ai/Codestral-2501'], discover: 8 },
  { name: 'Groq', key: 'GROQ_API_KEY', list: 'GROQ_MODELS', url: 'https://api.groq.com/openai/v1/chat/completions',
    budget: 14000, catalog: 'https://api.groq.com/openai/v1/models', models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3-32b'],
    codeModels: ['openai/gpt-oss-120b', 'qwen/qwen3-32b'] },
  { name: 'Cerebras', key: 'CEREBRAS_API_KEY', list: 'CEREBRAS_MODELS', url: 'https://api.cerebras.ai/v1/chat/completions',
    catalog: 'https://api.cerebras.ai/v1/models', models: ['llama-3.3-70b', 'gpt-oss-120b', 'qwen-3-32b'],
    codeModels: ['qwen-3-coder-480b', 'gpt-oss-120b'] },
  { name: 'Mistral', key: 'MISTRAL_API_KEY', list: 'MISTRAL_MODELS', url: 'https://api.mistral.ai/v1/chat/completions',
    catalog: 'https://api.mistral.ai/v1/models', models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
    codeModels: ['codestral-latest', 'devstral-medium-latest'] },
  { name: 'Hugging Face', key: 'HF_TOKEN', list: 'HF_MODELS', url: 'https://router.huggingface.co/v1/chat/completions',
    catalog: 'https://router.huggingface.co/v1/models', models: ['deepseek-ai/DeepSeek-V3-0324', 'meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen3-32B'],
    codeModels: ['Qwen/Qwen3-Coder-480B-A35B-Instruct'] },
  { name: 'OpenRouter', key: 'OPENROUTER_API_KEY', list: 'OPENROUTER_MODELS', url: 'https://openrouter.ai/api/v1/chat/completions',
    catalog: 'https://openrouter.ai/api/v1/models', models: ['deepseek/deepseek-chat-v3-0324:free', 'meta-llama/llama-3.3-70b-instruct:free'],
    codeModels: ['qwen/qwen3-coder:free'] },
  // No key needed: Pollinations' free public text API (set FREE_TEXT=off to disable). Last, as it is slower and public.
  { name: 'Pollinations', key: null, off: 'FREE_TEXT', list: 'POLLINATIONS_MODELS', url: 'https://text.pollinations.ai/openai',
    budget: 9000, models: ['openai', 'mistral', 'deepseek'] },
];

// Preferred families when discovering, best first; chat models only.
const PREFER = [/gpt-4\.1(?!-nano)/i, /gpt-4o(?!-mini)/i, /gpt-oss-120b/i, /deepseek.*(v3|chat)/i, /llama-?3\.3-70b|llama-4/i, /qwen-?3/i, /gpt|llama|qwen|mistral|gemma/i];
const NOT_CHAT = /whisper|tts|embed|guard|vision-preview|audio|image|moderation|(^|\/)o\d/i;

export const configuredProviders = (env) => PROVIDERS.filter((p) => (p.key ? env[p.key] : env[p.off] !== 'off'));
const authHeader = (env, p) => (p.key ? { authorization: `Bearer ${String(env[p.key]).trim()}` } : {});

// Exported so the prompt-budget test measures the real numbers instead of a copy of them.
export const FULL_BUDGET = 24000;
export const SMALL_BUDGET = 5000;
const MAX_CALLS = 16;
const MAX_TOTAL = 34; // all providers together, leaving room for Gemini, Telegram and KV under the limit of 50

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
  const res = await fetchWithTimeout(p.catalog, { headers: authHeader(env, p) });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const list = Array.isArray(data) ? data : (data && data.data) || [];
  const ids = list.map((m) => m && (m.id || m.name)).filter((id) => typeof id === 'string' && !NOT_CHAT.test(id))
    .filter((id) => p.name !== 'OpenRouter' || id.endsWith(':free'));
  const rank = (id) => { const i = PREFER.findIndex((re) => re.test(id)); return i < 0 ? PREFER.length : i; };
  return ids.sort((a, b) => rank(a) - rank(b)).slice(0, p.discover || 3);
}

const cut = (text, max) => (text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text);
const PERSONA_CHARS = 1500; // identity + style at the head of every system prompt

// Blocks that must survive any trim: the owner's project knowledge and long-term notes. Losing them
// makes Hermes answer without the owner's own facts, which reads as a wrong answer rather than a
// shorter one — that was the backlog task 21 finding at the 5000-char budget (GitHub Models): a plain
// head+tail cut kept the newest notes but dropped the knowledge header and the portfolio facts.
const PROTECTED_MARKERS = ['OWNER PORTFOLIO KNOWLEDGE', 'LONG-TERM NOTES'];
const PROTECTED_SHARE = 0.55;  // at most this share of a tight budget goes to the protected blocks
const MIN_PROTECTED = 300;     // …but never less than this, or the markers themselves would not fit

function firstMarkerAt(text) {
  let best = -1;
  for (const marker of PROTECTED_MARKERS) {
    const at = text.indexOf(marker);
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  return best;
}

// Clips one protected block without losing its own marker: the marker line stays, then the body.
// Notes keep their newest lines (the tail), knowledge keeps its first facts (the head), because that
// is the order each block is written in.
function clipBlock(block, max) {
  if (block.length <= max) return block;
  const newline = block.indexOf('\n');
  const header = newline > 0 && newline + 1 <= max ? block.slice(0, newline + 1) : block.slice(0, Math.max(0, max - 1));
  const room = Math.max(0, max - header.length - 1);
  const body = block.startsWith('LONG-TERM NOTES')
    ? block.slice(Math.max(header.length, block.length - room))
    : block.slice(header.length, header.length + room);
  return `${header}…${body}`;
}

// Splits the protected region at every marker, so each block gets a share and no marker is lost.
function clipProtected(region, max) {
  const starts = [];
  for (const marker of PROTECTED_MARKERS) {
    for (let from = 0; from < region.length;) {
      const at = region.indexOf(marker, from);
      if (at < 0) break;
      starts.push(at);
      from = at + marker.length;
    }
  }
  const cuts = [...new Set(starts)].sort((a, b) => a - b);
  if (!cuts.length) return cut(region, max);
  const lead = region.slice(0, cuts[0]);
  const blocks = cuts.map((start, i) => region.slice(start, i + 1 < cuts.length ? cuts[i + 1] : region.length));
  const share = Math.max(PROTECTED_MARKERS[1].length + 2, Math.floor((max - lead.length) / blocks.length));
  return lead + blocks.map((block) => clipBlock(block, share)).join('');
}

// Shrinks a system prompt without losing what makes Hermes Hermes. The static skill pack (SKILLS) sits in the
// middle of the prompt, before the per-turn parts (memory notes, project knowledge, coding playbook, routed skills),
// so a plain head cut dropped all of those on every small-budget provider. Here the skill pack gives way first;
// if the rest is still too long, the persona head and the newest tail are kept.
export function fitSystem(text, max) {
  if (text.length <= max) return text;
  const protectedAt = firstMarkerAt(text);
  if (protectedAt >= 0) {
    // Reserve room for the owner's own facts first; the persona and the skill pack share the rest.
    const region = text.slice(protectedAt);
    const reserve = Math.min(region.length, Math.max(MIN_PROTECTED, Math.floor(max * PROTECTED_SHARE)));
    const headRoom = Math.max(0, max - reserve);
    const head = headRoom > 0 ? fitPersona(text.slice(0, protectedAt), headRoom) : '';
    return head + (region.length <= reserve ? region : clipProtected(region, reserve));
  }
  return fitPersona(text, max);
}

// The persona half of the trim: the skill pack gives way first, then the head and the newest tail stay.
function fitPersona(text, max) {
  if (text.length <= max) return text;
  const at = text.indexOf(SKILLS);
  if (at >= 0) {
    const core = text.slice(0, at) + text.slice(at + SKILLS.length);
    if (core.length < max) return text.slice(0, at) + cut(SKILLS, max - core.length) + text.slice(at + SKILLS.length);
    text = core;
  }
  if (text.length <= max) return text;
  const head = Math.min(PERSONA_CHARS, Math.floor(max / 3));
  return `${text.slice(0, head)}\n…\n${text.slice(text.length - (max - head - 3))}`;
}

// Keeps the system prompt (up to ~half the budget), the latest message, and as much recent history as fits.
export function fitContext(messages, budget) {
  const [system, ...rest] = messages;
  if (!rest.length) return [{ ...system, content: fitSystem(system.content, budget) }];
  const last = rest.at(-1);
  const lastText = cut(last.content, Math.floor(budget * 0.4));
  const sys = fitSystem(system.content, Math.max(500, Math.floor(budget * 0.5)));
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

async function callModel(env, p, model, messages, maxTokens = 2048) {
  const res = await fetchWithTimeout(p.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(env, p) },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
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
export async function askProviders(env, contents, system, { code = false } = {}) {
  const all = toMessages(contents, system);
  const errors = [];
  let total = 0;
  // Task 20: a key that was rejected three times in a row is parked in KV for an hour, so the next
  // isolate does not spend an outbound call (and the owner's wait) on a service that cannot answer.
  const park = env.MEMORY ? new ServicePark({ kv: env.MEMORY }) : null;
  for (const p of configuredProviders(env)) {
    if (total >= MAX_TOTAL) { errors.push(`${p.name}: نوبت نرسید`); continue; }
    if (park) {
      const parkedUntil = await park.parked(p.name);
      if (parkedUntil) {
        const minutes = Math.max(1, Math.round((parkedUntil.parkedUntil - park.now()) / 60000));
        errors.push(`${p.name}: کلیدش ${park.threshold} بار پشت‌سرهم رد شد؛ تا حدود ${minutes} دقیقهٔ دیگر صدا زده نمی‌شود`);
        continue;
      }
    }
    const cacheKey = `provider-model:${code ? 'code:' : ''}${p.name}`;
    const cached = env.MEMORY ? await env.MEMORY.get(cacheKey) : null;
    const full = fitContext(all, p.budget || FULL_BUDGET);
    const small = fitContext(all, SMALL_BUDGET);
    const tried = new Set();
    const reasons = [];
    let allMissing = true, calls = 0;
    const attempt = async (models) => {
      for (const model of models) {
        if (tried.has(model)) continue;
        if (calls >= MAX_CALLS || total >= MAX_TOTAL) break; // stay well under the Workers limit of 50 outbound requests per message
        tried.add(model);
        try {
          calls++; total++;
          const maxTokens = code ? 4096 : 2048;
          let r = await callModel(env, p, model, full, maxTokens);
          if (tooLarge(r)) { calls++; total++; r = await callModel(env, p, model, small, maxTokens); }
          if (isAuthStatus(r.status)) {
            reasons.push(`کلید پذیرفته نشد (${r.status})`);
            if (park) await park.failAuth(p.name, r.status);
            allMissing = false;
            return 'stop';
          }
          if (r.status !== 200) {
            reasons.push(`${model}: ${r.status}${r.why ? ` ${r.why}` : ''}`);
            if (r.status !== 404 && !(r.status === 400 && !tooLarge(r))) allMissing = false;
            continue;
          }
          if (r.text) {
            if (park) await park.succeed(p.name);
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
    let out = await attempt([...(cached ? [cached] : []), ...(code ? p.codeModels || [] : []), ...modelsOf(env, p)]);
    if (out === null && (allMissing || p.discover) && p.catalog) {
      try { out = await attempt(await discoverModels(env, p)); } catch { /* keep the earlier reasons */ }
    }
    if (out && out !== 'stop') return out;
    errors.push(`${p.name}: ${reasons.join('، ') || 'بی‌جواب'}`);
  }
  throw new Error(errors.join(' | ') || 'هیچ مغز رایگان دیگری تنظیم نشده.');
}
