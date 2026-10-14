// Hermes Lite: Telegram bot + Gemini on Cloudflare Workers. Free, 24/7, no server, no card.
// Secrets (Worker → Settings → Variables and Secrets, type "Secret"):
//   TELEGRAM_BOT_TOKEN, ALLOWED_USER_ID, and optionally GEMINI_API_KEY.
// Brain: Gemini when its key works, otherwise Cloudflare Workers AI (binding AI, free, no key).
// CONVERSATIONS (SQLite Durable Objects) stores/serializes chats; KV MEMORY keeps account data and legacy logs.
// After deploy, connect Telegram with the owner-only `npm run setup:webhook` CLI.

import { APP_HTML, MANIFEST, ICON } from './app.mjs';
import { login, sessionUser, changePassword } from './auth.mjs';
import { USERS } from './users.mjs';
import { STYLE, SYSTEM, askGemini } from './brain.mjs';
import { appKey, webhookSecret, setupKey } from './security.mjs';
export { appKey, webhookSecret, setupKey } from './security.mjs';
import { converse, picture } from './conversation.mjs';
export { converse, picture } from './conversation.mjs';
import { requireConversationBinding, loadLog, archiveAndClear, loadNotes, clearNotes } from './memory.mjs';
export { ask, askGemini, askWorkersAI, MODELS, CF_MODELS } from './brain.mjs';
import { imageRequest, base64ToBytes } from './image.mjs';
import { handlePhotoEdit, editRequest, continueEdit, recallEdit, rememberEdit, followUpRequest, faDigits } from './photo-edit.mjs';
import { ask } from './brain.mjs';
import { transcribe, telegramFile, parseDataUrl } from './media.mjs';
import { tripPage, createBooking, onContact } from './booking.mjs';
import { configuredProviders } from './providers.mjs';
import { googleConfigured, googleConnected, googleTools, connectUrl, finishConnect, disconnect } from './google.mjs';
import { liveness, readiness, fullHealth } from './health.mjs';
import { recordRequest, snapshot as metricsSnapshot, prometheusText } from './metrics.mjs';
export { liveness, readiness, fullHealth } from './health.mjs';

const TG_LIMIT = 4000;

