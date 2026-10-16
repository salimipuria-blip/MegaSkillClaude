# Lithos — دفتر جریان پروژه (Live Intelligence)

> توضیح زندهٔ پروژه؛ هر دور کاری همین‌جا اضافه می‌شود. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴**.

## ۱) پروژه در یک نگاه
- **پوشه:** `lithos/` · **انتشار:** Vercel (`lithos-live-intelligence-vercel-fixed`، Root = `lithos`)
- **فرانت:** یک `index.html` (Vite 6.4، Supabase JS از CDN) · **بک:** تابع سرورلس `api/buffer-sync.js`
- **داده:** Supabase `aupkeramhsufnmhkbihl` (جدول‌های `lithos_insight_snapshots`,
  `lithos_kpi_snapshots`, `lithos_leads`, `lithos_sync_state`)
- **منشأ:** مخزن از آخرین استقرار سالم (`dpl_6GbXF4L3H9tMX8uApfk4ERj8ppiK`) بازسازی شده؛
  دنبالهٔ `api/buffer-sync.js` بازسازی‌شده است و کوئری Buffer هنوز «تأییدنشده» علامت خورده.

## ۲) دستور دقیق این پروژه
```bash
node scripts/doctor.mjs lithos       # چک سینتکس + تست + بیلد
```
معادل دستی:
```bash
cd lithos
npm install          # یا: npm install --prefix lithos از ریشه
node --check api/buffer-sync.js
npm test             # ۴ تست
npm run build        # vite build → dist/
```

## ۳) وضعیت تأییدشده (۲۰۲۶-۱۰-۱۴)
| بررسی | نتیجه |
|---|---|
| `node --check api/buffer-sync.js` | ✅ |
| `npm test` | ✅ **۴/۴** (قبلاً ۳؛ یک تست نگهبان اضافه شد) |
| `npm run build` | ✅ `dist/index.html` ۹٫۲۲kB (gzip ۳٫۷۴kB) |
| محیط | `BUFFER_API_KEY` تنها راز پروژه است؛ کلید Supabase در کلاینت **publishable** است (RLS محافظ داده است) |

## ۴) دیباگ این دور (مشکل واقعی و اصلاح‌شده)
**باگ درست‌بودن داده:** اگر پاسخ Buffer خالی بیاید (توکن با اسکوپ اشتباه، یا کوئریِ هنوز
تأییدنشده)، هندلر قبلی `channel={}` و `metrics=[]` را می‌گرفت و یک **اسنپ‌شات صفر** را
ثبت می‌کرد و منبع را `connected` علامت می‌زد؛ یعنی داشبورد «صفر واقعی» را از «دادهٔ نیامده»
تفکیک نمی‌کرد — برای سامانه‌ای که شعارش «بدون آمار ساختگی» است، خطای جدی.
- اکنون: اگر `channel.id` یا `metrics` نباشد → پاسخ `502` با
  `code: BUFFER_SHAPE_UNVERIFIED`، ثبت وضعیت خطا با `lithos_set_buffer_sync_state`
  و **هیچ نوشتنی** در `lithos_ingest_buffer_snapshot` انجام نمی‌شود.
- تست نگهبان اضافه شد: «پاسخ خالی Buffer باید رد شود، نه اینکه اسنپ‌شات صفر بنویسد»
  (تأیید می‌کند RPC کوئری‌نویسی هرگز صدا زده نمی‌شود).

**کمبودهای پیکربندی که رفع شد:**
- `lithos/.env.example` اضافه شد (`BUFFER_API_KEY=`) تا مثل بقیهٔ پروژه‌ها یک مرجع امن برای
  متغیر محیطی وجود داشته باشد و راز واقعی وارد Git نشود.
- `lithos/vercel.json` کامل شد: `functions["api/buffer-sync.js"].maxDuration = 30`
  و هدرهای امنیتی (`nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`)
  هم‌سبک با `psk/vercel.json` و `viking-team/vercel.json`.

## ۵) کارهای باز / پیشنهاد بعدی
- [ ] **اولویت ۱ — تأیید کوئری Buffer:** خط `TODO(verify)` در `api/buffer-sync.js` باقی است.
      برای تأیید: یک بار با توکن واقعی صدا زدن و بررسی شکل پاسخ
      (`query { account { channels { id name metrics { type value } } } }` و کلیدهای متریک).
      تا آن زمان رفتار درست «رد صریح» است، نه ثبت عدد ساختگی.
- [ ] `followers_supported` و بقیهٔ کلیدهای متریک را با پاسخ واقعی Buffer تطبیق دادن
      (نام‌ها ممکن است `followers`/`reach`/`impressions`/`saves`/`shares`/`comments` نباشند).
