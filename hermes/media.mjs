// Voice and photos. Voice → text with Gemini (audio understanding), fallback Whisper on Workers AI.
// Photos are passed to Gemini as images; without Gemini, LLaVA on Workers AI describes them in text first.

export const WHISPER = '@cf/openai/whisper-large-v3-turbo';
export const VISION_CF = '@cf/llava-hf/llava-1.5-7b-hf';
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const TRANSCRIBE = 'Transcribe this audio exactly, in its original language (usually Persian). Output only the transcript, nothing else.';

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// "data:audio/webm;codecs=opus;base64,AAAA" → { mime: 'audio/webm', data: 'AAAA' }; anything else → null.
export function parseDataUrl(url, kind) {
  const m = /^data:([a-z]+\/[\w.+-]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/.exec(String(url || ''));
  if (!m || !m[1].startsWith(kind + '/') || m[2].length * 0.75 > MAX_MEDIA_BYTES) return null;
  return { mime: m[1], data: m[2] };
}

export async function transcribe(env, askGemini, data, mime) {
  if (env.GEMINI_API_KEY) {
    try {
      const text = await askGemini(env, [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data } }, { text: TRANSCRIBE }] }],
        'You are an accurate speech-to-text transcriber.', false);
      if (text && !text.startsWith('(')) return text.trim();
    } catch (err) {
      console.error('[Hermes] Gemini transcription failed:', err.message);
    }
  }
  if (env.AI) {
    const out = await env.AI.run(WHISPER, { audio: data });
    if (out && out.text && out.text.trim()) return out.text.trim();
  }
  throw new Error('ویس به متن تبدیل نشد. دوباره و واضح‌تر بفرست.');
}

// Fallback when Gemini cannot see the photo: a text description from Workers AI.
export async function describeImage(env, data, question) {
  if (!env.AI) throw new Error('برای دیدن عکس، کلید جمینی یا Workers AI لازم است.');
  const bin = atob(data);
  const image = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) image[i] = bin.charCodeAt(i);
  const out = await env.AI.run(VISION_CF, { image, prompt: `Describe this image in detail. ${question}`, max_tokens: 512 });
  return (out && out.description ? out.description : '').trim();
}

// Telegram file → { data: base64, mime }.
export async function telegramFile(env, fileId, fallbackMime) {
  const api = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  const info = await (await fetch(`${api}/getFile`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: fileId }),
  })).json().catch(() => ({}));
  if (!info.ok || !info.result || !info.result.file_path) throw new Error('فایل از تلگرام دریافت نشد (حداکثر ۲۰ مگابایت).');
  const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`);
  if (!res.ok) throw new Error('دانلود فایل از تلگرام ناموفق بود.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error('فایل خیلی بزرگ است (حداکثر ۸ مگابایت).');
  const ext = info.result.file_path.split('.').pop().toLowerCase();
  const mime = { oga: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] || fallbackMime;
  return { data: bytesToBase64(bytes), mime };
}
