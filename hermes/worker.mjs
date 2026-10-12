// Hermes Lite: Telegram bot + Gemini on Cloudflare Workers. Free, 24/7, no server, no card.
// Secrets (Worker → Settings → Variables and Secrets, type "Secret"):
//   TELEGRAM_BOT_TOKEN, ALLOWED_USER_ID, and optionally GEMINI_API_KEY.
// Brain: Gemini when its key works, otherwise Cloudflare Workers AI (binding AI, free, no key).
// Optional KV binding MEMORY (see wrangler.toml) keeps chat history; without it the bot still works.
// After deploy, open https://<worker>.workers.dev/setup once to register the Telegram webhook.

import { APP_HTML, MANIFEST, ICON } from './app.mjs';
import { login, sessionUser, changePassword } from './auth.mjs';
import { USERS } from './users.mjs';
import { SKILLS } from './skills.mjs';
import { relevantSkills, skillsBlock } from './skill-router.mjs';
import { loadLog, toContents, appendTurn, archiveAndClear, noteFrom, loadNotes, addNote, clearNotes } from './memory.mjs';
import { imageRequest, imagePrompt, makeImage, base64ToBytes } from './image.mjs';
import { transcribe, describeImage, telegramFile, parseDataUrl } from './media.mjs';

export const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
export const CF_MODELS = ['@cf/google/gemma-3-12b-it', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const TG_LIMIT = 4000;
const STYLE = "Reply in the user's language (usually Persian). Be direct and accurate; short by default, detailed when the task needs it. Say so when you are not sure.\n" +
  "You CAN hear and see: voice messages are transcribed for you, and photos the user sends are attached to their message. " +
  "You CAN search Google for current facts (news, prices, weather, schedules) when the Gemini brain is active; use it instead of guessing, and keep the sources line.\n" +
  "You CAN make images: a message that starts with «عکس بساز:» (or /img) is turned into a picture automatically. When the user wants a picture, tell them to send «عکس بساز: <description>»; when they ask for a design or post, also offer ready «عکس بساز: ...» lines for its backgrounds.\n" + SKILLS;
const SYSTEM = "You are Hermes, Puria's personal assistant (Viking Offroad brand). " + STYLE;
// Abilities that can be locked per person (users.mjs `locks`). A locked topic is refused before the AI is called.
export const ABILITIES = {
  viking: { name: 'وایکینگ آفرود', topic: 'Viking Offroad business (tours, routes, customers, pricing, packages)',
    re: /وایکینگ|وایکینک|viking|آفرود|off-?road|(?<![\u0600-\u06FF])تور(?:ها|‌ها)?(?![\u0600-\u06FF])/i },
  fjcod: { name: 'FJCod', topic: 'the FJCod project and its data', re: /fj\s*-?\s*cod|اف\s*جی\s*کد|فی\s*جی\s*کد/i },
};
const lockedHit = (who, text) => (who.locks || []).find((id) => ABILITIES[id] && ABILITIES[id].re.test(text));
const teamSystem = (who) => `You are Hermes, the AI assistant of the Viking Offroad team. You are talking with ${who.name}. ` + STYLE +
  (who.locks && who.locks.length ? ` This user has NO access to: ${who.locks.map((id) => ABILITIES[id] ? ABILITIES[id].topic : id).join('; ')}. Politely refuse anything about those topics.` : '');

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/setup') return setup(url, env);
    if (request.method === 'GET' && url.pathname === '/') return home(url, env);
    if (request.method === 'GET' && url.pathname === '/app') return page(APP_HTML, 'text/html');
    if (request.method === 'GET' && url.pathname === '/manifest.webmanifest') return page(MANIFEST, 'application/manifest+json');
    if (request.method === 'GET' && url.pathname === '/icon.svg') return page(ICON, 'image/svg+xml');
    if (url.pathname.startsWith('/api/')) return api(request, url, env);
    if (request.method !== 'POST' || url.pathname !== '/telegram') return new Response('Hermes Lite is running.');
    if (!env.TELEGRAM_BOT_TOKEN ||
        request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(env)) {
      return new Response('forbidden', { status: 403 });
    }
    const update = await request.json().catch(() => null);
    const msg = update && update.message;
    if (msg && (typeof msg.text === 'string' || msg.voice || msg.audio || (msg.photo && msg.photo.length))) {
      ctx.waitUntil(handle(msg, env, url.origin).catch((err) => console.error('[Hermes]', err.message)));
    }
    return new Response('ok');
  },
};

