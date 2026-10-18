# کنسول آیفون مگااسکیل — دفتر جریان پروژه

> دفتر زندهٔ `mobile/`؛ هر تغییر UI، index یا Service Worker باید در همین نوبت با فرمان/نتیجهٔ واقعی ثبت شود. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۸**. دستور کار ثابت: `CLAUDE.md`.

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
| `python3 mobile/build-index.py --check` | ✅ ۵٬۷۴۸ مهارت؛ fingerprint: `mega-mobile-v1-7bff70bc5794c7c0` |
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

- **۲۰۲۶-۱۰-۱۴ (دور سراسری — بودجه‌ی وزنِ ایندکس + smoke واقعیِ مرورگر)** —
  - **بودجه‌ی حافظه اضافه شد** (بندِ بازِ دور قبل، بدون حدس): `build-index.py` اکنون اندازه‌ی خام **و** gzip را در خروجی گزارش می‌کند و با بودجه‌ی ۳ MiB مقایسه می‌شوند. عددِ اندازه‌گیری‌شده‌ی امروز: **۲٬۲۳۷٬۳۰۸ بایت خام / ۴۰۸٬۴۹۷ بایت gzip** برای ۵٬۷۳۸ مهارت. عبور از بودجه یعنی زمانِ تقسیمِ دامنه‌ای (یا جریانی‌کردن)، نه رشدِ بی‌صدا روی گوشی. با عددِ واقعی، gzip همان یک‌پنجم است و تقسیمِ دامنه‌ای هنوز توجیه نشده.
  - `mobile/index.test.mjs` (۴ تست) روی **فایلِ تولیدیِ کامیت‌شده** اجرا می‌شود (نه روی سازنده): اعتبارِ payload و تطابقِ شمارنده با طولِ آرایه، کامل/یکتا/امن‌بودنِ هر مدخل (مسیرها از `isSafeSkillPath` عبور کنند)، رعایتِ بودجه و سقفِ ۵ تریگر برای هر مهارت، و زنده‌ماندنِ تریگرهای فارسی پس از ساخت و نبودِ مارک‌آپ در نام‌ها.
  - **Smoke واقعی با Chromium و پروفایلِ iPhone 13** (عرض ۳۹۰، DPR ۳، لمسی، UA آیفون): عرضِ سند **۳۹۰ CSS px و بدون سرریزِ افقی**، ۱۳ کارتِ پروژه، شمارنده **۵٬۷۳۸**، `dir=rtl`، ثبتِ Service Worker، و **بارگذاریِ مجدد در حالت آفلاین که ۵٬۷۳۸ مدخل را از cache برگرداند**؛ صفر خطای page/console.
  - گامِ `search-tests` در doctor به‌روز شد تا هر دو فایلِ تست را اجرا کند؛ CI هم به‌روز شد.
  - **محدودیت:** همچنان Safari/iOS فیزیکی نیست — نصب به Home Screen، حالتِ هواپیمای واقعی، به‌روزرسانیِ واقعیِ Service Worker در Safari و اندازه‌گیریِ حافظه روی دستگاه، جداگانه باید آزمایش شوند.

- **۲۰۲۶-۱۰-۱۸ (ممیزی جست‌وجو + دستور کار پروژه)** —
  - `mobile/CLAUDE.md` ساخته شد: مشخصات yaml، نقشهٔ کد، قرارداد جست‌وجو، قواعد MUST/NEVER، جدول اشکال‌زدایی، صف P0–P2 و پروتکل به‌روزرسانی.
  - **اصلاح‌ها در `search.mjs` (هرکدام با تست regression):** query بی‌توکن مثل «برای» دیگر کل ۵٬۷۴۸ مهارت را برنمی‌گرداند؛ حذف حرکات/تطویل («کُد»، «کـد» ⇒ code)؛ ة/ۀ/ە→ه، أ/إ/ٱ→ا، ارقام فارسی→ASCII («۳d» ۰ ⇒ ۱۳)؛ `Object.hasOwn` برای alias (باگ `constructor`)؛ رتبه‌بندی اول بر اساس پوشش کلمه‌ها («طراحی لوگو» ⇒ مهارت‌های logo در صدر) + alias لوگو/برند/سئو/ایمیل/پادکست؛ ایندکس دوشکلی ZWNJ («شبکه های» = «شبکه‌های») و stop wordهای ها/های/ترین؛ prefix برای آخرین کلمهٔ حین تایپ («reac» ۰ ⇒ ۷۴).
  - **`app.js`/`index.html`:** تایمر toast، بستن شیت با Esc، `role="dialog"`، شمارندهٔ پلاگین ۵٬۹۸۶ ⇒ ۶٬۰۲۹ (تست از `triggers.json`)، متن کارت چام (نسخهٔ نهایی در POINT).
  - نتیجه: `build-index.py --check` ✅ (`mega-mobile-v1-f0a03afbdf7bc464`)، Node **۱۷/۱۷** (قبلاً ۱۰/۱۰)، Python ۸/۸، `doctor mobile` ✅، Playwright iPhone 13: عرض ۳۹۰، صفر خطا. جست‌وجو ۵٫۶–۶٫۷ms.
  - **باز:** هیچ هاست HTTPS برای `mobile/` نیست (تصمیم مالک)؛ iPhone واقعی تست نشده.

## Professional guide
See `PROFESSIONAL_GUIDE.md` in this folder for performance improvements, debugging playbook, and next steps. Update it whenever behavior changes.