- [ ] در `index.html` خطاهای `refresh()` بی‌صدا رد می‌شوند (`const [i,k,l,s]=await Promise.all(...)`
      بدون بررسی `error`)؛ پیشنهاد: یک `toast` کوتاه برای خطای RLS/شبکه و نمایش «آخرین دادهٔ موفق».
- [ ] تست RLS: مطمئن شدن اینکه کاربر بدون نشست هیچ ردیفی نمی‌بیند (اکنون فقط در سطح کلاینت قطع می‌شود).

## ۶) لاگ جریان (فقط اضافه می‌شود)
- **۲۰۲۶-۱۰-۱۴** — رفع ثبت اسنپ‌شات صفر (نگهبان `BUFFER_SHAPE_UNVERIFIED`)،
  افزودن `.env.example`، تکمیل `vercel.json` (maxDuration + هدرهای امنیتی)، تست‌ها ۳→۴.
- **۲۰۲۶-۱۰-۱۴ (گیت کامل monorepo)** — نصب تمیز `npm ci` موفق؛ `node scripts/doctor.mjs lithos`: syntax، **۴ تست** و build سبز. صحت قرارداد Buffer در برابر API زنده و RLS واقعی همچنان تأییدنشده است.

- **۲۰۲۶-۱۰-۱۴ (دور سراسری — تفکیک «صفر واقعی» از «داده نیامد» در UI)** — بند بازِ دور قبل اجرا شد: `refresh()` چهار کوئری را با `Promise.all` می‌گرفت و بدون بررسیِ `error` رندر می‌کرد، برای همین یک خطای RLS یا شبکه، داشبوردی از «—» و «۰» می‌ساخت؛ یعنی همان «آمار ساختگی» که شعارِ پروژه آن را رد می‌کند.
  - `lithos/index.html` بازنویسی شد: هر چهار پاسخ با نام بررسی می‌شوند (`insights`, `KPI`, `leads`, `sources`)؛ خطا با پیامِ دقیقِ هر منبع در toast نشان داده می‌شود و خطِ تازگیِ داده (`#asOf`) به حالت «آخرین دادهٔ موفق» + کلاس قرمز می‌رود. پرتابِ شبکه (rejection، نه error-object) هم در `try/catch` گرفته می‌شود. مسیرِ موفقیت زمانِ به‌روزرسانی را نشان می‌دهد.
  - `tests/dashboard.test.mjs` (۵ تست) اضافه شد: بررسیِ خطا برای هر چهار منبع، نگه‌داشتنِ زمانِ آخرین دادهٔ موفق، گرفتنِ rejection، نبودِ کلید سرویس در کلاینت (فقط `sb_publishable_`) و نبودِ `BUFFER_API_KEY` در سمت کلاینت. شمار تست‌ها **۴ → ۹**.
  - **دستور تأیید:** `node scripts/doctor.mjs lithos` → سینتکسِ تابع سرورلس، **۹ تست** و بیلد Vite (`dist/index.html` ۱۰٫۰۷kB، gzip ۴٫۰۹kB) سبز. سینتکسِ اسکریپتِ inline هم جداگانه با `node --check` روی بخشِ استخراج‌شده تأیید شد.
  - **محدودیت:** رفتارِ UI در مرورگر واقعی و RLSِ زنده تست نشده؛ قراردادِ کوئریِ Buffer همچنان `TODO(verify)` است و تا آن زمان پاسخِ خالی را با `502 BUFFER_SHAPE_UNVERIFIED` صریحاً رد می‌کند.

## Professional guide
See `PROFESSIONAL_GUIDE.md` in this folder for performance improvements, debugging playbook, and next steps. Update it whenever behavior changes.

- **۲۰۲۶-۱۰-۱۶ (Vercel ignoreCommand)** — `vercel.json` پروژه `ignoreCommand: git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" HEAD -- .` گرفت: اگر این پوشه از آخرین استقرار موفق تغییر نکرده باشد Vercel ساخت را رد می‌کند (سهمیهٔ ۱۰۰ دیپلوی روزانه دیگر با PRهای پروژه‌های دیگر پر نمی‌شود)؛ اگر git نتواند مقایسه کند (sha ناشناخته/clone کم‌عمق) exit غیرصفر می‌دهد و ساخت طبق معمول انجام می‌شود. تأیید: اجرای محلی دستور (بدون تغییر → 0، sha ناشناخته → 128). استقرار واقعی Vercel در این محیط بررسی نشد.
