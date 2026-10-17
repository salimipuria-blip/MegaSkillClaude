// Hermes Lite: Telegram bot + Gemini on Cloudflare Workers. Free, 24/7, no server, no card.
// Secrets (Worker → Settings → Variables and Secrets, type "Secret"):
//   TELEGRAM_BOT_TOKEN, ALLOWED_USER_ID, and optionally GEMINI_API_KEY.
// Brain: Gemini when its key works, otherwise Cloudflare Workers AI (binding AI, free, no key).
// CONVERSATIONS (SQLite Durable Objects) stores/serializes chats; KV MEMORY keeps account data and legacy logs.
// After deploy, connect Telegram with the owner-only `npm run setup:webhook` CLI.

import { APP_HTML, MANIFEST, ICON } from './app.mjs';
import { login, sessionUser, changePassword } from './auth.mjs';
import { USERS } from './users.mjs';
import { listAccounts, createAccount, setDisabled, resetPassword, accountCommand } from './accounts.mjs';
import { projectKnowledge, portfolioText } from './knowledge.mjs';
import { githubCommand } from './github.mjs';
import { codeFiles } from './coding.mjs';
import { STYLE, SYSTEM, askGemini } from './brain.mjs';
import { appKey, webhookSecret, setupKey } from './security.mjs';
export { appKey, webhookSecret, setupKey } from './security.mjs';
import { converse, picture } from './conversation.mjs';
export { converse, picture } from './conversation.mjs';
import { requireConversationBinding, loadLog, archiveAndClear, loadNotes, clearNotes } from './memory.mjs';
export { ask, askGemini, askWorkersAI, MODELS, CF_MODELS } from './brain.mjs';
import { imageRequest, base64ToBytes } from './image.mjs';
import { handlePhotoEdit, editRequest, continueEdit, recallEdit, rememberEdit, followUpRequest, faDigits,
  refineTake, pickRequest, rememberVariations, recallVariations } from './photo-edit.mjs';
import { textRequest, designSpec, textLayout, renderTextLayer, layerCaption,
  layerTuneRequest, applyTune, tuneCaption, rememberTextLayer, recallTextLayer, forgetTextLayer } from './textlayer.mjs';
import { imageInfo, base64Bytes } from './image-bytes.mjs';
import { ask } from './brain.mjs';
import { transcribe, telegramFile, parseDataUrl } from './media.mjs';
import { tripPage, createBooking, onContact } from './booking.mjs';
import { configuredProviders } from './providers.mjs';
import { historyKey as wsHistoryKey, membership, joinWorkspace, clientCommand, ownerCommand, businessSystem, getKnowledge, spend, IMAGE_UNITS } from './workspaces.mjs';
import { googleConfigured, googleConnected, googleTools, connectUrl, finishConnect, disconnect } from './google.mjs';
import { liveness, readiness, fullHealth } from './health.mjs';
import { diagnose, formatDiagnosis } from './diagnose.mjs';
import { recordRequest, snapshot as metricsSnapshot, prometheusText } from './metrics.mjs';
export { liveness, readiness, fullHealth } from './health.mjs';
import { fetchWithTimeout } from './resilience.mjs';
import { parseReminder, addReminder, listReminders, deleteReminder, formatReminder, allReminders, dueReminders, markSent, morningDigest } from './reminders.mjs';
export { parseReminder } from './reminders.mjs';

const TG_LIMIT = 4000;
/** The app offers at most this many versions to pick from (the studio set is three). */
const MAX_PICKS = 4;
const ASK_FOR_TEXT = 'چه متنی بنویسم؟ مثال:\n«روی عکس بنویس: کمپ وایکینگ»\n«متن بذار پایین عکس «تور آفرود دو روزه» با فونت طلایی»\n' +
  '(متن با فونت واقعی روی عکس می‌نشیند، پس فارسی سالم می‌ماند.)';

/**
 * The text-layer turn, shared by Telegram and the app: run the edit if one was asked for, then
 * build the typographic layer for the resulting picture and (when Browser Rendering is available)
 * compose it server-side. Returns { base, clean, layer, caption, composed }.
 */
