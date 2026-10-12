// Hermes Lite: Telegram bot + Gemini on Cloudflare Workers. Free, 24/7, no server, no card.
// Secrets (Worker → Settings → Variables and Secrets, type "Secret"):
//   TELEGRAM_BOT_TOKEN, ALLOWED_USER_ID, and optionally GEMINI_API_KEY.
// Brain: Gemini when its key works, otherwise Cloudflare Workers AI (binding AI, free, no key).
// Optional KV binding MEMORY (see wrangler.toml) keeps chat history; without it the bot still works.
// After deploy, open https://<worker>.workers.dev/setup once to register the Telegram webhook.

import { APP_HTML, MANIFEST, ICON } from './app.mjs';
import { login, sessionUser, changePassword } from './auth.mjs';
import { USERS } from './users.mjs';

export const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
export const CF_MODELS = ['@cf/google/gemma-3-12b-it', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const HISTORY_MESSAGES = 20;
const TG_LIMIT = 4000;
const STYLE = "Reply in the user's language (usually Persian), short, direct and accurate. Say so when you are not sure.";
const SYSTEM = "You are Hermes, Puria's personal assistant (Viking Offroad brand). " + STYLE;
const teamSystem = (who) => `You are Hermes, the AI assistant of the Viking Offroad team. You are talking with ${who.name}. ` + STYLE;

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
    if (msg && typeof msg.text === 'string') {
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
  if (token === await appKey(env)) return { username: 'owner', name: 'Owner', role: 'owner' };
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
    const history = env.MEMORY ? (await env.MEMORY.get(historyKey(env, who), 'json')) || [] : [];
    return json({ messages: history.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      text: m.parts.map((p) => p.text || '').join(''),
    })) });
  }
  if (request.method === 'GET' && url.pathname === '/api/weather') return json(await weather(request));
  if (request.method === 'POST' && url.pathname === '/api/reset') {
    if (env.MEMORY) await env.MEMORY.delete(historyKey(env, who));
    return json({ ok: true });
  }
  if (request.method === 'POST' && url.pathname === '/api/chat') {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
    if (!message) return json({ error: 'پیام خالی است.' }, 400);
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
  const input = msg.text.trim();
  if (input === '/start') return send(env, chatId, 'سلام! من هرمس هستم. هر چه می‌خواهی بپرس. /reset حافظه را پاک می‌کند. /app لینک اپ چت را می‌دهد.');
  if (input === '/app') {
    return send(env, chatId, `اپ چت هرمس (لینک خصوصی، برای کسی نفرست):\n${origin}/app#k=${await appKey(env)}\n\nدر سافاری باز کن و Share ← Add to Home Screen را بزن تا مثل اپ نصب شود.`);
  }
  if (input === '/reset') {
    if (env.MEMORY) await env.MEMORY.delete(key);
    return send(env, chatId, 'حافظه پاک شد.');
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

// One turn with memory: load history, ask the brain, save both messages.
export async function converse(env, key, input, system = SYSTEM) {
  const history = env.MEMORY ? (await env.MEMORY.get(key, 'json')) || [] : [];
  const contents = [...history, { role: 'user', parts: [{ text: input }] }];
  const reply = await ask(env, contents, system);
  if (env.MEMORY) {
    const next = [...contents, { role: 'model', parts: [{ text: reply }] }].slice(-HISTORY_MESSAGES);
    await env.MEMORY.put(key, JSON.stringify(next));
  }
  return reply;
}

export async function ask(env, contents, system = SYSTEM) {
  if (env.GEMINI_API_KEY) {
    try {
      return await askGemini(env, contents, system);
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

export async function askGemini(env, contents, system = SYSTEM) {
  const cached = env.MEMORY ? await env.MEMORY.get('model') : null;
  const order = cached ? [cached, ...MODELS.filter((m) => m !== cached)] : MODELS;
  for (const model of order) {
    const res = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
    });
    if (res.status === 404) continue;
    if (res.status === 429) throw new Error('سهمیهٔ رایگان جمینی فعلاً پر است؛ چند دقیقه بعد دوباره بپرس.');
    if (res.status === 400 || res.status === 403) throw new Error(`جمینی کلید را نپذیرفت (${res.status}). کلید را دوباره بساز.`);
    if (!res.ok) throw new Error(`جمینی جواب نداد (${res.status}).`);
    if (env.MEMORY && model !== cached) await env.MEMORY.put('model', model);
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts) || [];
    return parts.map((p) => p.text || '').join('').trim() || '(پاسخ خالی بود؛ دوباره بپرس)';
  }
  throw new Error('هیچ مدل جمینی برای این کلید در دسترس نیست.');
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
