# 00 — مونوریپو و CI مشترک

## مأموریت
یک منبع حقیقت برای همهٔ پروژه‌ها: کد، تست، CI و انتشار از همین مخزن. هر پروژه پوشهٔ مستقل دارد و CI واحد (`.github/workflows/ci.yml`) روی هر PR همهٔ jobها را اجرا می‌کند.

## وضعیت فعلی (شواهد)
- `.github/workflows/ci.yml` همهٔ jobهای monorepo را روی PR اجرا می‌کند: repo-health (شامل mobile/brand assets)، PSK، Lithos، Router، CHAM، BISON، Viking Team، Viking Motion، Orchestrator و Hermes؛ Hermes یک workflow path-filtered جدا هم دارد.
- **بدهی انتشار:** `fjcod/`، `viking-team/` و `bison-brand-book/` هنوز از مخزن/اتصال‌های قدیمی منتشر می‌شوند؛ تغییر اینجا الزاماً روی سایت زنده نمی‌رود.
- تعداد تست‌ها/skipها بین پروژه‌ها متفاوت و در `PROGRESS.md` ثبت می‌شود؛ اجرای دقیق همهٔ گیت‌ها: `node scripts/doctor.mjs`. جمع قدیمی `docs/REPO_HARDENING.md` تاریخچه است، نه شمارندهٔ امروز.
- `doctor` آرگومان‌های quoted را بدون shell parse می‌کند؛ `tests/doctor.test.mjs` مانع false-green از unittest با صفر تست کشف‌شده می‌شود.

## دستورهای پایه
```bash
bash scripts/repo_health_check.sh            # بررسی سبک، بدون نصب وابستگی
python3 scripts/sync_skill_library.py --check
python3 -m unittest discover -s tests -v     # تست‌های ریشه (router/sync/statusline/normalization)
```

## پروتکل دیباگ CI
1. اول job قرمز را از بقیه جدا کن؛ CI قرمز کلی را با حدس «احتمالاً flaky است» رد نکن.
2. لاگ همان job را تا **اولین** خطای واقعی بخوان (نه آخرین خط خروجی).
3. همان دستور job را عیناً لوکال اجرا کن؛ اگر لوکال سبز و CI قرمز بود: تفاوت Node/Python version، نبود secret (مثلاً `ENGINE_TOKEN` روی push به `main`) یا path-filter را بررسی کن.
4. برای رگرسیون‌های مخزن: `git bisect run <test-command>`؛ حدس نزن، بایسکت کن.
5. اصلاح زیرساختی بدون تست رگرسیون در `tests/test_repo_normalization.py` قبول نیست.

## راه‌حل و گسترش (اولویت‌بندی)
- **P0:** اتصال Vercel پروژه‌های `cham-store-os` و Viking و Vercel/Pages بایسون به همین مخزن با Root Directory = نام پوشه؛ سپس Archive (نه حذف) مخزن‌های قدیمی.
- **P1:** Supabase مشترک با اسکیمای جدا (`psk_*`, `cham_*`, `viking_*`) و RLS برای هر پروژه؛ بازنشستگی توابع تکراری Orchestrator.
- **P1:** فایل `tokens.css` مشترک طراحی برای هر برند + فونت فارسی آزاد (Vazirmatn/Plex Sans Arabic, OFL).
- **P2:** پایش سهمیهٔ رایگان سرویس‌ها و هشدار قبل از اتمام؛ توقف امن (fail-closed) به‌جای مسیر پولی.

## Definition of Done
همهٔ jobهای مرتبط CI سبز، `repo_health_check.sh` بدون خطا، هیچ secret در diff (`grep -R -E 'service_role|sb_secret_|sk-'` روی فایل‌های تغییریافته)، مستند وضعیت در `ROADMAP.md` به‌روز.

## پرونده‌های واقعی و درس‌های این دور (۲۰۲۶-۱۰-۱۴)