// Private key for the web app, derived from the bot token so no extra secret is needed.
export async function appKey(env) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`app:${env.TELEGRAM_BOT_TOKEN}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

// The owner's web app shares memory with their private Telegram chat (chat id == user id).
// Team members each get their own private memory.
const ownerKey = (env) => `history:${String(env.ALLOWED_USER_ID).trim()}`;
const historyKey = (env, who) => (who.role === 'owner' ? ownerKey(env) : `history:user:${who.username}`);

// Who is calling: the owner (private /app key from Telegram) or a team member (login session).
async function caller(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.ALLOWED_USER_ID) return null;
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  if (token === await appKey(env)) return { username: 'owner', name: 'Owner', role: 'owner', locks: [] };
  return sessionUser(env, token);
}

async function api(request, url, env) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
  if (request.method === 'POST' && url.pathname === '/api/login') {
    if (!env.TELEGRAM_BOT_TOKEN) return json({ error: 'not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const res = await login(env, body.username, body.password);
    return res.error ? json({ error: res.error }, res.status) : json(res);
  }
  const who = await caller(request, env);
  if (!who) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'GET' && url.pathname === '/api/me') return json(who);
  if (request.method === 'GET' && url.pathname === '/api/team') {
    if (who.role !== 'owner' && who.role !== 'admin') return json({ error: 'forbidden' }, 403);
    return json({ team: Object.entries(USERS).map(([username, u]) => ({ username, name: u.name, role: u.role })) });
  }
  if (request.method === 'POST' && url.pathname === '/api/password') {
    if (who.role === 'owner') return json({ error: 'مالک با لینک تلگرام وارد می‌شود و رمز ندارد.' }, 400);
    const body = await request.json().catch(() => ({}));
    const res = await changePassword(env, who.username, body.old, body.new);
    return res.error ? json({ error: res.error }, res.status) : json(res);
  }
  if (request.method === 'GET' && url.pathname === '/api/history') {
    const history = (await loadLog(env, historyKey(env, who))).slice(-200);
    return json({ messages: history.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      text: m.parts.map((p) => p.text || '').join(''),
    })) });
  }
  if (request.method === 'GET' && url.pathname === '/api/weather') return json(await weather(request));
  if (request.method === 'POST' && url.pathname === '/api/reset') {
    await archiveAndClear(env, historyKey(env, who));
    return json({ ok: true });
  }
  if (request.method === 'GET' && url.pathname === '/api/notes') return json({ notes: await loadNotes(env, historyKey(env, who)) });
  if (request.method === 'POST' && url.pathname === '/api/notes/clear') {
    await clearNotes(env, historyKey(env, who));
    return json({ ok: true });
  }
  if (request.method === 'POST' && url.pathname === '/api/transcribe') {
    const body = await request.json().catch(() => ({}));
    const audio = parseDataUrl(body.audio, 'audio');
    if (!audio) return json({ error: 'ویس نامعتبر یا بزرگ‌تر از ۸ مگابایت است.' }, 400);
    try {
      return json({ text: await transcribe(env, askGemini, audio.data, audio.mime) });
    } catch (err) {
      return json({ error: err.message }, 502);
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/chat') {
    const body = await request.json().catch(() => ({}));
    const photo = body.image ? parseDataUrl(body.image, 'image') : null;
    if (body.image && !photo) return json({ error: 'عکس نامعتبر یا بزرگ‌تر از ۸ مگابایت است.' }, 400);
    const message = (typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '') || (photo ? 'این عکس رو ببین و بگو چی توشه.' : '');
    if (!message) return json({ error: 'پیام خالی است.' }, 400);
    const locked = lockedHit(who, message);
    if (locked) return json({ error: `دسترسی به «${ABILITIES[locked].name}» برای حساب تو بسته است.`, locked }, 403);
    try {
      const wanted = photo ? null : imageRequest(message);
      if (wanted !== null) {
        if (!wanted) return json({ error: 'بنویس چه عکسی می‌خواهی، مثلاً «عکس بساز: کمپ کنار دریاچه در جنگل پاییزی».' }, 400);
        const { image, mime, model, prompt } = await picture(env, historyKey(env, who), message, wanted);
        return json({ reply: `🖼️ ساخته شد (${model}).\n\n${prompt}`, image: `data:${mime};base64,${image}` });
      }
      const system = who.role === 'owner' ? SYSTEM : teamSystem(who);
      return json({ reply: await converse(env, historyKey(env, who), message, system, photo ? [photo] : []) });
    } catch (err) {
      return json({ error: err.message }, 502);
    }
  }
  return json({ error: 'not found' }, 404);
}

// Weather for the app's HUD: the caller's city from Cloudflare's geo data, else Tehran. Keyless open-meteo.
export async function weather(request) {
  const cf = request.cf || {};
  const lat = Number(cf.latitude), lon = Number(cf.longitude);
  const here = Number.isFinite(lat) && Number.isFinite(lon) && cf.city;
  const [la, lo, city] = here ? [lat, lon, cf.city] : [35.69, 51.39, 'Tehran'];
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,weather_code`);
    const data = await res.json();
    return { city, temp: data.current?.temperature_2m ?? null, code: data.current?.weather_code ?? null };
  } catch {
    return { city, temp: null, code: null };
  }
}

