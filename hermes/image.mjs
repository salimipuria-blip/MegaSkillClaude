// Image generation: the best free models on Cloudflare Workers AI (FLUX.2, Leonardo, FLUX.1), then Gemini image if paid.
// Triggered by messages such as «عکس بساز: ...», «تصویر بساز ...» or /img ... in Telegram and the web app.

export const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const DAY = 86400;
const IMAGE_RE = /^(?:\/img(?:@\w+)?|\/image|(?:یه|یک)?\s*(?:عکس|تصویر|پوستر|طرح)\s*(?:بساز|بکش|درست\s*کن)|بساز\s*(?:یه|یک)?\s*(?:عکس|تصویر)|draw|generate\s+(?:an?\s+)?image(?:\s+of)?)\s*[:：،,.\-]?\s*/i;
const PROMPT_SYSTEM = 'You write prompts for a photorealistic text-to-image model. Rewrite the request as ONE vivid English prompt ' +
  '(subject, setting, light, mood, camera/composition, "ultra realistic, high detail"). Keep every concrete detail the user gave. ' +
  'No text, letters or logos in the image unless asked. Output only the prompt, at most 80 words.';

// Natural requests anywhere in the sentence: «یه عکس از جنگل پاییزی بساز/بده/بکش», «generate an image of ...».
const NOUN = '(?:عکس|تصویر|پوستر|بنر|لوگو|والپیپر|کاور|طرح|نقاشی|ایلوستریشن)';
const VERB = '(?:بساز|بسازی|بسازید|بکش|درست\\s*کن|طراحی\\s*کن|تولید\\s*کن|خلق\\s*کن|بده|بفرست)';
const INTENT_FA = new RegExp(`${NOUN}[^.!؟?\\n]{0,60}?${VERB}(?![\\u0600-\\u06FF])`);
const INTENT_EN = /\b(?:generate|create|draw|make|render)\s+(?:me\s+)?(?:an?\s+|the\s+)?(?:\w+\s+){0,3}?(?:image|picture|photo|poster|illustration|logo)\b/i;
const NOT_NEW = /(?:این|اون|همین)\s*(?:عکس|تصویر)|عکسی\s*که|عکسم|عکس\s*رو\s*ببین|this\s+(?:image|photo|picture)/i;

// «عکس بساز: X» → "X"; a natural request → the whole sentence; anything else → null.
// An empty description after the prefix is still an image request ("").
export function imageRequest(input) {
  const text = String(input).trim();
  const m = text.match(IMAGE_RE);
  if (m) return text.slice(m[0].length).trim().slice(0, 1000);
  if (text.length <= 600 && !NOT_NEW.test(text) && (INTENT_FA.test(text) || INTENT_EN.test(text))) return text.slice(0, 1000);
  return null;
}

// Persian (or short) requests become a detailed English prompt; if the text brain fails, use the request as is.
export async function imagePrompt(ask, env, request) {
  try {
    const out = (await ask(env, [{ role: 'user', parts: [{ text: request }] }], PROMPT_SYSTEM, false)).trim().replace(/^["'`]+|["'`]+$/g, '');
    return out ? out.slice(0, 2000) : request;
  } catch {
    return request;
  }
}

// Free models on Cloudflare Workers AI, best first; all share the free 10,000 neurons/day, so when the budget
// is low the expensive ones fail and the next, cheaper one answers. None adds a watermark.
//   FLUX.2 [dev] ≈ 2/day · Leonardo Lucid Origin ≈ 3/day · Leonardo Phoenix ≈ 4/day · FLUX.2 [klein] 9B ≈ 7/day · FLUX.1 schnell: many.
export const CF_IMAGE_MODELS = [
  { id: '@cf/black-forest-labs/flux-2-dev', name: 'flux-2-dev', multipart: true, extra: { steps: 25 } },
  { id: '@cf/leonardo/lucid-origin', name: 'lucid-origin', extra: { steps: 30 } },
  { id: '@cf/leonardo/phoenix-1.0', name: 'phoenix-1.0', extra: { num_steps: 25 } },
  { id: '@cf/black-forest-labs/flux-2-klein-9b', name: 'flux-2-klein-9b', multipart: true, extra: {} },
  { id: IMAGE_MODEL, name: 'flux-1-schnell', square: true, extra: { steps: 8 } },
];

// Shape from the request: story/reel 9:16, post/portrait 4:5, banner/landscape 16:9, else square.
export function sizeFor(text) {
  const t = String(text || '');
  if (/استوری|ریلز|story|reel|9:16/i.test(t)) return { width: 768, height: 1344 };
  if (/پست|اینستا|عمودی|پرتره|post|portrait|4:5/i.test(t)) return { width: 1024, height: 1280 };
  if (/بنر|افقی|کاور|landscape|banner|16:9|wide/i.test(t)) return { width: 1344, height: 768 };
  return { width: 1024, height: 1024 };
}

const sniff = (b) => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0x52 && b[1] === 0x49 ? 'image/webp' : 'image/jpeg');

// Workers AI image models answer as { image: base64 }, a ReadableStream, or raw bytes.
async function normalize(out) {
  if (!out) return null;
  if (typeof out.image === 'string' && out.image) {
    const head = atob(out.image.slice(0, 16));
    return { image: out.image, mime: sniff([head.charCodeAt(0), head.charCodeAt(1)]) };
  }
  let bytes = null;
  if (out instanceof Uint8Array) bytes = out;
  else if (out instanceof ArrayBuffer) bytes = new Uint8Array(out);
  else if (typeof out.getReader === 'function') bytes = new Uint8Array(await new Response(out).arrayBuffer());
  if (!bytes || bytes.length < 100) return null;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { image: btoa(bin), mime: sniff(bytes) };
}

async function runCloudflare(env, m, prompt, size) {
  const params = { prompt, ...(m.square ? {} : size), ...m.extra };
  if (!m.multipart) return env.AI.run(m.id, params);
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, String(v));
  const body = new Response(form);
  return env.AI.run(m.id, { multipart: { body: body.body, contentType: body.headers.get('content-type') } });
}

