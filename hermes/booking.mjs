// Public trip page + bookings. Flow:
// 1. Traveller fills the form on /trip → POST /api/booking → saved in KV and posted to the team's Telegram
//    (BOOKING_CHAT_ID, else the owner) with ✅/❌ buttons.
// 2. Optional: the traveller taps "خبرم کن" → t.me/<bot>?start=bk_<id> → the bot remembers their chat.
// 3. The team approves → the traveller's status page (/trip/s/<id>) and their Telegram show the payment info
//    (PAYMENT_INFO). Payment happens only after approval; after payment there is no cancellation.

import { TRIP_HERO, TRIP_LOGO } from './trip-media.mjs';

export const TRIP = {
  title: 'کمپ کنار دریاچه و پدل‌سواری',
  dates: '۳۰ مهر تا ۱ آبان',
  prices: { personal: '۷ میلیون تومان (فول‌برد)', group: '۳٫۵ میلیون تومان اضافه' },
};
export const CARS = ['خودروی شخصی', 'خودروی گروه'];
const TTL = 90 * 86400;
const NO_REFUND = 'پرداخت فقط بعد از تأیید رزرو توسط تیم وایکینگ انجام می‌شه. بعد از پرداخت، امکان کنسلی و برگشت وجه وجود نداره.';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toLatin = (s) => String(s || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const newId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

// Validates the form body; returns { booking } or { error }.
export function validate(body) {
  const b = body || {};
  if (b.website) return { error: 'spam' };
  const name = String(b.name || '').trim().slice(0, 60);
  const phone = toLatin(b.phone).replace(/[\s()-]/g, '');
  const count = Number(toLatin(b.count)) || 0;
  const car = CARS.includes(b.car) ? b.car : 'انتخاب نشده';
  if (name.length < 2) return { error: 'نام رو کامل بنویس.' };
  if (!/^\+?\d{10,14}$/.test(phone)) return { error: 'شمارهٔ تماس درست نیست.' };
  if (count < 1 || count > 20) return { error: 'تعداد نفرات باید بین ۱ تا ۲۰ باشه.' };
  if (b.agree !== true) return { error: 'برای ثبت رزرو، شرایط رو تأیید کن.' };
  return { booking: { name, phone, count, car, note: String(b.note || '').trim().slice(0, 400) } };
}

const teamChat = (env) => String(env.BOOKING_CHAT_ID || env.ALLOWED_USER_ID || '').trim();
const admins = (env) => [env.ALLOWED_USER_ID, ...String(env.BOOKING_ADMIN_IDS || '').split(',')].map((s) => String(s || '').trim()).filter(Boolean);

function teamText(id, k, status) {
  const head = status === 'approved' ? '✅ تأیید شد' : status === 'rejected' ? '❌ رد شد' : '🆕 درخواست رزرو جدید';
  return `${head} · کد ${id}\n${TRIP.title} (${TRIP.dates})\n\n` +
    `نام: ${k.name}\nشماره: ${k.phone}\nتعداد: ${k.count} نفر\nرفت‌وآمد: ${k.car}` +
    (k.note ? `\nتوضیح: ${k.note}` : '') + (k.chat ? '\n📲 خبر تأیید در تلگرام به مسافر می‌رسد.' : '') +
    (k.by ? `\n\nبررسی: ${k.by}` : '');
}
const buttons = (id) => ({ inline_keyboard: [[{ text: '✅ تأیید و ارسال اطلاعات پرداخت', callback_data: `bk:ok:${id}` }], [{ text: '❌ رد', callback_data: `bk:no:${id}` }]] });

// POST /api/booking
export async function createBooking(env, tg, request, body) {
  if (!env.MEMORY) return { status: 503, data: { error: 'رزرو موقتاً در دسترس نیست.' } };
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rlKey = `bk:rl:${ip}`;
  const used = Number(await env.MEMORY.get(rlKey)) || 0;
  if (used >= 5) return { status: 429, data: { error: 'تعداد درخواست‌ها زیاد شد؛ یک ساعت دیگه دوباره امتحان کن.' } };
  await env.MEMORY.put(rlKey, String(used + 1), { expirationTtl: 3600 });
  const { booking, error } = validate(body);
  if (error === 'spam') return { status: 200, data: { id: 'ok' } };
  if (error) return { status: 400, data: { error } };
  const id = newId();
  const record = { ...booking, id, status: 'pending', t: Date.now() };
  const sent = await tg(env, 'sendMessage', { chat_id: teamChat(env), text: teamText(id, record), reply_markup: buttons(id) });
  if (sent && sent.ok) record.msg = { chat: sent.result.chat.id, id: sent.result.message_id };
  await env.MEMORY.put(`booking:${id}`, JSON.stringify(record), { expirationTtl: TTL });
  return { status: 200, data: { id, status: `/trip/s/${id}`, bot: await botName(env, tg) } };
}

async function botName(env, tg) {
  const cached = await env.MEMORY.get('bot:username');
  if (cached) return cached;
  const me = await tg(env, 'getMe', {});
  const name = me && me.ok ? me.result.username : '';
  if (name) await env.MEMORY.put('bot:username', name, { expirationTtl: 86400 * 7 });
  return name;
}

const load = async (env, id) => (/^[a-z2-9]{6}$/.test(id || '') ? env.MEMORY.get(`booking:${id}`, 'json') : null);
const save = (env, k) => env.MEMORY.put(`booking:${k.id}`, JSON.stringify(k), { expirationTtl: TTL });

export const paymentText = (env) => `💳 اطلاعات پرداخت:\n${env.PAYMENT_INFO || 'تیم وایکینگ به‌زودی اطلاعات پرداخت رو برات می‌فرسته.'}\n\n⚠️ ${NO_REFUND}`;

// Telegram ✅/❌ from the team.
export async function onCallback(env, tg, cq) {
  const m = /^bk:(ok|no):([a-z2-9]{6})$/.exec(cq.data || '');
  if (!m) return false;
  if (!admins(env).includes(String(cq.from && cq.from.id))) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'فقط تیم وایکینگ می‌تواند رزرو را بررسی کند.', show_alert: true });
    return true;
  }
  const k = await load(env, m[2]);
  if (!k) { await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'این رزرو پیدا نشد یا منقضی شده.' }); return true; }
  if (k.status === 'pending') {
    k.status = m[1] === 'ok' ? 'approved' : 'rejected';
    k.by = [cq.from.first_name, cq.from.last_name].filter(Boolean).join(' ') || String(cq.from.id);
    await save(env, k);
    if (k.chat) {
      await tg(env, 'sendMessage', { chat_id: k.chat, text: k.status === 'approved'
        ? `🎉 رزروت برای «${TRIP.title}» تأیید شد! (کد ${k.id})\n\n${paymentText(env)}`
        : `رزرو ${k.id} برای «${TRIP.title}» این بار تأیید نشد. برای سفرهای بعدی خوشحال می‌شیم همراهمون باشی 🙏` });
    }
  }
  if (cq.message) {
    await tg(env, 'editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: teamText(k.id, k, k.status) });
  }
  await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: k.status === 'approved' ? 'تأیید شد ✅' : 'رد شد' });
  return true;
}

