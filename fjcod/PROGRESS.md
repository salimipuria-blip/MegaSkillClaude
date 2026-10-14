# CHAM Store OS (FJCOD) — دفتر جریان پروژه

> توضیح زندهٔ پروژه؛ هر دور کاری همین‌جا اضافه می‌شود. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴**.

## ۱) پروژه در یک نگاه
- **پوشه:** `fjcod/` · **انتشار:** Vercel `cham-store-os` (هنوز از مخزن قدیمی `FJCod` — بند P0 نقشهٔ راه)
- **فناوری:** React 19 + TypeScript + Vite 7 · داده فعلاً فقط در مرورگر (بدون بک‌اند)
- **تست:** Vitest (۳۳ تست) + `scripts/e2e-smoke.mjs` (Playwright-Core)

## ۲) دستور دقیق این پروژه
```bash
node scripts/doctor.mjs fjcod        # typecheck + ۳۳ تست + بیلد (+ e2e اگر مرورگر باشد)
```
معادل دستی:
```bash
cd fjcod
npm ci
npm run typecheck        # tsc -b
npm test                 # vitest run → ۳۳ تست
npm run build            # tsc -b && vite build
npm run build && npm run e2e   # اسموک مرورگر (نیازمند Chromium)
```

## ۳) وضعیت تأییدشده (۲۰۲۶-۱۰-۱۴)
| بررسی | نتیجه |
|---|---|
| `npm run check` (typecheck + test + build) | ✅ **۳۳/۳۳** تست، باندل `index.js` ۳۷۴kB (gzip ۱۱۴kB) |
| `npm run e2e` با Chromium headless 153 | ✅ **۱۹/۱۹** مرحله؛ ورود نقش‌ها، صندوق/سبد، شیفت، بدون console error؛ دسکتاپ و viewport موبایل 390×844 |
| `npm run e2e` بدون مرورگر | ✅ خروج ۰ با پیام «skip»؛ `E2E_STRICT=1` خروج ۲ (قرارداد skip/fail-closed هم تأیید شد) |
| `npm audit --omit=dev` | ✅ صفر آسیب‌پذیری |

## ۴) دیباگ این دور (مشکل واقعی و اصلاح‌شده)
**`npm run e2e` روی هر ماشین تازه کرش می‌کرد.** `playwright-core` هیچ مرورگری همراه ندارد و
اسکریپت فقط دو مسیر را می‌شناخت (`CHROMIUM_PATH` و یک مسیر ثابت
`/opt/pw-browsers/chromium-1194/...` که به شمارهٔ نسخهٔ Playwright گره خورده). نتیجه: خروج غیرصفر با
بنر نامفهوم Playwright، و اگر خطا قبل از پایان رخ می‌داد **سرور preview روی پورت ۴۱۷۹ رها می‌شد**.

اصلاحات در `scripts/e2e-smoke.mjs`:
1. **جست‌وجوی هوشمند مرورگر:** `CHROMIUM_PATH` → `PLAYWRIGHT_BROWSERS_PATH` → کش Playwright
   (`~/.cache/ms-playwright/chromium*/…`) → `/opt/pw-browsers` (همهٔ نسخه‌ها، جدیدترین اول) →
   Chrome/Chromium سیستمی (`which`) → مسیرهای پیش‌فرض macOS/Windows.
2. **شکست با پیام قابل‌عمل:** اگر مرورگری نبود، سه راه‌حل دقیق چاپ می‌شود
   (`npx playwright install chromium` / `CHROMIUM_PATH=…` / `E2E_STRICT=1`) و خروج **۰ (skip)**؛
   با `E2E_STRICT=1` یا `--strict` خروج **۲**. دیگر هیچ بنر گنگی چاپ نمی‌شود.
3. **پاک‌سازی تضمینی:** `process.on('exit'|'SIGINT'|'SIGTERM')` سرور preview را می‌بندد و
   اگر ساخت سرور شکست بخورد، پیام دقیق («اول `npm run build`») با خروج ۱ داده می‌شود.
4. خط اول اسکریپت حالا رفتارش را مستند می‌کند (چرا skip، چطور فعال شود).

## ۵) کارهای باز / پیشنهاد بعدی
- [ ] **P0 نقشهٔ راه:** تصمیم دربارهٔ دیتابیس CHAM (شاخهٔ ادغام‌نشدهٔ `claude/cham-supabase-schema`
      در مخزن قدیمی) — الان داده فقط در حافظهٔ مرورگر هر دستگاه است؛ پاک شدن حافظه = از دست رفتن فروش.
- [ ] افزودن `e2e` به CI (یک job جدا با `npx playwright install --with-deps chromium`) تا مسیر
      «ورود هر نقش → فروش صندوق → صف مشاور» واقعاً در هر PR تست شود. اسکریپت حالا آمادهٔ این کار است.
- [ ] چهار تست سبد خرید/تخفیف برای مسیر «مدیر: مرجوعی + بازگشت به انبار» (اکنون فقط رفتار فعلی پوشش دارد).
- [ ] `npm ci` در CI با `--no-audit --no-fund` اجرا می‌شود؛ `npm audit` جداگانه در doctor پروژه هست.

## ۶) لاگ جریان (فقط اضافه می‌شود)
- **۲۰۲۶-۱۰-۱۴** — رفع کرش `npm run e2e` (شناسایی چندمسیرهٔ مرورگر + skip با پیام دقیق +
  حالت `E2E_STRICT`)، تضمین بسته‌شدن پورت preview، مستندسازی رفتار اسکریپت. تست‌ها ۳۳/۳۳ سبز.
- **۲۰۲۶-۱۰-۱۴ (گیت کامل monorepo)** — نصب تمیز `npm ci` و `node scripts/doctor.mjs fjcod` موفق؛ typecheck، **۳۳ تست Vitest** و build سبز. در همان مرحله Chromium system پیدا نشد و E2E skip شد.
- **۲۰۲۶-۱۰-۱۴ (مرورگر موقت)** — Chromium headless از بستهٔ npm در `/tmp` استخراج و با `LD_LIBRARY_PATH` لازم اجرا شد؛ پس از build، `CHROMIUM_PATH=/tmp/chromium npm run e2e` واقعاً اجرا شد: **۱۹/۱۹ مرحله سبز**، بدون خطای console، شامل دسکتاپ، viewport موبایل 390×844، نقش‌ها، فروش و بستن شیفت. مرورگر/iOS Safari واقعی نیست؛ فایل‌های screenshot فقط در `e2e-shots/` نادیده‌گرفته‌شده‌اند.
- **۲۰۲۶-۱۰-۱۴ (بازاجرای نهایی)** — `CHROMIUM_PATH=/tmp/chromium LD_LIBRARY_PATH=/tmp/al2023/lib npm run e2e`: **۱۹/۱۹** دوباره سبز؛ تأیید کرد که نتیجهٔ full doctor با binary صریح مرورگر نیز قابل تکرار است. Safari/iPhone واقعی همچنان خارج از این smoke است.
