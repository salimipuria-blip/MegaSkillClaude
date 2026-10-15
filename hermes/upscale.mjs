import { fetchWithTimeout } from './resilience.mjs';
// Final quality pass for Hermes photo editing: the models that edit also decide the resolution, and
// the free ones hand back a 1024px picture even when the user sent a 4000px photo. This module puts
// the delivered bytes back up to a professional size with a real upscaler, and refuses to pretend
// when no upscaler is configured.
//
// Backend (skill library: library/github-skills/stability-ai — «Upscale (aumentar resolucao)»):
//   POST https://api.stability.ai/v2beta/stable-image/upscale/fast       (2x, no prompt)
//   POST https://api.stability.ai/v2beta/stable-image/upscale/conservative (prompt, max fidelity)
// Both are multipart, authenticate with `Authorization: Bearer`, and answer JSON base64 when asked
// with `Accept: application/json`. The free platform account covers personal use, so this stays
// inside the repo's zero-cost policy: no key → the pass is skipped honestly.
//
// Everything here is best-effort: a failed upscale never costs the user their edited picture.

import { imageInfo, base64Bytes, bytesToBase64, mimeOf, EDIT_MAX_BYTES, faDigits } from './image-bytes.mjs';

const API = 'https://api.stability.ai/v2beta/stable-image/upscale';

/** Longest side below this is worth putting through the upscaler (models hand back ~1024px). */
export const UPSCALE_TARGET = 1600;
/** Never return anything the messaging layer cannot carry. */
const MAX_OUT = EDIT_MAX_BYTES * 4 / 3;

const toBytes = (b64) => base64Bytes(b64);

async function stability(env, endpoint, image, mime, { prompt = '', creativity = 0.3 } = {}) {
  const form = new FormData();
  form.append('image', new Blob([toBytes(image)], { type: mime }), mime === 'image/png' ? 'in.png' : 'in.jpg');
  form.append('output_format', 'png');
  if (endpoint === 'conservative') {
    form.append('prompt', String(prompt || 'photograph').slice(0, 10000));
    form.append('creativity', String(creativity));
  }
  const res = await fetchWithTimeout(`${API}/${endpoint}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.STABILITY_API_KEY}`, accept: 'application/json' },
    body: form,
  });
  if (!res.ok) {
    const why = await res.json().then((d) => d && (d.errors || d.message)).catch(() => '');
    throw new Error(`Stability ${endpoint}: ${res.status}${why ? ` (${JSON.stringify(why).slice(0, 120)})` : ''}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!data || typeof data.image !== 'string' || !data.image) throw new Error(`Stability ${endpoint}: no image`);
  if (data.finish_reason && data.finish_reason !== 'SUCCESS') throw new Error(`Stability ${endpoint}: ${data.finish_reason}`);
  const info = imageInfo(toBytes(data.image));
  if (!info) throw new Error(`Stability ${endpoint}: unusable pixels`);
  return { image: data.image, mime: info.mime, info, model: `Stability ${endpoint}`, provider: 'stability' };
}

/**
 * Put one picture back up to a professional size. Returns null (and logs, never throws) when no
 * upscaler is configured or the bytes cannot be carried — the caller delivers the original instead.
 */
export async function upscaleImage(env, image, mime, { prompt = '', creativity = 0.3 } = {}) {
  if (!env.STABILITY_API_KEY) return null;
  const before = imageInfo(toBytes(image));
  const errors = [];
  for (const endpoint of ['fast', 'conservative']) {
    try {
      const out = await stability(env, endpoint, image, mime, { prompt, creativity });
      if (out.image.length > MAX_OUT) { errors.push(`${endpoint}: output too large`); continue; }
      // Only accept an actual improvement.
      const gained = before && out.info.width * out.info.height > before.width * before.height;
      if (!gained) { errors.push(`${endpoint}: no resolution gain`); continue; }
      return { ...out, before, scale: before && before.width ? out.info.width / before.width : 2 };
    } catch (err) {
      errors.push(String(err.message).slice(0, 160));
    }
  }
  console.error('[Hermes] upscale skipped:', errors.join(' | '));
  return { failed: true, errors, before, model: null, image: null };
}

/**
 * Should the delivered picture go through the final pass at all? Only when it is smaller than a
 * professional deliverable and the user did not ask for a deliberately small frame.
 */
export function worthUpscaling(info, original = null) {
  if (!info || !info.width) return false;
  const longest = Math.max(info.width, info.height);
  if (longest >= UPSCALE_TARGET) return false;
  // If the model already improved on the original, leave it alone; the point is to recover size.
  if (original && original.width && Math.max(original.width, original.height) <= longest) return false;
  return true;
}

/** Caption line for the quality pass, or '' when nothing happened. */
export function upscaleNote(result) {
  if (!result || !result.image) return '';
  const dims = result.info ? `${faDigits(result.info.width)}×${faDigits(result.info.height)}` : '';
  return `🔎 کیفیت نهایی: ${dims}${result.scale && result.scale > 1.05 ? ` (${faDigits(Math.round(result.scale * 100) / 100)}× بزرگ‌تر)` : ''}`;
}
