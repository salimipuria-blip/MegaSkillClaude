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
