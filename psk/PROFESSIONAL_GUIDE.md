# Professional Guide — psk (ممیزی فنی)

> دور ممیزی: **2026-10-18** · دستور کار دائمی: `CLAUDE.md` · لاگ: `PROGRESS.md`
> هر دور ممیزی این فایل را بازنویسی می‌کند؛ تاریخچه در `PROGRESS.md` می‌ماند.

## خلاصه
| سنجه | قبل | بعد |
|---|---|---|
| `npm run check` | سبز | سبز (+ dev-server.mjs و routing-accuracy.mjs به چک اضافه شدند) |
| `npm test` | 53/53 | **57/57** |
| golden (108) | match | match |
| accuracy top-1 / top-3 / safety | 100% / 100% / 100% | بدون تغییر |
| زنده `psk-3000.vercel.app` | `/`, `/about`, `/puria/` → 200 ؛ `/api/*` بدون توکن → 401 | همان (ساخت بعدی هدرهای جدید را می‌آورد) |

## یافته‌ها
| # | شدت | یافته | شاهد | وضعیت |
|---|---|---|---|---|
| 1 | 🟠 | صفحه‌ها (شامل فیلد توکن در «موتور ۳۰۰۰») قابل قاب‌گرفتن در iframe بودند (clickjacking) | هدرهای زنده: فقط `nosniff` و HSTS؛ نه `X-Frame-Options` نه `frame-ancestors` | ✅ رفع: `vercel.json` ← `X-Frame-Options: DENY`، `CSP: frame-ancestors 'none'`، `Permissions-Policy`؛ تست `hardening.test.mjs` |
| 2 | 🟠 | پاسخ 200 غیر-JSON از provider (صفحهٔ HTML پراکسی) به‌عنوان `network` ثبت می‌شد | بازتولید با نسخهٔ قبل: `attempts = ['network', 200]` | ✅ رفع: `engine/providers.mjs` → `invalid-json`؛ AbortError همچنان timeout |
| 3 | 🟡 | بدنهٔ پاسخ خطای provider خوانده/آزاد نمی‌شد (اتصال pool تا GC گرفته می‌ماند) | کد: `continue` بدون مصرف body | ✅ رفع: `res.body?.cancel()`؛ تست |
| 4 | 🟡 | dev server با URL دارای `%` خراب کاملاً crash می‌کرد (unhandled rejection) | `curl /%E0%A4%A` روی نسخهٔ قبل → اتصال قطع، پروسه Exit 1 | ✅ رفع: try/catch → 400/500؛ پیشوند `pub+path.sep`؛ تست spawn |
| 5 | 🟡 | README آدرس مخزن قدیمی `salimipuria-blip/-` را داشت | `README.md:15` | ✅ رفع → `MegaSkillClaude` |
| 6 | 🟡 | سقف بدنهٔ `/api/tasks` بر حسب بایت (12000) با سقف ورودی بر حسب کاراکتر (4000) ناهمخوان است | 4000×`中` = 12000 بایت + JSON → 413 | باز (P2 در CLAUDE.md) |
| 7 | 🟡 | `/api/tasks` rate limit ندارد؛ فقط توکن جلوی سوءاستفاده از سهمیهٔ رایگان را می‌گیرد | کد `api/tasks.js` | باز (P1) |
| 8 | ℹ️ | حالت «پاسخ» بدون کلید مدل رایگان روی Vercel کار نمی‌کند (طراحی درست، fail با `NO_PROVIDER_CONFIGURED`) | README/health | کار مالک (P0) |

موارد بررسی‌شده و سالم: مقایسهٔ توکن constant-time، fail-closed روی Vercel، جلوگیری از path traversal/symlink در بارگذاری مهارت، تأیید SHA-256 هر ۳٬۰۰۰ بدنه (۰ rejected)، جداسازی متن مهارت به‌عنوان دادهٔ نامطمئن در prompt، telemetry فقط allowlist، UI فقط `textContent` برای دادهٔ API، deadline ۵۰ ثانیه زیر maxDuration ۶۰.

## تغییرات این دور
- `engine/providers.mjs` — آزادسازی body خطا؛ طبقه‌بندی `invalid-json`.
- `vercel.json` — سه هدر امنیتی.
- `scripts/dev-server.mjs` — مقاوم در برابر URL خراب و خطای handler؛ مقایسهٔ مسیر با جداکننده.
- `package.json` — `check` حالا `dev-server.mjs` و `routing-accuracy.mjs` را هم پوشش می‌دهد.
- `tests/hardening.test.mjs` — ۴ تست رگرسیون (هر کدام روی نسخهٔ قبل شکست می‌خورد یا رفتار غلط را نشان می‌داد).
- `README.md` — نام مخزن.

## کارایی
- مسیریابی: index معکوس + IDF، مقادیر نام‌محور یک بار در load؛ بنچمارک محلی پایدار (`npm run bench:routing`).
- هزینهٔ cold start: خواندن و hash ۳٬۰۰۰ فایل (`data/` ≈ 26MB) — اگر cold start کند شد، اولین هدف کش‌کردن نتیجهٔ تأیید در build است.

## پیشنهادها (به ترتیب ارزش)
1. کلید Groq رایگان (مالک) → فعال شدن حالت پاسخ.
2. rate limit به ازای توکن روی `/api/tasks`.
3. سقف بدنه بر حسب کاراکتر.
4. برچسب انسانی مجموعهٔ طلایی برای سنجش واقعی دقت.
