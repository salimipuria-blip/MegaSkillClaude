# کنسول آیفون مگااسکیل — دفتر جریان پروژه

> دفتر زندهٔ `mobile/`؛ هر تغییر UI، index یا Service Worker باید در همین نوبت با فرمان/نتیجهٔ واقعی ثبت شود. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴**.

## ۱) پروژه در یک نگاه
- **نوع:** PWA ایستا و فارسی برای VS Code وب، جست‌وجوی آفلاین مهارت‌ها و کپی فرمان تست هر پروژه.
- **منبع canonical:** `.claude/skills/mega-skills-router/references/triggers.json` → `mobile/skills-index.json` و نسخهٔ cache در `mobile/sw.js` خروجی تولیدی‌اند.
- **پشته:** HTML/CSS + ES modules (`app.js`, `search.mjs`) + Service Worker؛ backend ندارد.
- **حد محصول:** موبایل فرمان اجرا نمی‌کند و VS Code وب روی iPhone terminal نیست.

## ۲) دستور دقیق این پروژه
```bash
python3 mobile/build-index.py           # ایندکس + fingerprint PWA
python3 mobile/build-index.py --check   # بررسی read-only هر دو خروجی
node --check mobile/app.js
node --check mobile/sw.js
node --check mobile/search.mjs
node --test mobile/search.test.mjs
python3 -m unittest discover -s tests -p test_mobile_console.py -v
```

## ۳) وضعیت تأییدشده (۲۰۲۶-۱۰-۱۴)
| بررسی | نتیجه |
|---|---|
| `python3 mobile/build-index.py --check` | ✅ ۵٬۷۳۸ مهارت؛ fingerprint: `mega-mobile-v1-371dd38ad385ac69` |
| syntax سه فایل JavaScript | ✅ `app.js`, `sw.js`, `search.mjs` |
| `node --test mobile/search.test.mjs` | ✅ **۶/۶**: alias فارسی/فینگلیش، رتبه‌بندی، فیلتر، escaping، مسیر امن و payload schema |
| `test_mobile_console.py` | ✅ **۸/۸**؛ شامل simulation که تغییر فایل precache باید cache fingerprint را عوض کند و هر doctor project در کنسول کارت دارد |
| manifest، service-worker scope و repo skill | ✅ ساختار/PWA و trigger مسیر آنلاین بررسی شدند |
| Chromium headless با پروفایل iPhone 13 | ✅ عرض CSS برابر ۳۹۰px و بدون overflow افقی؛ ۱۳ کارت پروژه، ۵٬۷۳۸ مهارت، جست‌وجوی `logo` با ۹ نتیجه، باز/بسته‌شدن جزئیات، کنترل Service Worker و بارگذاری shell/index از cache در حالت offline؛ بدون page/console error |
| Safari/iPhone واقعی | ⚠️ هنوز تأیید نشده؛ emulation جای نصب به Home Screen، حالت هواپیما و update واقعی Safari را نمی‌گیرد |

## ۴) دیباگ حرفه‌ای و تغییرات اعمال‌شده

**الف) به‌روزرسانی PWA و تداخل cache — اصلاح شد.** پیش‌تر cache key ثابت `mega-mobile-v1` بود؛ تغییر index/app لزوماً Service Worker را update نمی‌کرد. پاک‌سازی قبلی هم همهٔ Cache Storage همان origin را حذف می‌کرد و می‌توانست cache اپ دیگری را پاک کند.
- `build-index.py` اکنون اثرانگشت محتوایی از ایندکس، تمام فایل‌های precache و بدنهٔ Service Worker می‌سازد؛ `--check` هر drift را می‌گیرد.
- Cache name نسخه‌دار شد؛ activate فقط کلیدهای `mega-mobile-*` قدیمی را پاک می‌کند.
- Fetch فقط GETهای هم‌origin و داخل scope را می‌گیرد؛ fallback به `index.html` فقط برای navigation است، نه تصویر/اسکریپت.

**ب) دادهٔ index به‌عنوان HTML — hardening شد.** name/trigger/domain/path از فایل تولیدی می‌آمدند و مستقیم در `innerHTML` قرار می‌گرفتند.
- renderهای dynamic با `escapeHtml` امن شدند، payload با schema/count/فیلدها بررسی می‌شود و مسیر فایل فقط از شاخه‌های canonical پذیرفته می‌شود.
- `search.mjs` pure و قابل‌تست شد؛ توکن نام/تریگر یک‌بار ساخته می‌شود نه به‌ازای هر keypress.
- باگ ظریف alias هم اصلاح شد: ZWNJ در «برنامه‌نویسی» باعث می‌شد alias phrase پیش از lookup شکسته شود؛ نرمال‌سازی عبارت اکنون آن را به `code` تبدیل می‌کند.

**ج) شمارندهٔ stale — اصلاح شد.** `index.html` عدد ۵٬۷۳۶ و README عدد ۵٬۷۳۷ نشان می‌دادند؛ منبع تولیدی ۵٬۷۳۸ مورد دارد. HTML، manifest و README اکنون روی **۵٬۷۳۸** همگام‌اند.

## ۵) کارهای باز / پیشنهاد بعدی
- [ ] آزمون واقعی Safari: نصب به Home Screen → جست‌وجوی آفلاین → تغییر index → reconnect → دریافت نسخهٔ جدید.
- [ ] اندازه‌گیری latency و حافظه روی iPhone واقعی؛ JSON فعلی حدود **۲٫۲MB خام** است. domain-split یا gzip فقط با عدد واقعی و حفظ offline fallback.
- [ ] آزمون UI مرورگری برای focus، کپی clipboard، tab navigation و VoiceOver؛ تست‌های فعلی core/static هستند.

## ۶) لاگ جریان (افزایشی)
- **۲۰۲۶-۱۰-۱۴** — رفع cache ثابت و پاک‌سازی global cache؛ fingerprint دقیق از assets/worker؛ source cache validator؛ افزودن pure search module، ۶ تست Node و regression برای stale cache؛ escape/schema/path hardening؛ شمارندهٔ ۵٬၇۳۸ را با canonical index همگام کرد. Python 8/8, Node 6/6, syntax/build-index check سبز؛ کارت‌های همهٔ پروژه‌ها در کنسول‌اند؛ iPhone واقعی هنوز تست نشده.
- **۲۰۲۶-۱۰-۱۴ (مرورگر موبایل)** — smoke واقعی با Chromium headless و profile/device emulation از iPhone 13: عرض ۳۹۰ CSS px بدون overflow افقی، ۱۳ کارت، index کامل ۵٬۷۳۸تایی، ۹ نتیجه برای `logo`، باز/بسته‌شدن sheet و Service Worker کنترل‌شده؛ با offline reload، shell و JSON از cache پاسخ دادند؛ ۰ خطای page/console. این تأیید Safari/iOS فیزیکی نیست.