function page(body, type) {
  return new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-cache' } });
}

export async function webhookSecret(env) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`hermes:${env.TELEGRAM_BOT_TOKEN}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

// Opening the worker's home page registers the webhook if it is not ours yet, so no /setup visit is needed.
async function home(url, env) {
  if (!env.TELEGRAM_BOT_TOKEN) return text('Hermes Lite is running.');
  const info = await tg(env, 'getWebhookInfo', {});
  if (info.ok && info.result && info.result.url === `${url.origin}/telegram`) {
    return text('Hermes Lite is running.\n✓ Telegram connected.');
  }
  return setup(url, env);
}

async function setup(url, env) {
  const missing = ['TELEGRAM_BOT_TOKEN', 'ALLOWED_USER_ID'].filter((k) => !env[k]);
  if (!env.GEMINI_API_KEY && !env.AI) missing.push('GEMINI_API_KEY (or the AI binding)');
  if (missing.length) return text(`✗ Missing secrets: ${missing.join(', ')}`, 400);
  const me = await tg(env, 'getMe', {});
  if (!me.ok) return text('✗ Telegram rejected TELEGRAM_BOT_TOKEN. Copy it again from @BotFather.', 400);
  const hook = await tg(env, 'setWebhook', {
    url: `${url.origin}/telegram`,
    secret_token: await webhookSecret(env),
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
  if (!hook.ok) return text(`✗ setWebhook failed: ${hook.description || 'unknown error'}`, 502);
  const memory = env.MEMORY ? 'on' : 'off (no MEMORY binding)';
  const brain = env.GEMINI_API_KEY ? `Gemini${env.AI ? ' (Workers AI as fallback)' : ''}` : 'Cloudflare Workers AI';
  return text(`✓ Webhook set for @${me.result.username}\n✓ Memory: ${memory}\n✓ Brain: ${brain}\nNow message the bot in Telegram.`);
}

async function handle(msg, env, origin) {
  const chatId = msg.chat.id;
  const userId = msg.from && msg.from.id;
  if (String(userId) !== String(env.ALLOWED_USER_ID).trim()) {
    await send(env, chatId, `این بات خصوصی است. شناسهٔ شما: ${userId}`);
    return;
  }
  const key = `history:${chatId}`;
  let input = typeof msg.text === 'string' ? msg.text.trim() : '';
  let images = [], heard = '';
  if (!input) {
    try {
      const voice = msg.voice || msg.audio;
      if (voice) {
        await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
        const file = await telegramFile(env, voice.file_id, voice.mime_type || 'audio/ogg');
        input = heard = await transcribe(env, askGemini, file.data, file.mime);
      } else if (msg.photo && msg.photo.length) {
        images = [await telegramFile(env, msg.photo[msg.photo.length - 1].file_id, 'image/jpeg')];
        input = (msg.caption || '').trim() || 'این عکس رو ببین و بگو چی توشه.';
      }
    } catch (err) {
      return send(env, chatId, `خطا: ${err.message}`);
    }
    if (!input) return;
  }
  if (input === '/start') {
    return send(env, chatId, 'سلام! من هرمس هستم. هر چه می‌خواهی بپرس.\n' +
      'همهٔ گفتگوها ذخیره می‌ماند. با «یادت باشه ...» چیزی را برای همیشه به خاطر می‌سپارم.\n' +
      'عکس بساز: ... یک عکس می‌سازم\n' +
      'ویس بفرست تا گوش بدهم، عکس بفرست تا ببینم؛ برای خبرها و چیزهای روز در گوگل جست‌وجو می‌کنم.\n' +
      '/reset گفتگوی جدید (قبلی بایگانی می‌شود)\n/notes یادداشت‌های حافظه\n/forget پاک کردن یادداشت‌ها\n/app لینک اپ');
  }
  if (input === '/notes') {
    const notes = await loadNotes(env, key);
    return send(env, chatId, notes.length ? 'به خاطر دارم:\n' + notes.map((n, i) => `${i + 1}. ${n}`).join('\n') : 'هنوز یادداشتی ندارم. بنویس «یادت باشه ...».');
  }
  if (input === '/forget') {
    await clearNotes(env, key);
    return send(env, chatId, 'یادداشت‌های حافظه پاک شد. گفتگوها بایگانی‌شده می‌مانند.');
  }
  if (input === '/app') {
    return send(env, chatId, `اپ چت هرمس (لینک خصوصی، برای کسی نفرست):\n${origin}/app#k=${await appKey(env)}\n\nدر سافاری باز کن و Share ← Add to Home Screen را بزن تا مثل اپ نصب شود.`);
  }
  if (input === '/reset') {
    await archiveAndClear(env, key);
    return send(env, chatId, 'گفتگوی جدید شروع شد. گفتگوی قبلی بایگانی شد و یادداشت‌ها سر جایشان هستند.');
  }

  const wanted = imageRequest(input);
  if (wanted !== null) {
    if (!wanted) return send(env, chatId, 'بنویس چه عکسی می‌خواهی، مثلاً:\nعکس بساز: کمپ کنار دریاچه در جنگل پاییزی');
    await tg(env, 'sendChatAction', { chat_id: chatId, action: 'upload_photo' });
    try {
      const { image, mime, prompt } = await picture(env, key, input, wanted);
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('caption', prompt.slice(0, 1000));
      form.append('photo', new Blob([base64ToBytes(image)], { type: mime }), mime === 'image/png' ? 'hermes.png' : 'hermes.jpg');
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
    } catch (err) {
      await send(env, chatId, `خطا در ساخت عکس: ${err.message}`);
    }
    return;
  }

  await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
  let reply;
  try {
    reply = await converse(env, key, input, SYSTEM, images);
  } catch (err) {
    return send(env, chatId, `خطا: ${err.message}`);
  }
  await send(env, chatId, heard ? `🎙️ «${heard}»\n\n${reply}` : reply);
}