// /start bk_<id> from the traveller: remember their chat so the decision reaches them.
export async function onTravellerStart(env, tg, msg) {
  const m = /^\/start bk_([a-z2-9]{6})$/.exec((msg.text || '').trim());
  if (!m) return false;
  const k = await load(env, m[1]);
  if (!k) { await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: 'این کد رزرو پیدا نشد.' }); return true; }
  k.chat = msg.chat.id;
  await save(env, k);
  const text = k.status === 'approved' ? `رزروت تأیید شده ✅\n\n${paymentText(env)}`
    : k.status === 'rejected' ? 'این رزرو تأیید نشد.' : `✅ درخواستت (کد ${k.id}) ثبت شده. به‌محض بررسی، همین‌جا خبرت می‌کنیم.`;
  await tg(env, 'sendMessage', { chat_id: msg.chat.id, text });
  return true;
}

const shell = (title, body) => `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lalezar&family=Vazirmatn:wght@400;600;800&display=swap">
<style>:root{--bg:#0d0f10;--surface:#16191b;--line:#2a2f32;--fg:#f3eee6;--muted:#a59f95;--orange:#f39a2b;--ink:#141414;--ok:#7bc47f;--bad:#ff8a7a;
--display:'Lalezar','Vazirmatn',Tahoma,sans-serif;--body:'Vazirmatn',Tahoma,'Segoe UI',sans-serif;color-scheme:dark}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.85 var(--body);direction:rtl;padding:0 16px 40px}
.wrap{max-width:560px;margin-inline:auto;display:grid;gap:22px}
.hero{position:relative;border-radius:0 0 22px 22px;overflow:hidden;margin-inline:-16px;min-height:440px;display:grid;align-content:end;
background:linear-gradient(180deg,rgba(13,15,16,.35),rgba(13,15,16,.05) 35%,rgba(13,15,16,.92)),url(${TRIP_HERO}) center 40%/cover}
.hero-in{padding:20px 22px 26px;display:grid;gap:10px;justify-items:start}.logo{position:absolute;top:16px;inset-inline-start:16px;width:64px;height:64px}
.kicker{font-weight:800;font-size:.85rem;color:var(--orange)}
h1{margin:0;font:400 2.5rem/1.15 var(--display);color:var(--ink);background:var(--orange);padding:.12em .45em .2em;clip-path:polygon(1% 8%,99% 0,100% 88%,97% 100%,2% 95%,0 20%)}
.sub{margin:0}.date{display:inline-flex;gap:8px;border:2px solid var(--orange);border-radius:999px;padding:4px 16px;font-weight:800;background:rgba(0,0,0,.45)}
h2{margin:0 0 10px;font:400 1.6rem/1.3 var(--display);color:var(--orange)}
.list{list-style:none;margin:0;padding:0;display:grid;gap:10px}.list li{display:grid;grid-template-columns:34px 1fr;gap:10px}
.list .e{font-size:1.3rem}.list small{display:block;color:var(--muted);font-size:.85rem;line-height:1.6}
.price{display:grid;grid-template-columns:1fr 1fr;gap:10px}.p{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;text-align:center;display:grid}
.p.main{border-color:var(--orange)}.p .v{font:400 1.8rem/1.2 var(--display);white-space:nowrap;color:var(--orange)}.p .n{font-size:.8rem;color:var(--muted)}
.box{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:18px;display:grid;gap:12px}
.warn{border-color:#5a3a1a;background:#1d1610}
label{display:grid;gap:4px;font-weight:600;font-size:.92rem}
input,select,textarea{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px;width:100%}
:focus-visible{outline:2px solid var(--orange);outline-offset:2px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:500}.check input{width:20px;height:20px;accent-color:var(--orange);flex:none;margin-top:5px}
.btn{display:flex;justify-content:center;align-items:center;gap:8px;font:800 1rem var(--body);border-radius:14px;padding:13px 16px;border:0;cursor:pointer;text-decoration:none;background:var(--orange);color:var(--ink)}
.btn.tg{background:#2aabee;color:#fff}.btn.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}
.btn[disabled]{opacity:.6}.msg{margin:0;font-weight:600}.err{color:var(--bad)}.ok{color:var(--ok)}.muted{color:var(--muted);font-size:.9rem;margin:0}
.hp{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;clip-path:inset(50%)}.pre{white-space:pre-wrap;background:var(--bg);border:1px dashed var(--line);border-radius:12px;padding:12px}
footer{color:var(--muted);font-size:.78rem;text-align:center}
@media (max-width:420px){h1{font-size:2.1rem}.row{grid-template-columns:1fr}}</style></head><body><div class="wrap">${body}</div></body></html>`;

