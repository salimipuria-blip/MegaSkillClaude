// Public trip page + bookings. The traveller fills the form on /trip → POST /api/booking → saved in KV and
// the booking details are sent privately to the booking manager: the Telegram account whose phone number matches
// BOOKING_PHONE (registered once by sharing their contact with the bot). Until that account has registered, the
// details go to every team member (ALLOWED_USER_ID + BOOKING_ADMIN_IDS) so no booking is lost.
// No payment info goes out from here: the team contacts the traveller. After payment there is no cancellation.

import { TRIP_HERO, TRIP_LOGO } from './trip-media.mjs';

export const TRIP = {
  title: 'کمپ کنار دریاچه و پدل‌سواری',
  dates: '۳۰ مهر تا ۱ آبان',
  prices: { personal: '۷ میلیون تومان (فول‌برد)', group: '۳٫۵ میلیون تومان اضافه' },
};
export const CARS = ['خودروی شخصی', 'خودروی گروه'];
const TTL = 90 * 86400;
const NO_REFUND = 'بعد از پرداخت، امکان کنسلی و برگشت وجه وجود نداره.';
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

// Every team member, deduped; each must have started the bot once (Telegram can't message a phone number).
export const team = (env) => [...new Set([env.ALLOWED_USER_ID, ...String(env.BOOKING_ADMIN_IDS || '').split(',')]
  .map((s) => String(s || '').trim()).filter(Boolean))];

