# Professional Guide — bison-brand-book (ممیزی فنی)

> ممیزی دور 2026-10-18. دستور کار دائمی در `CLAUDE.md`؛ لاگ در `PROGRESS.md`. هر دور این فایل بازنویسی می‌شود.

## روش
- خواندن کامل `index.html`، `src/main.js`، `src/styles.css`، تست‌ها، `vercel.json`، CI و `scripts/doctor.mjs`.
- محاسبهٔ کنتراست WCAG برای همهٔ جفت‌های پالت؛ اجرای سایت بیلدشده در Chromium (Playwright): کنسول، اسکرول، لنگرها، دیالوگ، reduced-motion.
- باز کردن ZIP دانلودی از `file://` در Chromium؛ بررسی لینک‌های بیرونی با `curl`.
- هر رفع با تست رگرسیون؛ هر تست با جهش (برگرداندن باگ در کپی موقت) تأیید شد که قرمز می‌شود.

## یافته‌ها و رفع‌ها
| # | شدت | یافته (ورودی/مسیر شکست) | رفع | تست |
|---|---|---|---|---|
| 1 | 🔴 | `lenis.tick()` در Lenis 1.3 وجود ندارد → `s.tick is not a function` در **هر فریم** (۱۰۰+ خطا در ۳ ثانیه)؛ اسکرول نرم هرگز اجرا نمی‌شد | `lenis.raf(time * 1000)` | a11y: `lenis.raf` |
| 2 | 🔴 | ZIP دانلودی از `file://`: CSS و JS با CORS (origin null) بلاک، مسیرها `/assets/` → صفحهٔ بی‌استایل و بی‌JS؛ ZIP نسخهٔ قدیمی (باگ ۱ و href نسبی) را هم داشت | `scripts/build-zip.mjs` + `npm run zip`؛ ZIP بازسازی شد | zip.test (۴) |
| 3 | 🔴 | دکمهٔ «Download ZIP» پایین صفحه به raw-link ریپوی قدیمی خصوصی → HTTP 403 برای همه | `/BISON-Brand-Book.zip` + `download` | a11y: لینک بیرونی |
| 4 | 🟠 | کیکرهای طلایی روی bone (`#type` `#voice` `#rules` `.chapters`) = 1.84:1 | توکن `--ember-ink` (#7c4a06، 5.61:1) | a11y: `finalColor` |
| 5 | 🟠 | شمارهٔ فصل‌ها ember روی bone = 3.73:1؛ override اول در آبشار **می‌باخت** (مرورگر کشفش کرد، regex ساده نه) | قاعدهٔ اصلی `.chapter-list .num` → `--ember-ink` | a11y: آبشار واقعی |
| 6 | 🟠 | `role="tablist"/"tab"` بدون tabpanel و کلید جهت (ARIA نادرست) | `role="group"` + `aria-pressed` | a11y |
| 7 | 🟠 | دیالوگ دمو: Tab به صفحهٔ پشت می‌رفت؛ فوکوس بعد از بستن گم می‌شد | `inert` روی nav/main/progress/footer + برگرداندن فوکوس به opener | a11y + Chromium |
| 8 | 🟡 | `aria-label` روی `div` بدون role (نادیده گرفته می‌شود) | `role="group"` | a11y |
| 9 | 🟡 | همهٔ ۲۴ تصویر eager → رویداد `load` (که لودر و موشن منتظرش‌اند) منتظر ~۳٫۰۴MB | lazy برای زیر fold؛ hero `fetchpriority="high"` → eager ۱٫۴۶MB (−۵۲٪) | a11y: lazy/eager |
| 10 | 🟡 | فونت با `@import` داخل CSS (زنجیرهٔ HTML→CSS→CSS فونت) | `<link>` + `preconnect` در head | a11y: فونت |
| 11 | 🟡 | README به Pages (404) و raw-link (403) | README به‌روز شد | — |

## نتایج اندازه‌گیری
- تست: قبل ۸/۸ → بعد **۲۴/۲۴** (`npm test`).
- بیلد: `index.html` 24.89kB (gzip 5.79)، CSS 22.15kB (5.25)، JS 140.01kB (52.71). `npm audit --omit=dev`: 0.
- Chromium (سایت بیلدشده): ۰ خطای کنسول، اسکرول Lenis کار می‌کند (scrollY 6000، progress 45.8٪)، لنگر `#rules` در top=8، reduced-motion لودر را فوراً می‌بندد.
- ZIP جدید از `file://`: پس‌زمینه `rgb(11,10,9)`، لودر بسته، ۰ خطا (قبل: ۴ خطای CORS/404).

## ریسک‌های باز (مستند، رفع‌نشده)
- PNG مارک‌ها ~۶۰۰KB هرکدام؛ بدون `width/height` (رفع مستقیم بدون بازبینی CSS ممکن است ارتفاع را بشکند).
- وابستگی به Google Fonts (ایران/آفلاین → fallback سیستمی).
- لودر فقط با JS محو می‌شود.
- استقرار زندهٔ Vercel از این محیط تأیید نشد.

## گام بعدی پیشنهادی
به ترتیب صف کار `CLAUDE.md`: تأیید استقرار → بهینه‌سازی تصاویر → ابعاد تصاویر → فونت محلی.