export function tripPage() {
  return shell('سفر بعدی وایکینگ', `
<header class="hero"><img class="logo" src="${TRIP_LOGO}" alt="وایکینگ آفرود"><div class="hero-in">
<span class="kicker">🏕️ کمپ جنگلی | فول‌برد</span><h1>${TRIP.title}</h1>
<p class="sub">دو روز طبیعت، ماجراجویی و رفاقت در دل جنگل‌های هیرکانی</p><span class="date">📅 ${TRIP.dates}</span></div></header>
<section><h2>توی این سفر</h2><ul class="list">
<li><span class="e">🏄</span><div>پدل‌سواری در یکی از زیباترین دریاچه‌های گیلان<small>با تمام تجهیزات، مربی و تیم مجرب</small></div></li>
<li><span class="e">🏕️</span><div>کمپ جنگلی فول‌برد</div></li><li><span class="e">🔥</span><div>آتیش‌بازی</div></li>
<li><span class="e">🎯</span><div>بازی و برنامه‌های گروهی</div></li><li><span class="e">🎶</span><div>میز بارتندر بدون الکل</div></li>
<li><span class="e">🍽️</span><div>پذیرایی کامل<small>ناهار با مخلفات · شام · صبحانهٔ سرد و گرم سلف‌سرویس</small></div></li></ul></section>
<section><h2>هزینه</h2><div class="price">
<div class="p main"><span>🚙 خودروی شخصی</span><span class="v">۷ میلیون</span><span class="n">تومان · فول‌برد</span></div>
<div class="p"><span>🚐 خودروی گروه</span><span class="v">۳٫۵ میلیون</span><span class="n">تومان اضافه</span></div></div></section>
<section class="box warn"><h2 style="margin:0">قبل از رزرو بدون</h2>
<p class="muted" style="color:var(--fg)">۱. اول فرم رو پر می‌کنی و تیم وایکینگ رزروت رو بررسی می‌کنه.<br>۲. بعد از تأیید، اطلاعات پرداخت برات فرستاده می‌شه.<br>۳. ${NO_REFUND}</p></section>
<section id="reserve"><h2>رزرو</h2><form class="box" id="f" novalidate>
<div class="row"><label for="name">نام<input id="name" autocomplete="name" placeholder="مثلاً سارا" required></label>
<label for="phone">شمارهٔ تماس<input id="phone" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="0912…" required></label></div>
<div class="row"><label for="count">تعداد نفرات<input id="count" type="number" min="1" max="20" value="1" inputmode="numeric"></label>
<label for="car">رفت‌وآمد (اختیاری)<select id="car"><option value="">انتخاب نکردم</option>${CARS.map((c) => `<option>${c}</option>`).join('')}</select></label></div>
<label for="note">توضیح (اختیاری)<textarea id="note" rows="2" placeholder="سؤال یا درخواست خاص"></textarea></label>
<input class="hp" id="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<label class="check" for="agree"><input id="agree" type="checkbox"> قبول دارم که پرداخت بعد از تأیید انجام می‌شه و بعد از پرداخت کنسلی و برگشت وجه نداره.</label>
<p class="msg err" id="err" hidden></p><button class="btn" id="go" type="submit">ثبت درخواست رزرو</button></form>
<div class="box" id="done" hidden><p class="msg ok">✅ درخواستت ثبت شد. کد پیگیری: <b id="code"></b></p>
<p class="muted">تیم وایکینگ بررسیش می‌کنه و بعد از تأیید، اطلاعات پرداخت رو می‌بینی.</p>
<a class="btn tg" id="tg" target="_blank" rel="noopener" hidden>📲 خبر تأیید رو در تلگرام بگیر</a>
<a class="btn ghost" id="st">مشاهدهٔ وضعیت رزرو</a></div>
<a class="btn ghost" href="https://ig.me/m/viking.offroad" target="_blank" rel="noopener" style="margin-top:12px">سؤال داری؟ دایرکت اینستاگرام وایکینگ</a></section>
<footer>🪪 با مجوز رسمی · @viking.offroad</footer>
<script>(()=>{const $=(i)=>document.getElementById(i);$('f').addEventListener('submit',async(e)=>{e.preventDefault();$('err').hidden=true;$('go').disabled=true;
try{const r=await fetch('/api/booking',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('name').value,phone:$('phone').value,count:$('count').value,car:$('car').value,note:$('note').value,website:$('website').value,agree:$('agree').checked})});
const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'خطا در ثبت؛ دوباره امتحان کن.');
$('f').hidden=true;$('done').hidden=false;$('code').textContent=d.id;$('st').href=d.status;try{localStorage.setItem('viking-booking',d.status)}catch{}
if(d.bot){$('tg').href='https://t.me/'+d.bot+'?start=bk_'+d.id;$('tg').hidden=false}$('done').scrollIntoView({behavior:'smooth'});}
catch(x){$('err').textContent=x.message;$('err').hidden=false}finally{$('go').disabled=false}});})();</script>`);
}

