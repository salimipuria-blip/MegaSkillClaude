# 11 — کنسول آیفون مگااسکیل (`mobile/`)

## مأموریت و مرزها
PWA ایستا و فارسی برای بازکردن ریپوی MegaSkillClaude در VS Code وب، جست‌وجوی آفلاین مهارت‌ها و کپی دستورهای آزمون پروژه‌ها. این رابط ترمینال ندارد، دستور را اجرا نمی‌کند و دادهٔ کاربر را به سرور نمی‌فرستد. منبع canonical مهارت‌ها خارج از `mobile/` است.

## معماری و منبع حقیقت
- `mobile/index.html`, `styles.css`, `app.js`: رابط و کارت‌های پروژه.
- `mobile/search.mjs`: normalization، aliasهای فارسی/فینگلیش، رتبه‌بندی، اعتبارسنجی payload و HTML escaping.
- `mobile/skills-index.json`: خروجی تولیدی از `.claude/skills/mega-skills-router/references/triggers.json`; دستی ویرایش نشود.
- `mobile/sw.js`: shell آفلاین؛ cache key با اثرانگشت همهٔ assetهای پیش‌ذخیره و کد worker ساخته می‌شود.
- نسخهٔ فعلی ایندکس: **۵٬۷۳۸ مهارت قابل‌مسیریابی** (عدد رابط/manifest باید با builder همگام بماند).

## دستورهای اجرا و بررسی
```bash
python3 mobile/build-index.py           # تولید index و fingerprint cache
python3 mobile/build-index.py --check   # گیت فقط‌خواندنی برای هر دو فایل تولیدی
node --check mobile/app.js
node --check mobile/sw.js
node --test mobile/search.test.mjs
python3 -m unittest discover -s tests -p test_mobile_console.py -v
python3 -m http.server 8000             # از ریشه؛ http://localhost:8000/mobile/
```

توسعهٔ `app.js`, `search.mjs`, `styles.css`, `index.html`, manifest یا آیکون‌ها را با `python3 mobile/build-index.py` تمام کن؛ builder fingerprint کش را هم عوض می‌کند. سپس `--check` و تست‌ها را اجرا کن. از `http://localhost` یا HTTPS برای آزمایش Service Worker استفاده کن؛ `file://`، PWA واقعی محسوب نمی‌شود.

## پروتکل دیباگ و راه‌حل‌های شناخته‌شده
- **مهارت تازه در گوشی دیده نمی‌شود:** ابتدا `build-index.py --check`؛ اگر stale بود builder را اجرا کن. اگر PWA مدت طولانی آفلاین بوده، پس از اتصال دوباره reload کن تا service worker نسخهٔ تازه را نصب کند.
- **کش نسخهٔ قدیمی:** مطمئن شو تغییر فایل در `PRECACHE_ASSETS`/fingerprint ثبت شده، `sw.js` از builder تازه شده و هدر انتشار `sw.js` مانع بررسی update نیست. کش‌های unrelated origin نباید پاک شوند.
- **مهارت به شکل HTML خراب دیده می‌شود:** payload را با schema validator بررسی و هر فیلد index را با `escapeHtml` render کن؛ دادهٔ trigger/name/path را به‌عنوان HTML امن فرض نکن.
- **رتبه‌بندی کند است:** tokenizer باید هنگام ساخت ایندکس اجرا شود، نه برای تک‌تک triggerها در هر keypress؛ تغییر scorer را با `search.test.mjs` و queryهای فارسی/فینگلیش پوشش بده.
- **مسیر VS Code نامعتبر:** فقط مسیر canonical `psk/data/skills`, `library/skills` و `library/github-skills` پذیرفته می‌شود؛ traversal یا URL خارجی را باز نکن.
- **نصب PWA شکست می‌خورد:** بررسی HTTPS/localhost، `manifest.webmanifest`, آیکون‌های ۱۹۲/۵۱۲ و scope نسبی `/mobile/` را جدا از جست‌وجو انجام بده.

## گسترش اولویت‌بندی‌شده
- **P1:** آزمون واقعی Safari/iOS: نصب به Home Screen، جست‌وجو در حالت پرواز، اتصال مجدد و دریافت نسخهٔ تازه.
- **P1:** اندازه‌گیری زمان بارگذاری و مصرف حافظه روی آیفون واقعی؛ ایندکس JSON حدود ۲٫۲MB خام است. فقط با اندازه‌گیری، فشرده‌سازی هاست یا lazy-load دامنه‌ای اضافه شود.
- **P2:** تست مرورگری محدود (مثلاً Playwright) برای keyboard/focus، tab navigation، copy action و reduced-motion؛ PWA باید همچنان بدون backend بماند.

## Definition of Done
payload و cache fingerprint تازه؛ تست‌های Node/Python و syntax سبز؛ محتوای پویا escape شده؛ سرویس‌ورکر فقط cacheهای `mega-mobile-*` را حذف می‌کند؛ نصب/آفلاین/به‌روزرسانی واقعی در Safari جداگانه ثبت می‌شود؛ `mobile/PROGRESS.md` به‌روز است.