// Booking manager's phone, stored only as a SHA-256 of its digits (98…); a BOOKING_PHONE secret/var overrides it.
const BOOKING_PHONE_SHA256 = 'f754020cff45bc404c2aab0e8c7940f150560f41c88d3fe0e087b6e856898ed2';
export const normPhone = (s) => {
  let d = toLatin(s).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `98${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('9')) d = `98${d}`;
  return d;
};
const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');
export async function isBookingPhone(env, phone) {
  const d = normPhone(phone);
  if (!d) return false;
  return env.BOOKING_PHONE ? d === normPhone(env.BOOKING_PHONE) : (await sha256(d)) === BOOKING_PHONE_SHA256;
}
export const RECIPIENT_KEY = 'booking:recipient';
export async function recipients(env) {
  const manager = env.MEMORY && await env.MEMORY.get(RECIPIENT_KEY);
  return manager ? [manager] : team(env);
}

// A Telegram contact shared with the bot: registers the booking manager when it is their own number and it matches.
export async function onContact(env, msg) {
  const c = msg.contact;
  if (!c || !msg.from || String(c.user_id) !== String(msg.from.id)) return 'فقط شمارهٔ خودت رو با دکمهٔ پایین بفرست.';
  if (!(await isBookingPhone(env, c.phone_number))) return 'این شماره برای دریافت رزروها ثبت نشده.';
  await env.MEMORY.put(RECIPIENT_KEY, String(msg.chat.id));
  return '✅ ثبت شد. از این به بعد گزارش رزروهای وایکینگ فقط برای همین حساب فرستاده می‌شه.';
}

const teamText = (id, k) => `🆕 رزرو جدید · کد ${id}\n${TRIP.title} (${TRIP.dates})\n\n` +
  `نام: ${k.name}\nشماره: ${k.phone}\nتعداد: ${k.count} نفر\nرفت‌وآمد: ${k.car}` + (k.note ? `\nتوضیح: ${k.note}` : '');

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
  const record = { ...booking, id, t: Date.now() };
  await env.MEMORY.put(`booking:${id}`, JSON.stringify(record), { expirationTtl: TTL });
  const text = teamText(id, record);
  const sent = await Promise.all((await recipients(env)).map((chat_id) => tg(env, 'sendMessage', { chat_id, text }).catch(() => null)));
  if (!sent.some((r) => r && r.ok)) console.error('[Hermes] booking', id, 'reached no team chat');
  return { status: 200, data: { id } };
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
.cars{border:0;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:10px}.cars legend{font-weight:600;font-size:.92rem;margin-bottom:6px;padding:0}
.car{position:relative;display:grid;justify-items:center;gap:2px;text-align:center;background:var(--bg);border:2px solid var(--line);border-radius:16px;padding:14px 8px;cursor:pointer;transition:border-color .15s,box-shadow .15s,transform .1s}
.car input{position:absolute;opacity:0;pointer-events:none}.car .ic{font-size:1.8rem}.car small{color:var(--muted);font-weight:500;font-size:.78rem}
.car:has(input:checked){border-color:var(--orange);box-shadow:0 0 0 3px rgba(243,154,43,.25),0 0 18px rgba(243,154,43,.35);background:#1d1610}
.car:has(input:checked)::after{content:'✓';position:absolute;top:6px;inset-inline-end:10px;color:var(--orange);font-weight:800}
.car:has(input:focus-visible){outline:2px solid var(--orange);outline-offset:2px}.car:active{transform:scale(.98)}
footer{color:var(--muted);font-size:.78rem;text-align:center}
@media (max-width:420px){h1{font-size:2.1rem}.row{grid-template-columns:1fr}}</style></head><body><div class="wrap">${body}</div></body></html>`;

export function tripPage() {
  return shell('سفر بعدی وایکینگ', `
<header class="hero"><img class="logo" src="${TRIP_LOGO}" alt="وایکینگ آفرود"><div class="hero-in">
<span class="kicker">🏕️ کمپ جنگلی | فول‌برد</span><h1>${TRIP.title}</h1>
<p class="sub">دو روز طبیعت، ماجراجویی و رفاقت در دل جنگل‌های هیرکانی</p><span class="date">📅 ${TRIP.dates}</span></div></header>
<section><h2>توی این سفر</h2><ul class="list">
<li><span class="e">🏄</span><div>پدل‌سواری در یکی از زیباترین دریاچه‌های گیلان<small>با تمام تجهیزات، مربی و تیم مجرب</small></div></li>
<li><span class="e">🏕️</span><div>کمپ جنگلی فول‌برد</div></li><li><span class="e">🔥</span><div>شب‌نشینی دور آتیش و آتیش‌بازی</div></li>
<li><span class="e">🎯</span><div>بازی و برنامه‌های گروهی</div></li><li><span class="e">🎶</span><div>میز بارتندر بدون الکل</div></li>
<li><span class="e">🍽️</span><div>پذیرایی کامل<small>ناهار با مخلفات · شام · صبحانهٔ سرد و گرم سلف‌سرویس</small></div></li></ul></section>
<section><h2>هزینه</h2><div class="price">
<div class="p main"><span>🚙 خودروی شخصی</span><span class="v">۷ میلیون</span><span class="n">تومان · فول‌برد</span></div>
<div class="p"><span>🚐 خودروی گروه</span><span class="v">۳٫۵ میلیون</span><span class="n">تومان اضافه</span></div></div></section>
<section class="box warn"><h2 style="margin:0">قبل از رزرو بدون</h2>
<p class="muted" style="color:var(--fg)">۱. فرم رو پر کن تا رزروت ثبت بشه.<br>۲. تیم وایکینگ برای هماهنگی باهات تماس می‌گیره.<br>۳. ${NO_REFUND}</p></section>
<section id="reserve"><h2>رزرو</h2><form class="box" id="f" novalidate>
<div class="row"><label for="name">نام<input id="name" autocomplete="name" placeholder="مثلاً سارا" required></label>
<label for="phone">شمارهٔ تماس<input id="phone" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="0912…" required></label></div>
<div class="row"><label for="count">تعداد نفرات<input id="count" type="number" min="1" max="20" value="1" inputmode="numeric"></label>
</div>
<fieldset class="cars"><legend>رفت‌وآمد (اختیاری) — روی یکی بزن</legend>
${CARS.map((c, i) => `<label class="car"><input type="radio" name="car" value="${c}"><span class="ic">${i ? '🚐' : '🚙'}</span><b>${c}</b><small>${i ? '۳٫۵ میلیون اضافه' : 'با ماشین خودت'}</small></label>`).join('')}</fieldset>
<label for="note">توضیح (اختیاری)<textarea id="note" rows="2" placeholder="سؤال یا درخواست خاص"></textarea></label>
<input class="hp" id="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<label class="check" for="agree"><input id="agree" type="checkbox"> قبول دارم که بعد از پرداخت کنسلی و برگشت وجه نداره.</label>
<p class="msg err" id="err" hidden></p><button class="btn" id="go" type="submit">ثبت درخواست رزرو</button></form>
<div class="box" id="done" hidden><p class="msg ok">✅ رزروت ثبت شد. کد پیگیری: <b id="code"></b></p>
<p class="muted">تیم وایکینگ به‌زودی برای هماهنگی باهات تماس می‌گیره.</p></div>
<a class="btn ghost" href="https://ig.me/m/viking.offroad" target="_blank" rel="noopener" style="margin-top:12px">سؤال داری؟ دایرکت اینستاگرام وایکینگ</a></section>
<footer>🪪 با مجوز رسمی · @viking.offroad</footer>
<script>(()=>{const $=(i)=>document.getElementById(i);document.querySelectorAll('.car input').forEach((r)=>{r.closest('.car').addEventListener('pointerdown',()=>{r.dataset.was=r.checked});r.addEventListener('click',()=>{if(r.dataset.was==='true')r.checked=false;r.dataset.was=''})});$('f').addEventListener('submit',async(e)=>{e.preventDefault();$('err').hidden=true;$('go').disabled=true;
try{const r=await fetch('/api/booking',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('name').value,phone:$('phone').value,count:$('count').value,car:(document.querySelector('input[name=car]:checked')||{}).value||'',note:$('note').value,website:$('website').value,agree:$('agree').checked})});
const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'خطا در ثبت؛ دوباره امتحان کن.');
$('f').hidden=true;$('done').hidden=false;$('code').textContent=d.id;$('done').scrollIntoView({behavior:'smooth'});}
catch(x){$('err').textContent=x.message;$('err').hidden=false}finally{$('go').disabled=false}});})();</script>`);
}