// One turn with permanent memory: recent messages + saved notes go to the brain; everything is kept.
export async function converse(env, key, input, system = SYSTEM, images = []) {
  const note = noteFrom(input);
  if (note) await addNote(env, key, note);
  const [log, notes, skills] = await Promise.all([loadLog(env, key), loadNotes(env, key), relevantSkills(env, input)]);
  const fullSystem = (notes.length
    ? `${system}\n\nLONG-TERM NOTES the user asked you to remember (always take them into account):\n- ${notes.join('\n- ')}`
    : system) + skillsBlock(skills);
  const parts = [...images.map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } })), { text: input }];
  const contents = [...toContents(log), { role: 'user', parts }];
  const reply = images.length ? await see(env, contents, fullSystem, images, input) : await ask(env, contents, fullSystem);
  await appendTurn(env, key, log, images.length ? `[عکس] ${input}` : input, reply);
  return reply;
}

// Photo turn: Gemini sees the image itself; otherwise Workers AI describes it and the text brain answers.
async function see(env, contents, system, images, input) {
  if (env.GEMINI_API_KEY) {
    try {
      return await askGemini(env, contents, system);
    } catch (err) {
      if (!env.AI) throw err;
      console.error('[Hermes] Gemini vision failed, using Workers AI:', err.message);
    }
  }
  const description = await describeImage(env, images[0].data, input);
  const textOnly = [...contents.slice(0, -1), { role: 'user', parts: [{ text: `${input}\n\n[Description of the attached photo: ${description}]` }] }];
  return ask(env, textOnly, system);
}