export async function textLayerTurn(env, ask, image, mime, request, info = null, key = null) {
  const wants = textRequest(request);
  const plan = editRequest(request);
  const pureText = wants && (!plan || plan.op === 'text');
  const edited = pureText ? null : await handlePhotoEdit(env, ask, image, mime, request);
  if (!wants) return edited ? { edited, base: { data: edited.image, mime: edited.mime }, layer: null, caption: edited.caption } : null;
  const info2 = info || imageInfo(base64Bytes(pureText ? image : (edited && edited.image) || image));
  const layer = textLayout(designSpec({
    text: wants.text, width: (info2 && info2.width) || 1024, height: (info2 && info2.height) || 1024,
    position: wants.position, style: wants.style, size: wants.size, bar: wants.bar,
    tone: (edited && edited.brief && edited.brief.regionTone) || 'mixed',
  }));
  const base = { data: pureText ? image : edited.image, mime: pureText ? mime : edited.mime, info: info2 };
  // The picture *under* the layer, kept un-composed: the app draws the words itself (so nobody sees
  // them twice), and every later «بالاتر ببر» re-renders from this one instead of from a picture that
  // already has the words baked in. Its mime comes from the bytes themselves: a Telegram download is
  // labelled jpeg whatever it is, and whoever gets it back deserves the honest type.
  const clean = { data: base.data, mime: (info2 && info2.mime) || base.mime, info: base.info };
  let composed = false;
  try {
    const rendered = await renderTextLayer(env, base.data, base.mime, layer);
    if (rendered) { base.data = rendered.image; base.mime = rendered.mime; base.info = rendered.info; composed = true; }
  } catch (err) {
    console.error('[Hermes] text layer render failed:', err.message);
  }
  const layerInfo = layerCaption(layer, { composed });
  const caption = [edited && edited.kind !== 'text-only' ? edited.caption : '', layerInfo].filter(Boolean).join('\n\n');
  if (key) await rememberTextLayer(env, key, { image: clean.data, mime: clean.mime, layer });
  return { edited, base, clean, layer, composed, caption, textOnly: pureText };
}

/**
 * A follow-up that only moves the words («بالاتر ببر»، «سفیدش کن»، «متن رو عوض کن…»، «متن رو بردار»):
 * the remembered layer is replayed on the same picture, rendered again and remembered as the new
 * state, so the user can keep tuning by chat - no photo to send, no image model to pay for.
 */
export async function tuneLayerTurn(env, key, tune, recalled) {
  const layer = applyTune(recalled.layer, tune);
  const clean = { data: recalled.image, mime: recalled.mime };
  let base = { ...clean, info: { width: layer.width, height: layer.height } };
  let composed = false;
  if (!tune.remove) {
    try {
      const rendered = await renderTextLayer(env, clean.data, clean.mime, layer);
      if (rendered) { base = { data: rendered.image, mime: rendered.mime, info: rendered.info }; composed = true; }
    } catch (err) {
      console.error('[Hermes] text layer render failed:', err.message);
    }
  }
  // What the user gets *is* the current state: for a removal the picture is sent as-is (with no
  // words on it), so the caption can say so instead of pointing at the app.
  const caption = tuneCaption(recalled.layer, layer, tune, { composed: composed || !!tune.remove });
  if (tune.remove) await forgetTextLayer(env, key);
  else await rememberTextLayer(env, key, { image: clean.data, mime: clean.mime, layer });
  return { clean, base, layer: tune.remove ? null : layer, composed, caption, tuned: true };
}

// The edited photo goes back as a before/after pair, so the improvement is visible at a glance.
// Falls back to a single photo when Telegram refuses the album (odd size or exotic format).
/** The layer as the page needs it: lines, geometry and style, but no server-only fields. */
export function layerForApp(layer) {
  if (!layer) return null;
  return {
    text: layer.text, lines: layer.lines, fontSize: layer.fontSize, lineHeight: layer.lineHeight,
    positions: layer.positions, x: layer.x, align: layer.align, direction: layer.direction,
    font: layer.font, weight: layer.weight, fill: layer.fill, stroke: layer.stroke,
    strokeWidth: layer.strokeWidth, shadow: layer.shadow, bar: layer.bar, barFill: layer.bar_fill,
    barHeight: layer.bar ? layer.barBox.height : 0, width: layer.width, height: layer.height,
    position: layer.position,
  };
}