**۱. گامِ doctor که به‌خاطر نبودِ ابزار «fail» می‌شد، با شکستِ واقعی اشتباه گرفته می‌شد.** گامِ `pytest` پروژهٔ orchestrator در هر محیط بدون pytest با `ModuleNotFoundError` قرمز می‌شد، در حالی که `deno-gateway` در نبودِ Deno به‌درستی skip بود. این ناسازگاری یعنی «وضعیتِ مخزن» با «نبود ابزارِ محلی» قاطی می‌شد.
- رفع: گزینهٔ `needsModule` در `scripts/doctor.mjs`؛ نبودِ ماژولِ پایتون = **skip همراه با دستورِ نصب دقیق**. قانون سخت: skip هرگز pass نیست و در خروجیِ نهایی جداگانه فهرست می‌شود.
- درس: ابزارِ مفقود (pytest/deno/مرورگر/نشستِ استیجینگ) را همیشه در یک ردهٔ وضعیتیِ جدا نگه دار.

**۲. تغییرِ فهرستِ jobهای CI باید در نگهبان هم اعمال شود (و شد).** اضافه‌کردنِ job جدید `fjcod-e2e` بلافاصله توسط `tests/test_repo_normalization.py` با پیامِ «'fjcod-e2e' در مجموعه نیست» گرفته شد. نگهبان به‌روز شد و اکنون محتوای job را هم می‌سنجد (`E2E_STRICT: "1"` و نصبِ مرورگر).
- درس: وقتی CI را تغییر می‌دهی، نگهبانِ CI را در **همان کامیت** به‌روز کن؛ این خطای قرمز، نشانهٔ سلامت است نه مزاحمت.

**۳. الگوی تکرارشوندهٔ «تستِ بی‌ارزش».** تست‌هایی که فقط «رشته‌ای در فایل هست» را می‌سنجیدند (مثل `assertIn("enable row level security", SQL)`) از کنارِ جدولِ بدون RLS رد می‌شدند. این دور همهٔ آن‌ها به تستِ **ساختاری** ارتقا یافتند (استخراجِ نام جدول با regex و تطابقِ یک‌به‌یک با دستورهای RLS).
- درسِ قابل‌اجرا: بعد از نوشتن هر نگهبان، با یک **جهش (mutation)** امتحانش کن — باگ را عمداً برگردان و ببین تست قرمز می‌شود یا نه. نگهبانی که با جهش قرمز نشود، مستنداتِ پرسر و صداست.

**۴. ابزارهای موقت در `/tmp` مجاز، وابستگیِ موقت در مخزن ممنوع.** Chromium این دور از بستهٔ npm (`@sparticuz/chromium`) استخراج و با `LD_LIBRARY_PATH` اجرا شد تا E2E، رندر قالب‌ها، smokeِ PWA و رندرِ Motion **واقعاً** اجرا شوند. این مسیرها هرگز وارد کدِ مخزن یا CI نشدند (CI از `npx playwright install` خودش استفاده می‌کند).
- دستورِ تکرار: `npm pack @sparticuz/chromium` → استخراجِ `bin/chromium.br` با `zlib.brotliDecompressSync` → `bin/al2023.tar.br` برای کتابخانه‌های shared.

## وضعیتِ جاری

اندازه‌گیریِ واقعی در **۲۰۲۶-۱۰-۲۰** — این بخش با نگهبانِ `tests/test_status_counters.py` قفل است: هر عدد از منبعِ canonicalِ خودش در ریپو بازخوانی می‌شود، پس عددِ کهنه یا جابه‌جاییِ واژه قرمز می‌شود. بخش‌های تاریخ‌دارِ پایین/بالای همین سند snapshotِ همان دورند و دست نمی‌خورند (بندِ ۷ «قواعد مشترک»).

- `node scripts/doctor.mjs --json` ⇒ **۱۴ دامنه** و **۴۴ گام**؛ همین دو عدد از `scripts/doctor.mjs` خوانده می‌شوند (پارسِ ایستا، بدون subprocess).
- تست‌های ریشهٔ پایتون: **۱۸۰ تست** با `python3 -m unittest discover -s tests -p "test_*.py"`.
- **NOT RUN:** هر بررسیِ زنده (Vercel/Cloudflare/Supabase)، deploy و migration — بیرونِ allowlist و نیازمندِ تأییدِ مالک.
