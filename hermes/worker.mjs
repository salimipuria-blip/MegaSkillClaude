// Hermes Lite: Telegram bot + Gemini on Cloudflare Workers. Free, 24/7, no server, no card.
// Secrets (Worker → Settings → Variables and Secrets, type "Secret"):
//   TELEGRAM_BOT_TOKEN, ALLOWED_USER_ID, and optionally GEMINI_API_KEY.
// Brain: Gemini when its key works, otherwise Cloudflare Workers AI (binding AI, free, no key).
// CONVERSATIONS (SQLite Durable Objects) stores/serializes chats; KV MEMORY keeps account data and legacy logs.
// After deploy, connect Telegram with the owner-only `npm run setup:webhook` CLI.

import { APP_HTML, MANIFEST, ICON } from './app.mjs';
import { login, sessionUser, changePassword } from './auth.mjs';
import { USERS } from './users.mjs';
import { STYLE, SYSTEM } from './brain.mjs';
import { appKey, webhookSecret, setupKey } from './security.mjs';
export { appKey, webhookSecret, setupKey } from './security.mjs';
import { converse } from './conversation.mjs';
import { requireConversationBinding, loadLog, archiveAndClear, loadNotes, clearNotes } from './memory.mjs';
export { ask, askGemini, askWorkersAI, MODELS, CF_MODELS } from './brain.mjs';
export { converse } from './conversation.mjs';

const TG_LIMIT = 4000;
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
    if (url.pathname.startsWith('/api/')) return api(request, url, env);
    if (request.method !== 'POST' || url.pathname !== '/telegram') return new Response('Hermes Lite is running.');
    if (!env.TELEGRAM_BOT_TOKEN ||
        request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(env)) {
      return new Response('forbidden', { status: 403 });
    }
    const update = await request.json().catch(() => null);
    const msg = update && update.message;
    if (msg && typeof msg.text === 'string') {
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
  if (request.method === 'POST' && url.pathname === '/api/chat') {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
    if (!message) return json({ error: 'پیام خالی است.' }, 400);
    const locked = lockedHit(who, message);
    if (locked) return json({ error: `دسترسی به «${ABILITIES[locked].name}» برای حساب تو بسته است.`, locked }, 403);
    try {
      const system = who.role === 'owner' ? SYSTEM : teamSystem(who);
      return json({ reply: await converse(env, historyKey(env, who), message, system) });
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
    drop_pending_updates: false,
  });
  if (!hook.ok) return text(`✗ setWebhook failed: ${hook.description || 'unknown error'}`, 502);
  const memory = env.CONVERSATIONS ? 'SQLite Durable Object' : 'local-only compatibility (not distributed)';
  const brain = env.GEMINI_API_KEY ? `Gemini${env.AI ? ' (Workers AI as fallback)' : ''}` : 'Cloudflare Workers AI';
  return text(`✓ Webhook set for @${me.result.username}\n✓ Memory: ${memory}\n✓ Brain: ${brain}\nNow message the bot in Telegram.`);
}

async function handle(msg, env, origin) {
  // Never answer in a group/channel, especially /app: its link grants owner access.
  if (msg.chat?.type !== 'private') return;
  const chatId = msg.chat.id;
  const userId = msg.from && msg.from.id;
  if (String(userId) !== String(env.ALLOWED_USER_ID).trim()) {
    await send(env, chatId, `این بات خصوصی است. شناسهٔ شما: ${userId}`);
    return;
  }
  if (String(chatId) !== String(userId)) return;
  const key = ownerKey(env);
  const input = msg.text.trim();
  if (input === '/start') {
    return send(env, chatId, 'سلام! من هرمس هستم. هر چه می‌خواهی بپرس.\n' +
      'همهٔ گفتگوها ذخیره می‌ماند. با «یادت باشه ...» چیزی را برای همیشه به خاطر می‌سپارم.\n' +
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

  await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
  let reply;
  try {
    reply = await converse(env, key, input);
  } catch (err) {
    return send(env, chatId, `خطا: ${err.message}`);
  }
  await send(env, chatId, reply);
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