/** One picture with a caption (no before/after pair): used when there is nothing to compare. */
export async function sendPicture(env, chatId, image, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', String(caption || '').slice(0, 1000));
  form.append('photo', new Blob([base64ToBytes(image.data)], { type: image.mime }),
    image.mime === 'image/png' ? 'hermes-text.png' : 'hermes-text.jpg');
  return fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form })
    .then((r) => r.json()).catch(() => ({}));
}

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
  const out = await fetchWithTimeout(api('sendMediaGroup'), { method: 'POST', body: album }).then((r) => r.json()).catch(() => ({}));
  if (out && out.ok) return true;
  // Fallback: one photo (the best take), or the caption text if even that is refused.
  const single = new FormData();
  single.append('chat_id', String(chatId));
  single.append('caption', caption.slice(0, 1000));
  single.append('photo', new Blob([base64ToBytes(edited.image)], { type: edited.mime }), edited.mime === 'image/png' ? 'hermes-edit.png' : 'hermes-edit.jpg');
  const one = await fetchWithTimeout(api('sendPhoto'), { method: 'POST', body: single }).then((r) => r.json()).catch(() => ({}));
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
    // Live provider checks cost real (tiny) requests, so they stay behind a key: 404 until HEALTH_KEY is set.
    if (request.method === 'GET' && url.pathname === '/health/deep') {
      if (!env.HEALTH_KEY) return text('not found', 404);
      if (request.headers.get('authorization') !== `Bearer ${String(env.HEALTH_KEY).trim()}`) return text('forbidden', 403);
      const d = await diagnose(env);
      return jsonProbe(d, d.text ? 200 : 503);
    }
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

  // Cron (see wrangler.toml [triggers]): fire reminders whose time has come, then hand each
  // chat its morning digest. Failures are logged and never fail the cron invocation.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env).catch((err) => console.error('[Hermes][cron]', err.message)));
  },
};