export async function statusPage(env, id) {
  const k = await load(env, id);
  if (!k) return { status: 404, html: shell('رزرو پیدا نشد', '<section class="box" style="margin-top:40px"><p class="msg err">این کد رزرو پیدا نشد.</p><a class="btn" href="/trip">صفحهٔ سفر</a></section>') };
  const body = k.status === 'approved'
    ? `<p class="msg ok">🎉 رزروت تأیید شد!</p><div class="pre">${esc(paymentText(env))}</div>`
    : k.status === 'rejected'
      ? '<p class="msg err">این رزرو این بار تأیید نشد. برای سفرهای بعدی خوشحال می‌شیم همراهمون باشی.</p>'
      : '<p class="msg">⏳ درخواستت در حال بررسیه. این صفحه خودش هر ۳۰ ثانیه به‌روز می‌شه.</p>';
  const refresh = k.status === 'pending' ? '<meta http-equiv="refresh" content="30">' : '';
  return { status: 200, html: shell('وضعیت رزرو', `${refresh}<section class="box" style="margin-top:40px"><h2>وضعیت رزرو ${esc(k.id)}</h2>
<p class="muted">${esc(TRIP.title)} · ${esc(TRIP.dates)}<br>${esc(k.name)} · ${esc(k.count)} نفر · ${esc(k.car)}</p>${body}</section><a class="btn ghost" href="/trip">صفحهٔ سفر</a>`) };
}
