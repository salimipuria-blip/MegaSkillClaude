// Image generation. First choice: Google's Gemini image models (AI Studio key, free tier where available),
// found automatically from the key's model list, newest first. Fallback: FLUX.1 schnell on Workers AI (free, no key).
// Triggered by messages such as «عکس بساز: ...», «تصویر بساز ...» or /img ... in Telegram and the web app.

export const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const DAY = 86400;
const IMAGE_RE = /^(?:\/img(?:@\w+)?|\/image|(?:یه|یک)?\s*(?:عکس|تصویر|پوستر|طرح)\s*(?:بساز|بکش|درست\s*کن)|بساز\s*(?:یه|یک)?\s*(?:عکس|تصویر)|draw|generate\s+(?:an?\s+)?image(?:\s+of)?)\s*[:：،,.\-]?\s*/i;
const PROMPT_SYSTEM = 'You write prompts for a photorealistic text-to-image model. Rewrite the request as ONE vivid English prompt ' +
  '(subject, setting, light, mood, camera/composition, "ultra realistic, high detail"). Keep every concrete detail the user gave. ' +
  'No text, letters or logos in the image unless asked. Output only the prompt, at most 80 words.';

// «عکس بساز: X» → "X"; anything else → null. An empty description is still an image request ("").
export function imageRequest(input) {
  const m = String(input).trim().match(IMAGE_RE);
  return m ? String(input).trim().slice(m[0].length).trim().slice(0, 1000) : null;
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

// Returns { image: base64, mime, model }. Tries Gemini image models, then FLUX.
export async function makeImage(env, prompt) {
  let geminiErr = null;
  if (env.GEMINI_API_KEY) {
    try { return await geminiImage(env, prompt); } catch (err) { geminiErr = err; console.error('[Hermes] Gemini image failed:', err.message); }
  }
  if (!env.AI) throw geminiErr || new Error('برای ساخت عکس، کلید جمینی یا اتصال Workers AI (binding AI) لازم است.');
  const out = await env.AI.run(IMAGE_MODEL, { prompt, steps: 8 });
  if (!out || !out.image) throw new Error('مدل تصویر جوابی نداد. دوباره امتحان کن.');
  return { image: out.image, mime: 'image/jpeg', model: 'flux-1-schnell' };
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