// The owner's web app shares memory with their private Telegram chat (chat id == user id).
// Team members each get their own private memory.
const ownerKey = (env) => `history:${String(env.ALLOWED_USER_ID).trim()}`;
// The identity reminders are filed under: the owner's Telegram chat id (the same id the
// /reminders command uses), or a stable per-member key for signed-in teammates.
const chatIdOf = (env, who) => (who.role === 'owner' ? String(env.ALLOWED_USER_ID).trim() : `app:${who.username}`);
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
  const json = (body, status = 200, extraHeaders = {}) => { recordRequest(status >= 500); return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  }); };
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
    const team = env.MEMORY ? await listAccounts(env) : Object.entries(USERS).map(([username, u]) => ({ username, name: u.name, role: u.role }));
    return json({ team: team.filter((a) => !a.disabled).map(({ username, name, role }) => ({ username, name, role })) });
  }
  // Account management: the owner only (roadmap #6).
  if (url.pathname.startsWith('/api/admin/accounts')) {
    if (who.role !== 'owner') return json({ error: 'فقط مالک می‌تواند حساب‌ها را مدیریت کند.' }, 403);
    try {
      if (request.method === 'GET' && url.pathname === '/api/admin/accounts') return json({ accounts: await listAccounts(env), abilities: Object.keys(ABILITIES) });
      const body = request.method === 'POST' ? await request.json().catch(() => ({})) : null;
      if (body && url.pathname === '/api/admin/accounts') return json({ account: await createAccount(env, body, ABILITIES) });
      if (body && url.pathname === '/api/admin/accounts/disable') return json(await setDisabled(env, body.username, body.disabled !== false));
      if (body && url.pathname === '/api/admin/accounts/reset') return json(await resetPassword(env, body.username));
    } catch (err) {
      return json({ error: err.message }, 400);
    }
    return json({ error: 'not found' }, 404);
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
  if (request.method === 'GET' && url.pathname === '/api/reminders') return json({ reminders: await listReminders(env, chatIdOf(env, who)) });
  if (request.method === 'POST' && url.pathname === '/api/reminders') {
    const body = await request.json().catch(() => ({}));
    const parsed = parseReminder(String(body.text || '').slice(0, 500));
    if (!parsed) return json({ error: 'متنی برای یادآور پیدا نکردم. مثال: «یادم بنداز ساعت ۹: تماس با بانک»' }, 400);
    try { return json({ reminder: await addReminder(env, chatIdOf(env, who), parsed) }); }
    catch (err) { return json({ error: err.message }, 502); }
  }
  if (request.method === 'POST' && url.pathname === '/api/reminders/delete') {
    const body = await request.json().catch(() => ({}));
    const mine = await listReminders(env, chatIdOf(env, who));
    if (!mine.some((r) => r.id === body.id)) return json({ error: 'یادآور پیدا نشد' }, 404);
    await deleteReminder(env, body.id);
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
  // The app's per-version button: refine one of the takes that was just delivered.
  if (request.method === 'POST' && url.pathname === '/api/pick') {
    const body = await request.json().catch(() => ({}));
    const take = Math.max(1, Math.min(MAX_PICKS, Number(body.take) || 0));
    const key = historyKey(env, who);
    const [last, set] = await Promise.all([recallEdit(env, key), recallVariations(env, key)]);
    if (!last || !set || !set.takes[take - 1]) return json({ error: 'این مجموعه دیگر در دسترس نیست؛ عکس را دوباره بفرست.' }, 404);
    try {
      const edited = await refineTake(env, ask, { ...set, image: last.image, mime: last.mime }, take);
      if (!edited || !edited.image) return json({ error: 'این نسخه قابل ادامه نبود.' }, 502);
      return json({ reply: edited.caption, image: `data:${edited.mime};base64,${edited.image}`, picked: take });
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
      const plan = photo ? editRequest(message) : null;
      const wantsText = photo ? textRequest(message) : null;
      // A follow-up that only moves the words («بالاتر ببر»، «سفیدش کن»، «متن رو بردار»): the remembered
      // layer is replayed and the app re-draws it, so nothing is sent again and no model is called.
      const tune = layerTuneRequest(message);
      if (tune) {
        const saved = await recallTextLayer(env, key);
        if (saved) {
          const turn = await tuneLayerTurn(env, key, tune, saved);
          const reply = photo ? `${turn.caption}\n(روی همان عکس قبلی نشست؛ نیازی به فرستادن دوبارهٔ عکس نبود.)` : turn.caption;
          return json({ reply, image: `data:${turn.clean.mime};base64,${turn.clean.data}`,
            textLayer: layerForApp(turn.layer) });
        }
        if (!photo) return json({ error: 'لایهٔ متنی فعالی ندارم. عکس را بفرست و بگو چه متنی بنویسم؛ بعد با «بالاتر ببر» یا «سفیدش کن» تغییرش بده.' }, 400);
      }
      // Text alone: no image model is involved, only the typographic layer.
      if (photo && wantsText && (!plan || plan.op === 'text')) {
        const turn = await textLayerTurn(env, ask, photo.data, photo.mime, message, null, key);
        // The canvas draws the layer itself, so it gets the clean picture: drawing the words over an
        // already composed picture would put them there twice.
        return json({ reply: turn.caption, image: `data:${turn.clean.mime};base64,${turn.clean.data}`,
          textLayer: layerForApp(turn.layer) });
      }
      if (photo && plan && plan.op === 'text' && !wantsText) return json({ error: ASK_FOR_TEXT }, 400);
      if (photo && plan && plan.op !== 'text') {
        const edited = await handlePhotoEdit(env, ask, photo.data, photo.mime, message);
        if (edited) {
          await Promise.all([
            edited.image ? rememberEdit(env, key, { original: photo.data, mime: photo.mime, request: message,
              op: edited.op, strength: edited.strength }) : Promise.resolve(),
            edited.variations ? rememberVariations(env, key, { ...edited, request: message }) : Promise.resolve(),
          ]);
          if (!wantsText) await forgetTextLayer(env, key); // edited again: no layer sits on it now
          if (wantsText && !edited.variations) {
            // An edit plus words: deliver the edited picture and the layer for the canvas.
            const spec = textLayout(designSpec({ text: wantsText.text, width: (edited.info && edited.info.width) || 1024,
              height: (edited.info && edited.info.height) || 1024, position: wantsText.position, style: wantsText.style,
              size: wantsText.size, bar: wantsText.bar, tone: (edited.brief && edited.brief.regionTone) || 'mixed' }));
            await rememberTextLayer(env, key, { image: edited.image, mime: edited.mime, layer: spec });
            return json({ reply: [edited.caption, layerCaption(spec)].join('\n\n'),
              image: `data:${edited.mime};base64,${edited.image}`,
              score: edited.review && edited.review.derived ? edited.score : undefined,
              upscaled: edited.upscale && edited.upscale.image ? { width: edited.upscale.info.width, height: edited.upscale.info.height } : undefined,
              textLayer: layerForApp(spec) });
          }
          return json({ reply: edited.caption, image: edited.image ? `data:${edited.mime};base64,${edited.image}` : undefined,
            images: edited.variations ? edited.variations.map((v) => `data:${v.mime};base64,${v.image}`) : undefined,
            picks: edited.variations ? edited.variations.map((v) => v.variantLabel) : undefined,
            score: edited.review && edited.review.derived ? edited.score : undefined,
            upscaled: edited.upscale && edited.upscale.image ? { width: edited.upscale.info.width, height: edited.upscale.info.height } : undefined });
        }
      }
      // Photo-less follow-up («ملایم‌تر» / «نسخهٔ ۲») on the last edited photo.
      if (!photo && (editRequest(message) || followUpRequest(message) || pickRequest(message))) {
        const last = await recallEdit(env, key);
        if (last) {
          const pick = pickRequest(message);
          const set = pick ? await recallVariations(env, key) : null;
          if (pick && set && set.takes[pick.take - 1]) {
            const edited = await refineTake(env, ask, { ...set, image: last.image, mime: last.mime }, pick.take);
            if (edited) return json({ reply: edited.caption, image: `data:${edited.mime};base64,${edited.image}`, picked: pick.take });
          }
          const edited = await continueEdit(env, ask, last, message);
          await forgetTextLayer(env, key);
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
      const system = who.role === 'owner' ? SYSTEM + await projectKnowledge(env, message) : teamSystem(who);
      const tools = who.role === 'owner' ? await googleTools(env) : null;
      return json({ reply: await converse(env, historyKey(env, who), message, system, photo ? [photo] : [], tools) });
    } catch (err) {
      return json({ error: err.message }, 502);
    }
  }
  return json({ error: 'not found' }, 404);
}

/**
 * Cron body: deliver every reminder whose time has come (once), then the morning digest.
 * Kept exported and side-effect-free for unit tests with a fake env.
 */
export async function runReminders(env, now = new Date()) {
  if (!env.TELEGRAM_BOT_TOKEN) return { delivered: 0, digests: 0 };
  const due = await dueReminders(env, now);
  let delivered = 0;
  for (const r of due) {
    try {
      await send(env, r.chatId, `⏰ یادآور: ${r.text}`);
      await markSent(env, r.id);
      delivered += 1;
    } catch (err) {
      console.error('[Hermes][reminder]', r.id, err.message);
    }
  }
  // The digest is the day's agenda: only fires once per day, at the 8am Tehran run.
  let digests = 0;
  const tehranHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', hour: 'numeric', hour12: false }).format(now));
  if (tehranHour === 8) {
    for (const d of morningDigest(await allReminders(env), now)) {
      if (!d.text) continue;
      try { await send(env, d.chatId, d.text); digests += 1; } catch (err) { console.error('[Hermes][digest]', err.message); }
    }
  }
  return { delivered, digests };
}

// Weather for the app's HUD: the caller's city from Cloudflare's geo data, else Tehran. Keyless open-meteo.
export async function weather(request) {
  const cf = request.cf || {};
  const lat = Number(cf.latitude), lon = Number(cf.longitude);
  const here = Number.isFinite(lat) && Number.isFinite(lon) && cf.city;
  const [la, lo, city] = here ? [lat, lon, cf.city] : [35.69, 51.39, 'Tehran'];
  try {
    const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,weather_code`);
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
  recordRequest(false);
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
    // Hermes Business: a contracted company's people talk to their own isolated workspace.
    if (env.MEMORY) {
      const text = typeof msg.text === 'string' ? msg.text.trim() : '';
      const join = text.match(/^\/join(?:@\w+)?\s+(\S+)/i);
      const member = await membership(env, userId);
      if (join && !member) {
        const joined = await joinWorkspace(env, userId, join[1]);
        if (joined.error) return send(env, chatId, joined.error);
        await send(env, String(env.ALLOWED_USER_ID).trim(), `👤 ${[msg.from.first_name, msg.from.username && `@${msg.from.username}`].filter(Boolean).join(' ') || userId} به «${joined.ws.name}» پیوست (${joined.role}).`);
        return send(env, chatId, `✅ به «${joined.ws.name}» خوش آمدی!\n\n${await clientCommand(env, userId, joined, '/help')}`);
      }
      if (member) return handleClient(msg, env, chatId, userId, member);
    }
    await tg(env, 'sendMessage', { chat_id: chatId, text: `این بات خصوصی است. شناسهٔ شما: ${userId}\n\nکسب‌وکارت با هرمس قرارداد دارد؟ کد عضویتی را که گرفتی این‌طور بفرست: /join کد\n\nمسئول رزرو وایکینگ هستی؟ دکمهٔ پایین رو بزن تا شماره‌ت ثبت بشه و گزارش رزروها برات بیاد.`,
      reply_markup: { keyboard: [[{ text: '📱 ارسال شمارهٔ من', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
    return;
  }
  const key = ownerKey(env);
  const read = await readInput(env, msg, chatId);
  if (!read) return;
  const { input, images, heard } = read;
  if (env.MEMORY && /^\/(users|user_)/i.test(input)) {
    try {
      const reply = await accountCommand(env, input, ABILITIES);
      if (reply) return send(env, chatId, reply);
    } catch (err) {
      return send(env, chatId, err.message);
    }
  }
  if (/^\/(ci|prs|file|review)\b/i.test(input)) {
    let gh;
    try {
      gh = await githubCommand(env, input);
    } catch (err) {
      return send(env, chatId, err.message);
    }
    if (gh && gh.reply) return send(env, chatId, gh.reply);
    if (gh && gh.file) return sendFile(env, chatId, gh.file.name, gh.file.text, gh.file.caption);
    if (gh && gh.review) {
      await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
      try {
        return sendAnswer(env, chatId, await converse(env, key, gh.review, SYSTEM, [], null));
      } catch (err) {
        return send(env, chatId, `خطا: ${err.message}`);
      }
    }
  }
  if (/^\/projects(?:@\w+)?$/i.test(input)) {
    const text = await portfolioText(env);
    return send(env, chatId, text ? text.slice(0, 4000) : 'نقشهٔ پروژه‌ها در این استقرار نیست (docs/PORTFOLIO.md).');
  }
  if (env.MEMORY && /^\/client/.test(input)) {
    try {
      const reply = await ownerCommand(env, input);
      if (reply) return send(env, chatId, reply);
    } catch (err) {
      return send(env, chatId, err.message);
    }
  }
  if (input === '/start') {
    return send(env, chatId, 'سلام! من هرمس هستم. هر چه می‌خواهی بپرس.\n' +
      'همهٔ گفتگوها ذخیره می‌ماند. با «یادت باشه ...» چیزی را برای همیشه به خاطر می‌سپارم.\n' +
      'عکس بساز: ... یک عکس می‌سازم\n' +
      'عکس بفرست و بنویس چه تغییری می‌خواهی («این عکس رو ریتوش کن»، «پس‌زمینه رو عوض کن»، «کیفیتش رو بالا ببر»، «چند نسخه») تا حرفه‌ای ویرایشش کنم و قبل/بعد را با هم بفرستم.\n' +
      'بعد از هر ویرایش می‌توانی بگویی «ملایم‌تر» یا «قوی‌تر» — همان عکس را دوباره لازم نیست بفرستی.\n' +
      'با «چند نسخه» سه نسخه می‌گیری؛ بعد بنویس «نسخهٔ ۲» تا همان را دقیق‌تر کنم.\n' +
      'متن روی عکس هم می‌شود: «روی عکس بنویس: کمپ وایکینگ» — با فونت واقعی می‌نشیند، پس فارسی سالم می‌ماند.\n' +
      'بعد از آن متن با پیام هم جابه‌جا می‌شود: «بالاتر ببر»، «کمی پایین‌تر»، «وسطش بذار»، «سفیدش کن»، «درشت‌ترش کن»، «بدون نوار»، «متن رو بردار».\n' +
      'ویس بفرست تا گوش بدهم، عکس بفرست تا ببینم؛ برای خبرها و چیزهای روز در گوگل جست‌وجو می‌کنم.\n' +
      'یادآور: بنویس «یادم بنداز ساعت ۹: تماس با بانک» یا «یادم بنداز فردا ۱۰: قرار دکتر» یا «remind me in 30 minutes: call Bob» — سر وقت بهت پیام می‌دم و هر صبح لیست روزت را می‌فرستم. لیست و حذف: /reminders\n' +
      'کدنویسی: هر سؤال کد، باگ یا ریویو را بفرست؛ کد کامل + تست + دستور اجرا می‌گیری و کد بلند به‌صورت فایل می‌آید. ریپو: /ci وضعیت CI · /prs PRهای باز · /file مسیر · /review مسیر (بازبینی حرفه‌ای فایل)\n' +
      'پروژه‌ها: /projects نقشهٔ همهٔ پروژه‌ها و ریپوها؛ دربارهٔ هر پروژه (هرمس، چام، وایکینگ، لیتوس…) بپرس تا از روی مستنداتش جواب بدهم\n' +
      'مشتری‌ها (Hermes Business): /client_new <نام کسب‌وکار> فضای کاری + کد عضویت مدیر؛ /clients فهرست و مصرف\n' +
      'حساب‌های تیم: /users فهرست؛ /user_add نام‌کاربری member نام؛ /user_off و /user_on؛ /user_reset رمز جدید\n' +
      '/status وضعیت زندهٔ همهٔ مغزها و منبع‌های عکس (کدام کار می‌کند و چرا)\n' +
      '/google اتصال جیمیل، تقویم، درایو و شیت\n' +
      '/reset گفتگوی جدید (قبلی بایگانی می‌شود)\n/notes یادداشت‌های حافظه\n/forget پاک کردن یادداشت‌ها\n/app لینک اپ');
  }
  if (input === '/status' || input === 'وضعیت') {
    await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    return send(env, chatId, formatDiagnosis(await diagnose(env)));
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
  if (input === '/reminders' || input === '/یادآورها') {
    const list = await listReminders(env, chatId);
    if (!list.length) return send(env, chatId, 'یادآوری فعالی نداری. بنویس مثلاً:\n«یادم بنداز ساعت ۹: تماس با بانک»\n«یادم بنداز فردا ۱۰: قرار دکتر»\n«remind me in 30 minutes: call Bob»');
    return send(env, chatId, 'یادآورهای فعال:\n' + list.map((r, i) => `${i + 1}. ${formatReminder(r)}\n   حذف: /rem_del ${i + 1}`).join('\n'));
  }
  {
    const del = input.match(/^\/(?:rem_del|reminder_del|یادآور_حذف)\s+(\d{1,2})$/i);
    if (del) {
      const list = await listReminders(env, chatId);
      const n = Number(del[1]);
      const target = list[n - 1];
      if (!target) return send(env, chatId, `شمارهٔ ${n} در لیست نیست. لیست: /reminders`);
      await deleteReminder(env, target.id);
      return send(env, chatId, `حذف شد: ${formatReminder(target)}`);
    }
  }
  // Natural-language reminders are handled before the chat path so «یادم بنداز ...» never
  // reaches the model: it is a scheduling command, not a conversation.
  {
    const parsed = parseReminder(input);
    if (parsed) {
      try {
        const entry = await addReminder(env, chatId, parsed);
        return send(env, chatId, `⏰ ثبت شد: ${formatReminder(entry)}\n\nلیست: /reminders`);
      } catch (err) {
        return send(env, chatId, `ثبت یادآور انجام نشد: ${err.message}`);
      }
    }
  }

  // A follow-up that only moves the words («بالاتر ببر»، «سفیدش کن»): the layer and the picture under
  // it are remembered, so the new version is rendered right here. This is checked *before* the edit
  // follow-up, because «متن رو عوض کن به «…»» and «متن رو بردار» also look like edit instructions.
  {
    const tune = layerTuneRequest(input);
    if (tune) {
      const saved = await recallTextLayer(env, key);
      if (saved) {
        await tg(env, 'sendChatAction', { chat_id: chatId, action: 'upload_photo' });
        try {
          const turn = await tuneLayerTurn(env, key, tune, saved);
          // A photo may ride along with the words; the layer still belongs to the picture it was set on.
          const caption = images.length ? `${turn.caption}\n(روی همان عکس قبلی نشست؛ نیازی به فرستادن دوبارهٔ عکس نبود.)` : turn.caption;
          const before = { data: saved.image, mime: saved.mime };
          if (turn.composed) await sendEdited(env, chatId, before, { image: turn.base.data, mime: turn.base.mime, caption });
          else if (tune.remove) await sendPicture(env, chatId, turn.base, caption);
          else await send(env, chatId, caption); // no Browser Rendering: the app draws it
        } catch (err) {
          await send(env, chatId, `تغییر متن انجام نشد: ${err.message}`);
        }
        return;
      }
    }
  }

  // A follow-up turn («نسخهٔ ۲»، «ملایم‌تر»، «قوی‌تر»، «چند نسخه») reuses the photo that was edited
  // last, so the user never has to send it again inside the same hour.
  if (!images.length && (editRequest(input) || followUpRequest(input) || pickRequest(input))) {
    const last = await recallEdit(env, key);
    if (last) {
      await tg(env, 'sendChatAction', { chat_id: chatId, action: 'upload_photo' });
      try {
        const pick = pickRequest(input);
        const set = pick ? await recallVariations(env, key) : null;
        if (pick && set && set.takes[pick.take - 1]) {
          const edited = await refineTake(env, ask, { ...set, image: last.image, mime: last.mime }, pick.take, { request: '' });
          if (edited && edited.image) await sendEdited(env, chatId, { data: last.image, mime: last.mime }, edited);
          else await send(env, chatId, `نسخهٔ ${faDigits(pick.take)} در دسترس نیست.`);
          return;
        }
        const edited = await continueEdit(env, ask, last, input);
        await forgetTextLayer(env, key); // the picture changed: an older layer is not on it any more
        if (edited.image) await sendEdited(env, chatId, { data: last.image, mime: last.mime }, edited);
        else await send(env, chatId, edited.caption);
      } catch (err) {
        await send(env, chatId, `ویرایش انجام نشد: ${err.message}`);
      }
      return;
    }
  }

  // Photo + (edit instruction and/or a text layer): run the studio, then set the words in a real font.
  const textWish = images.length ? textRequest(input) : null;
  if (images.length && (editRequest(input) || textWish)) {
    await tg(env, 'sendChatAction', { chat_id: chatId, action: 'upload_photo' });
    try {
      // "put text on it" without the words: ask for the words instead of guessing.
      if (!textWish && editRequest(input).op === 'text') return send(env, chatId, ASK_FOR_TEXT);
      const turn = await textLayerTurn(env, ask, images[0].data, images[0].mime, input, null, key);
      if (turn && !turn.layer) await forgetTextLayer(env, key); // an edit without words: no layer to move
      if (turn && turn.edited && turn.edited.image) {
        await rememberEdit(env, key, { original: images[0].data, mime: images[0].mime, request: input,
          op: turn.edited.op, strength: turn.edited.strength });
        if (turn.edited.variations) await rememberVariations(env, key, { ...turn.edited, request: input });
      }
      if (turn && turn.edited && turn.edited.variations && !turn.layer) {
        await sendEdited(env, chatId, images[0], turn.edited);
      } else if (turn && turn.base && (turn.layer || (turn.edited && turn.edited.image))) {
        await sendEdited(env, chatId, images[0], {
          image: turn.base.data, mime: turn.base.mime, caption: turn.caption, variations: null,
          info: turn.base.info,
        });
      } else if (turn && turn.edited) await send(env, chatId, turn.edited.caption);
      else await send(env, chatId, ASK_FOR_TEXT);
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
      await sendGenerated(env, chatId, await picture(env, key, input, wanted));
    } catch (err) {
      await send(env, chatId, `خطا در ساخت عکس: ${err.message}`);
    }
    return;
  }

  await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
  let reply;
  try {
    reply = await converse(env, key, input, SYSTEM + await projectKnowledge(env, input), images, await googleTools(env));
  } catch (err) {
    return send(env, chatId, `خطا: ${err.message}`);
  }
  await sendAnswer(env, chatId, heard ? `🎙️ «${heard}»\n\n${reply}` : reply);
}

// Text, voice (transcribed) or photo (+caption). Returns null when there is nothing to answer.
async function readInput(env, msg, chatId) {
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
      await send(env, chatId, `خطا: ${err.message}`);
      return null;
    }
    if (!input) return null;
  }
  return { input, images, heard };
}

async function sendGenerated(env, chatId, { image, mime, prompt }) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', prompt.slice(0, 1000));
  form.append('photo', new Blob([base64ToBytes(image)], { type: mime }), mime === 'image/png' ? 'hermes.png' : 'hermes.jpg');
  await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
}

// A workspace member: own memory key, business prompt, daily quota; never the owner's tools or data.
async function handleClient(msg, env, chatId, userId, member) {
  const { ws, role } = member;
  if (!ws.active) return send(env, chatId, `سرویس هرمس برای «${ws.name}» موقتاً متوقف است. با مدیر قرارداد تماس بگیر.`);
  const read = await readInput(env, msg, chatId);
  if (!read) return;
  const { input, images, heard } = read;
  try {
    const reply = await clientCommand(env, userId, member, input);
    if (reply) return send(env, chatId, reply);
  } catch (err) {
    return send(env, chatId, err.message);
  }
  const key = wsHistoryKey(ws.id, userId);
  const wanted = imageRequest(input);
  if (wanted === '') return send(env, chatId, 'بنویس چه عکسی می‌خواهی، مثلاً:\nعکس بساز: پست اینستاگرام برای تخفیف پاییزه');
  const cost = await spend(env, ws, wanted ? IMAGE_UNITS : 1);
  if (!cost.ok) return send(env, chatId, `سهمیهٔ امروز «${ws.name}» تمام شده (${cost.used} از ${ws.quota}). فردا دوباره در خدمتم؛ برای سقف بیشتر با مدیر قرارداد هماهنگ کن.`);
  if (wanted) {
    await tg(env, 'sendChatAction', { chat_id: chatId, action: 'upload_photo' });
    try {
      await sendGenerated(env, chatId, await picture(env, key, input, wanted));
    } catch (err) {
      await send(env, chatId, `خطا در ساخت عکس: ${err.message}`);
    }
    return;
  }
  await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
  let reply;
  try {
    reply = await converse(env, key, input, businessSystem(ws, await getKnowledge(env, ws.id), role), images, null);
  } catch (err) {
    return send(env, chatId, `خطا: ${err.message}`);
  }
  await sendAnswer(env, chatId, heard ? `🎙️ «${heard}»\n\n${reply}` : reply);
}

export function chunks(str, size = TG_LIMIT) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out.length ? out : [''];
}

async function send(env, chatId, body) {
  for (const part of chunks(body)) await tg(env, 'sendMessage', { chat_id: chatId, text: part });
}

// A reply, plus its big code blocks as files: long messages are split by Telegram, which breaks copying code.
async function sendAnswer(env, chatId, reply) {
  await send(env, chatId, reply);
  for (const f of codeFiles(reply)) await sendFile(env, chatId, f.name, f.text, `📄 ${f.name}`);
}

async function sendFile(env, chatId, name, body, caption = '') {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption.slice(0, 1000));
  form.append('document', new Blob([body], { type: 'text/plain' }), name);
  const res = await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form });
  return res.json().catch(() => ({ ok: false }));
}

async function tg(env, method, payload) {
  const res = await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({ ok: false }));
}

function text(body, status = 200) {
  recordRequest(status >= 500);
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
