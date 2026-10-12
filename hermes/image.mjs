// Image generation with Cloudflare Workers AI (FLUX.1 schnell): free daily quota, no key, uses the AI binding.
// Triggered by messages such as «عکس بساز: ...», «تصویر بساز ...» or /img ... in Telegram and the web app.

export const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
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
    const out = (await ask(env, [{ role: 'user', parts: [{ text: request }] }], PROMPT_SYSTEM)).trim().replace(/^["'`]+|["'`]+$/g, '');
    return out ? out.slice(0, 2000) : request;
  } catch {
    return request;
  }
}

// Returns the image as base64 JPEG.
export async function makeImage(env, prompt) {
  if (!env.AI) throw new Error('برای ساخت عکس، اتصال Workers AI (binding AI) لازم است.');
  const out = await env.AI.run(IMAGE_MODEL, { prompt, steps: 8 });
  if (!out || !out.image) throw new Error('مدل تصویر جوابی نداد. دوباره امتحان کن.');
  return out.image;
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
