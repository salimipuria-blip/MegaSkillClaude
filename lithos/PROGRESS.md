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