// Returns { image: base64, mime, model }. Free Cloudflare models first (no watermark), Gemini image last
// (the Gemini API image models are paid-only now and carry Google's invisible SynthID mark).
export async function makeImage(env, prompt, size = { width: 1024, height: 1024 }) {
  let lastErr = null;
  if (env.AI) {
    for (const m of CF_IMAGE_MODELS) {
      try {
        const out = await normalize(await runCloudflare(env, m, prompt, size));
        if (out) return { ...out, model: m.name };
        lastErr = new Error(`${m.name}: empty`);
      } catch (err) {
        lastErr = err;
        console.error(`[Hermes] ${m.name} failed:`, err.message);
      }
    }
  }
  if (env.GEMINI_API_KEY) {
    try { return await geminiImage(env, prompt); } catch (err) { lastErr = err; }
  }
  if (!env.AI && !env.GEMINI_API_KEY) throw new Error('برای ساخت عکس، اتصال Workers AI (binding AI) یا کلید جمینی لازم است.');
  throw new Error(`سهمیهٔ رایگان امروزِ ساخت عکس تمام شده یا مدل‌ها جواب ندادند؛ فردا دوباره امتحان کن. (${lastErr ? lastErr.message : ''})`);
}

// Image-capable Gemini models for this key (e.g. gemini-*-flash-image), newest version first, "pro" before "flash".
// Imagen is skipped: it is paid-only. The list is cached for a day; the last model that worked is tried first.
export async function geminiImageModels(env) {
  const cached = env.MEMORY ? await env.MEMORY.get('image-models', 'json') : null;
  let models = cached;
  if (!models) {
    const res = await fetch(`${GEMINI_API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
    if (!res.ok) throw new Error(`فهرست مدل‌های جمینی در دسترس نیست (${res.status}).`);
    const data = await res.json();
    const version = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
    models = (data.models || [])
      .filter((m) => /image/i.test(m.name) && !/imagen/i.test(m.name) &&
        (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .sort((a, b) => version(b) - version(a) || /pro/.test(b) - /pro/.test(a) || a.localeCompare(b));
    if (env.MEMORY) await env.MEMORY.put('image-models', JSON.stringify(models), { expirationTtl: DAY });
  }
  const last = env.MEMORY ? await env.MEMORY.get('image-model') : null;
  return last && models.includes(last) ? [last, ...models.filter((m) => m !== last)] : models;
}

export async function geminiImage(env, prompt) {
  const models = await geminiImageModels(env);
  if (!models.length) throw new Error('این کلید جمینی مدل تصویر ندارد.');
  let lastErr = null;
  for (const model of models) {
    const res = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
    });
    if (!res.ok) { lastErr = new Error(`${model}: ${res.status}`); continue; } // quota, paid-only or gone: try the next
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const img = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!img) { lastErr = new Error(`${model}: no image`); continue; }
    if (env.MEMORY) await env.MEMORY.put('image-model', model);
    return { image: img.inlineData.data, mime: img.inlineData.mimeType || 'image/png', model };
  }
  throw lastErr || new Error('هیچ مدل تصویر جمینی جواب نداد.');
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
