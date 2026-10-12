// Hermes Lite: Telegram bot + Gemini on Cloudflare Workers. Free, 24/7, no server, no card.
// Secrets (Worker → Settings → Variables and Secrets, type "Secret"):
//   TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, ALLOWED_USER_ID
// Optional KV binding MEMORY (see wrangler.toml) keeps chat history; without it the bot still works.
// After deploy, open https://<worker>.workers.dev/setup once to register the Telegram webhook.

export const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const HISTORY_MESSAGES = 20;
const TG_LIMIT = 4000;
const SYSTEM = "You are Hermes, Puria's personal assistant (Viking Offroad brand). " +
  "Reply in the user's language (usually Persian), short, direct and accurate. Say so when you are not sure.";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/setup') return setup(url, env);
    if (request.method === 'GET' && url.pathname === '/') return home(url, env);
    if (request.method !== 'POST' || url.pathname !== '/telegram') return new Response('Hermes Lite is running.');
    if (!env.TELEGRAM_BOT_TOKEN ||
        request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(env)) {
      return new Response('forbidden', { status: 403 });
    }
    const update = await request.json().catch(() => null);
    const msg = update && update.message;
    if (msg && typeof msg.text === 'string') {
      ctx.waitUntil(handle(msg, env).catch((err) => console.error('[Hermes]', err.message)));
    }
    return new Response('ok');
  },
};

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
  const missing = ['TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY', 'ALLOWED_USER_ID'].filter((k) => !env[k]);
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
  return text(`✓ Webhook set for @${me.result.username}\n✓ Memory: ${memory}\nNow message the bot in Telegram.`);
}

async function handle(msg, env) {
  const chatId = msg.chat.id;
  const userId = msg.from && msg.from.id;
  if (String(userId) !== String(env.ALLOWED_USER_ID).trim()) {
    await send(env, chatId, `این بات خصوصی است. شناسهٔ شما: ${userId}`);
    return;
  }
  const key = `history:${chatId}`;
  const input = msg.text.trim();
  if (input === '/start') return send(env, chatId, 'سلام! من هرمس هستم. هر چه می‌خواهی بپرس. /reset حافظه را پاک می‌کند.');
  if (input === '/reset') {
    if (env.MEMORY) await env.MEMORY.delete(key);
    return send(env, chatId, 'حافظه پاک شد.');
  }

  await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
  const history = env.MEMORY ? (await env.MEMORY.get(key, 'json')) || [] : [];
  const contents = [...history, { role: 'user', parts: [{ text: input }] }];
  let reply;
  try {
    reply = await askGemini(env, contents);
  } catch (err) {
    return send(env, chatId, `خطا: ${err.message}`);
  }
  if (env.MEMORY) {
    const next = [...contents, { role: 'model', parts: [{ text: reply }] }].slice(-HISTORY_MESSAGES);
    await env.MEMORY.put(key, JSON.stringify(next));
  }
  await send(env, chatId, reply);
}

export async function askGemini(env, contents) {
  const cached = env.MEMORY ? await env.MEMORY.get('model') : null;
  const order = cached ? [cached, ...MODELS.filter((m) => m !== cached)] : MODELS;
  for (const model of order) {
    const res = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents }),
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