// The edited photo goes back as a before/after pair, so the improvement is visible at a glance.
// Falls back to a single photo when Telegram refuses the album (odd size or exotic format).
export async function sendEdited(env, chatId, before, edited) {
  const api = (method) => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  // A variations turn sends the original plus every take; a normal edit sends the best take.
  const takes = edited.variations && edited.variations.length
    ? edited.variations.map((v, i) => ({ ...v, slot: `v${i}` })) : [{ ...edited, slot: 'after' }];
  const caption = (edited.variations ? `📸 اصل ← ${faDigits(takes.length)} نسخه\n` : '📸 قبل ← بعد\n') + edited.caption;
  const media = [{ type: 'photo', media: 'attach://before', caption: caption.slice(0, 1000) },
    ...takes.map((t) => ({ type: 'photo', media: `attach://${t.slot}` }))];
  const album = new FormData();
  album.append('chat_id', String(chatId));
  album.append('media', JSON.stringify(media));
  album.append('before', new Blob([base64ToBytes(before.data)], { type: before.mime }), 'before.jpg');
  for (const t of takes) {
    const name = t.mime === 'image/png' ? `${t.slot}.png` : `${t.slot}.jpg`;
    album.append(t.slot, new Blob([base64ToBytes(t.image)], { type: t.mime }), name);
  }
  const out = await fetch(api('sendMediaGroup'), { method: 'POST', body: album }).then((r) => r.json()).catch(() => ({}));
  if (out && out.ok) return true;
  // Fallback: one photo (the best take), or the caption text if even that is refused.
  const single = new FormData();
  single.append('chat_id', String(chatId));
  single.append('caption', caption.slice(0, 1000));
  single.append('photo', new Blob([base64ToBytes(edited.image)], { type: edited.mime }), edited.mime === 'image/png' ? 'hermes-edit.png' : 'hermes-edit.jpg');
  const one = await fetch(api('sendPhoto'), { method: 'POST', body: single }).then((r) => r.json()).catch(() => ({}));
  if (one && one.ok) return true;
  return send(env, chatId, caption);
}
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
    // Health & metrics probes (hermes/#009, #013, #088, #089): no secrets, no
    // external calls, no state changes. Readiness is 503 until minimally configured.
    if (request.method === 'GET' && ['/health', '/health/live'].includes(url.pathname)) return jsonProbe(liveness(), 200);
    if (request.method === 'GET' && url.pathname === '/health/ready') { const r = readiness(env); return jsonProbe(r, r.ready ? 200 : 503); }
    if (request.method === 'GET' && url.pathname === '/health/full') { const f = fullHealth(env); return jsonProbe(f, f.ready ? 200 : 503); }
    if (request.method === 'GET' && url.pathname === '/metrics') {
      return url.searchParams.get('format') === 'json'
        ? jsonProbe(metricsSnapshot(), 200)
        : new Response(prometheusText(), { headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/setup') {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers: { allow: 'POST' } });
      if (!env.TELEGRAM_BOT_TOKEN || !String(env.ALLOWED_USER_ID || '').trim()) return text('not configured', 503);
      if (request.headers.get('authorization') !== `Bearer ${await setupKey(env)}`) return text('forbidden', 403);
      return setup(url, env);
    }
    // Public liveness probes must not query Telegram or mutate its webhook.
    if (request.method === 'GET' && url.pathname === '/') return text('Hermes Lite is running. Connect Telegram with the owner-only setup CLI.');
    if (request.method === 'GET' && url.pathname === '/app') return page(APP_HTML, 'text/html');
    if (request.method === 'GET' && url.pathname === '/manifest.webmanifest') return page(MANIFEST, 'application/manifest+json');
    if (request.method === 'GET' && url.pathname === '/icon.svg') return page(ICON, 'image/svg+xml');
    if (request.method === 'GET' && url.pathname === '/trip') return page(tripPage(), 'text/html');
    if (url.pathname.startsWith('/api/')) return api(request, url, env);
    if (request.method === 'GET' && url.pathname === '/connect/google') return googleStart(url, env);
    if (request.method === 'GET' && url.pathname === '/connect/google/callback') return googleCallback(url, env);
    if (request.method !== 'POST' || url.pathname !== '/telegram') return new Response('Hermes Lite is running.');
    if (!env.TELEGRAM_BOT_TOKEN ||
        request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(env)) {
      return new Response('forbidden', { status: 403 });
    }
    const update = await request.json().catch(() => null);
    const msg = update && update.message;
    if (msg && (typeof msg.text === 'string' || msg.contact || msg.voice || msg.audio || (msg.photo && msg.photo.length))) {
      ctx.waitUntil(handle(msg, env, url.origin).catch((err) => console.error('[Hermes]', err.message)));
    }
    return new Response('ok');
  },
};

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
  const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
  if (request.method === 'POST' && url.pathname === '/api/booking') {
    if (!env.TELEGRAM_BOT_TOKEN) return json({ error: 'رزرو موقتاً در دسترس نیست.' }, 503);
    const res = await createBooking(env, tg, request, await request.json().catch(() => ({})));
    return json(res.data, res.status, res.headers);
  }
  if (request.method === 'POST' && url.pathname === '/api/login') {
    if (!env.TELEGRAM_BOT_TOKEN) return json({ error: 'not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const res = await login(env, body.username, body.password);
    return res.error ? json({ error: res.error }, res.status) : json(res);
  }
  const who = await caller(request, env);
  if (!who) return json({ error: 'unauthorized' }, 401);
  if (['/api/chat', '/api/history', '/api/reset', '/api/notes', '/api/notes/clear'].includes(url.pathname)) {
    try { requireConversationBinding(env); } catch (error) { return json({ error: error.message }, 503); }
  }
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
      // A photo plus an edit instruction is an editing turn: brief, plan, candidates, review, deliver.
      const key = historyKey(env, who);
      if (photo && editRequest(message)) {
        const edited = await handlePhotoEdit(env, ask, photo.data, photo.mime, message);
        if (edited) {
          if (edited.image) await rememberEdit(env, key, { original: photo.data, mime: photo.mime, request: message,
            op: edited.op, strength: edited.strength });
          return json({ reply: edited.caption, image: edited.image ? `data:${edited.mime};base64,${edited.image}` : undefined,
            images: edited.variations ? edited.variations.map((v) => `data:${v.mime};base64,${v.image}`) : undefined,
            score: edited.review && edited.review.derived ? edited.score : undefined });
        }
      }
      // Photo-less follow-up («ملایم‌تر») on the last edited photo.
      if (!photo && (editRequest(message) || followUpRequest(message))) {
        const last = await recallEdit(env, key);
        if (last) {
          const edited = await continueEdit(env, ask, last, message);
          return json({ reply: edited.caption, image: edited.image ? `data:${edited.mime};base64,${edited.image}` : undefined,
            images: edited.variations ? edited.variations.map((v) => `data:${v.mime};base64,${v.image}`) : undefined });
        }
      }
      const wanted = photo ? null : imageRequest(message);
      if (wanted !== null) {
        if (!wanted) return json({ error: 'بنویس چه عکسی می‌خواهی، مثلاً «عکس بساز: کمپ کنار دریاچه در جنگل پاییزی».' }, 400);
        const { image, mime, model, prompt } = await picture(env, historyKey(env, who), message, wanted);
        return json({ reply: `🖼️ ساخته شد (${model}).\n\n${prompt}`, image: `data:${mime};base64,${image}` });
      }
      const system = who.role === 'owner' ? SYSTEM : teamSystem(who);
      const tools = who.role === 'owner' ? await googleTools(env) : null;
      return json({ reply: await converse(env, historyKey(env, who), message, system, photo ? [photo] : [], tools) });
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

// Owner-only Google connection: Telegram /google issues a one-time link (10 minutes) → Google consent → callback.
async function googleStart(url, env) {
  const t = url.searchParams.get('t') || '';
  if (!env.MEMORY || !/^[0-9a-f]{32}$/.test(t) || !(await env.MEMORY.get(`google:start:${t}`))) return text('✗ لینک منقضی شده؛ در تلگرام دوباره /google را بزن.', 403);
  await env.MEMORY.delete(`google:start:${t}`);
  if (!googleConfigured(env)) return text('✗ GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET را در Secrets کلادفلر بگذار (راهنما: hermes/README.md).', 400);
  return Response.redirect(await connectUrl(env, url.origin), 302);
}

async function googleCallback(url, env) {
  if (!googleConfigured(env)) return text('not configured', 400);
  if (url.searchParams.get('error')) return text(`✗ اتصال لغو شد (${url.searchParams.get('error')}).`, 400);
  try {
    await finishConnect(env, url.origin, url.searchParams.get('code'), url.searchParams.get('state'));
  } catch (err) {
    return text(`✗ ${err.message}`, 400);
  }
  return page('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font:18px/1.8 system-ui;background:#06101c;color:#eee;display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
    '<div>✅ گوگل به هرمس وصل شد<br><small>جیمیل، تقویم، درایو و شیت. حالا برگرد به تلگرام.</small></div>', 'text/html');
}

function jsonProbe(body, status) {
  recordRequest(status >= 500);
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function page(body, type) {
  return new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-cache' } });
}

async function setup(url, env) {
  const missing = ['TELEGRAM_BOT_TOKEN', 'ALLOWED_USER_ID'].filter((k) => !env[k]);
  if (!env.GEMINI_API_KEY && !env.AI && !configuredProviders(env).length) missing.push('GEMINI_API_KEY (or the AI binding)');
  if (missing.length) return text(`✗ Missing secrets: ${missing.join(', ')}`, 400);
  const me = await tg(env, 'getMe', {});
  if (!me.ok) return text('✗ Telegram rejected TELEGRAM_BOT_TOKEN. Copy it again from @BotFather.', 400);
  const hook = await tg(env, 'setWebhook', {
    url: `${url.origin}/telegram`,
    secret_token: await webhookSecret(env),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
  if (!hook.ok) return text(`✗ setWebhook failed: ${hook.description || 'unknown error'}`, 502);
  const memory = env.CONVERSATIONS ? 'SQLite Durable Object' : 'local-only compatibility (not distributed)';
  const brain = [env.GEMINI_API_KEY && 'Gemini', ...configuredProviders(env).map((p) => p.name), env.AI && 'Workers AI'].filter(Boolean).join(' → ') || 'none';
  return text(`✓ Webhook set for @${me.result.username}\n✓ Memory: ${memory}\n✓ Brain: ${brain}\nNow message the bot in Telegram.`);
}

async function handle(msg, env, origin) {
  // Never answer in a group/channel, especially /app: its link grants owner access.
  if (msg.chat?.type !== 'private') return;
  const chatId = msg.chat.id;
  const userId = msg.from && msg.from.id;
  if (String(chatId) !== String(userId)) return;
  if (msg.contact && env.MEMORY) {
    const done = await onContact(env, msg);
    await tg(env, 'sendMessage', { chat_id: chatId, text: done, reply_markup: { remove_keyboard: true } });
    if (done.startsWith('✅') && String(userId) !== String(env.ALLOWED_USER_ID).trim()) {
      await send(env, String(env.ALLOWED_USER_ID).trim(), `گزارش رزروها از این به بعد فقط برای ${[msg.from.first_name, msg.from.username && `@${msg.from.username}`].filter(Boolean).join(' ')} فرستاده می‌شه.`);
    }
    return;
  }
  if (String(userId) !== String(env.ALLOWED_USER_ID).trim()) {
    await tg(env, 'sendMessage', { chat_id: chatId, text: `این بات خصوصی است. شناسهٔ شما: ${userId}\n\nمسئول رزرو وایکینگ هستی؟ دکمهٔ پایین رو بزن تا شماره‌ت ثبت بشه و گزارش رزروها برات بیاد.`,
      reply_markup: { keyboard: [[{ text: '📱 ارسال شمارهٔ من', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
    return;
  }
  const key = ownerKey(env);
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
      'عکس بفرست و بنویس چه تغییری می‌خواهی («این عکس رو ریتوش کن»، «پس‌زمینه رو عوض کن»، «کیفیتش رو بالا ببر»، «چند نسخه») تا حرفه‌ای ویرایشش کنم و قبل/بعد را با هم بفرستم.\n' +
      'بعد از هر ویرایش می‌توانی بگویی «ملایم‌تر» یا «قوی‌تر» — همان عکس را دوباره لازم نیست بفرستی.\n' +
      'ویس بفرست تا گوش بدهم، عکس بفرست تا ببینم؛ برای خبرها و چیزهای روز در گوگل جست‌وجو می‌کنم.\n' +
      '/google اتصال جیمیل، تقویم، درایو و شیت\n' +
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
  if (input === '/trip') {
    return send(env, chatId, `صفحهٔ عمومی سفر و رزرو (برای لینک بیو):\n${origin}/trip\n\nاطلاعات هر رزرو به‌صورت خصوصی برای تو و هر کس در BOOKING_ADMIN_IDS فرستاده می‌شود (هر نفر یک بار باید بات را استارت کند).`);
  }
  if (input === '/google') {
    if (!googleConfigured(env)) return send(env, chatId, 'اول GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET را در Secrets کلادفلر بگذار، بعد دوباره /google را بزن.');
    const state = await googleConnected(env) ? 'الان وصل است. برای اتصال دوباره (یا حساب دیگر):' : 'برای وصل کردن جیمیل، تقویم، درایو و شیت این لینک را باز کن:';
    const t = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await env.MEMORY.put(`google:start:${t}`, '1', { expirationTtl: 600 });
    return send(env, chatId, `${state}\n${origin}/connect/google?t=${t}\n(این لینک یک‌بار مصرف است و ۱۰ دقیقه اعتبار دارد.)\n\nقطع اتصال: /google_off`);
  }
  if (input === '/google_off') {
    await disconnect(env);
    return send(env, chatId, 'اتصال گوگل قطع شد. (برای قطع کامل، در myaccount.google.com/permissions هم دسترسی Hermes را بردار.)');
  }
  if (input === '/reset') {
    await archiveAndClear(env, key);
    return send(env, chatId, 'گفتگوی جدید شروع شد. گفتگوی قبلی بایگانی شد و یادداشت‌ها سر جایشان هستند.');
  }

  // A follow-up tweak («ملایم‌تر»، «قوی‌تر»، «چند نسخه») reuses the photo that was edited last,
  // so the user never has to send it again inside the same hour.
  if (!images.length && (editRequest(input) || followUpRequest(input))) {
    const last = await recallEdit(env, key);
    if (last) {
      await tg(env, 'sendChatAction', { chat_id: chatId, action: 'upload_photo' });
      try {
        const edited = await continueEdit(env, ask, last, input);
        if (edited.image) await sendEdited(env, chatId, { data: last.image, mime: last.mime }, edited);
        else await send(env, chatId, edited.caption);
      } catch (err) {
        await send(env, chatId, `ویرایش انجام نشد: ${err.message}`);
      }
      return;
    }
  }

  // Photo + editing instruction: run the professional edit pipeline and send the result back.
  if (images.length && editRequest(input)) {
    await tg(env, 'sendChatAction', { chat_id: chatId, action: 'upload_photo' });
    try {
      const edited = await handlePhotoEdit(env, ask, images[0].data, images[0].mime, input);
      if (edited && edited.image) {
        await rememberEdit(env, key, { original: images[0].data, mime: images[0].mime, request: input,
          op: edited.op, strength: edited.strength });
        await sendEdited(env, chatId, images[0], edited);
      } else if (edited) await send(env, chatId, edited.caption);
    } catch (err) {
      await send(env, chatId, `ویرایش انجام نشد: ${err.message}`);
    }
    return;
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
    reply = await converse(env, key, input, SYSTEM, images, await googleTools(env));
  } catch (err) {
    return send(env, chatId, `خطا: ${err.message}`);
  }
  await send(env, chatId, heard ? `🎙️ «${heard}»\n\n${reply}` : reply);
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