// Text request → English prompt → FLUX image. The turn is kept in memory as text (the prompt), not the image bytes.
export async function picture(env, key, input, wanted) {
  const prompt = await imagePrompt(ask, env, wanted);
  const { image, mime, model } = await makeImage(env, prompt);
  await appendTurn(env, key, await loadLog(env, key), input, `[عکس ساخته شد با ${model}] ${prompt}`);
  return { image, mime, model, prompt };
}

export async function ask(env, contents, system = SYSTEM, search = true) {
  if (env.GEMINI_API_KEY) {
    try {
      return await askGemini(env, contents, system, search);
    } catch (err) {
      if (!env.AI) throw err;
      console.error('[Hermes] Gemini failed, using Workers AI:', err.message);
    }
  }
  if (env.AI) return askWorkersAI(env, contents, system);
  throw new Error('نه کلید جمینی تنظیم شده و نه Workers AI.');
}

export async function askWorkersAI(env, contents, system = SYSTEM) {
  const messages = [
    { role: 'system', content: system },
    ...contents.map((c) => ({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: c.parts.map((p) => p.text || '').join(''),
    })),
  ];
  let lastError;
  for (const model of CF_MODELS) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 1024 });
      const reply = (out && (out.response ||
        (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content))) || '';
      if (String(reply).trim()) return String(reply).trim();
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Workers AI جواب نداد${lastError ? ` (${lastError.message})` : ''}.`);
}

// search=true lets Gemini use Google Search for current facts (free tier); models that refuse the tool are retried without it.
export async function askGemini(env, contents, system = SYSTEM, search = true) {
  const cached = env.MEMORY ? await env.MEMORY.get('model') : null;
  const order = cached ? [cached, ...MODELS.filter((m) => m !== cached)] : MODELS;
  const call = (model, withSearch) => fetch(`${GEMINI_API}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents,
      ...(withSearch ? { tools: [{ google_search: {} }] } : {}) }),
  });
  for (const model of order) {
    let res = await call(model, search);
    if (search && (res.status === 400 || res.status === 429)) res = await call(model, false);
    if (res.status === 404) continue;
    if (res.status === 429) throw new Error('سهمیهٔ رایگان جمینی فعلاً پر است؛ چند دقیقه بعد دوباره بپرس.');
    if (res.status === 400 || res.status === 403) throw new Error(`جمینی کلید را نپذیرفت (${res.status}). کلید را دوباره بساز.`);
    if (!res.ok) throw new Error(`جمینی جواب نداد (${res.status}).`);
    if (env.MEMORY && model !== cached) await env.MEMORY.put('model', model);
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts) || [];
    const answer = parts.map((p) => p.text || '').join('').trim() || '(پاسخ خالی بود؛ دوباره بپرس)';
    return answer + sources(data.candidates && data.candidates[0]);
  }
  throw new Error('هیچ مدل جمینی برای این کلید در دسترس نیست.');
}

// Up to 3 web sources when Gemini searched Google for the answer.
function sources(candidate) {
  const chunks = (candidate && candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks) || [];
  const web = chunks.map((c) => c.web).filter((w) => w && w.uri).slice(0, 3);
  return web.length ? '\n\nمنابع:\n' + web.map((w) => `• ${w.title || 'لینک'}: ${w.uri}`).join('\n') : '';
}

export function chunks(str, size = TG_LIMIT) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out.length ? out : [''];
}

async function send(env, chatId, body) {
  for (const part of chunks(body)) await tg(env, 'sendMessage', { chat_id: chatId, text: part });
}

async function tg(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({ ok: false }));
}

function text(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
