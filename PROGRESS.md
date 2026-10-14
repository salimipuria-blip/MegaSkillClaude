# MegaSkillClaude Monorepo — دفتر جریان مشترک

> این دفتر فقط تغییرات cross-project (CI، doctor، نقشهٔ پروژه‌ها و قراردادهای مشترک) را نگه می‌دارد. هر محصول دفتر جداگانهٔ خودش را دارد. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴**.

## ۱) وضعیت مشترک
- ۱۲ پروژه/زیرپروژهٔ مدیریت‌شده (به‌علاوهٔ خود مخزن)؛ دفتر هرکدام در جدول `README.md` و دستور توسعهٔ هرکدام در [`docs/directives/`](docs/directives/README.md) است.
- `node scripts/doctor.mjs <id>` مرجع فرمان‌های دقیق هر پروژه است؛ `--list` فهرست کامل را نشان می‌دهد.
- Router canonical: **۶٬۰۱۹** مهارت = ۳٬۰۰۰ core + ۸ پروژه + ۳٬۰۱۱ GitHub؛ **۵٬۷۳۸ routable**، **۲۸۱ incomplete** و **۳۰٬۰۸۰ trigger**.
- CI شامل typecheck/build/test، health، skill sync، PWA، دارایی‌های برند و typecheck زیرپروژهٔ Motion است.

## ۲) اصلاحات بین‌پروژه‌ای

**باگ «سبز کاذب» در doctor پیدا و اصلاح شد.** اجرای اولیه نشان داد `common-tests` در ۰٫۰ ثانیه سبز می‌شد: parser سادهٔ `split(' ')` کوتیشن‌های `-p "test_*.py"` را به آرگومان واقعی منتقل نمی‌کرد و Python بدون کشف تست، exit 0 می‌داد.
- parser امنِ بدون shell جایگزین شد؛ آرگومان‌های quoted/escaped درست شکافته می‌شوند و فقط stepهای صریحاً shell از `bash -c` استفاده می‌کنند.
- regression در `tests/doctor.test.mjs` و CI افزوده شد؛ اجرای واقعی اکنون شمار تست کشف‌شده را بررسی می‌کند.
- **۵۶ تست ریشه** و `sync_skill_library.py --check` با صفر اختلاف سبز هستند.
- شمارنده‌های قدیمی مهارت در READMEها همگام شدند؛ snapshot تاریخی ۲٬۹۸۰ فقط با برچسب تاریخ خود باقی مانده است.
- `/build/` به `.gitignore` افزوده شد تا screenshot و رندرهای validation وارد commit نشوند.

## ۳) راستی‌آزمایی نهایی این نوبت

اجرای full doctor در همین محیط با دسترسی صریح به Deno، pytest و Chromium:

```bash
PATH="/tmp/arena-deno/node_modules/.bin:$PATH" \
PYTHONPATH=/tmp/arena-pytest \
CHROMIUM_PATH=/tmp/chromium \
LD_LIBRARY_PATH=/tmp/al2023/lib \
node scripts/doctor.mjs --json
```

**نتیجه: ۱۳ پروژه/دامنه، ۳۸ از ۳۸ مرحله PASS، صفر fail/skip/warn در doctor، ۹۱٫۲ ثانیه.** سه skip داخل خود pytest متعلق به آزمون‌های artifact تاریخی مهارت‌ها هستند و مستند/انتظاری‌اند؛ این‌ها stepهای skipشدهٔ doctor نیستند.
- CHAM: typecheck، ۳۳ تست Vitest، build و E2E واقعی با Chromium؛ **۱۹/۱۹** مرحله، بدون خطای console.
- Orchestrator: قرارداد سبز، **۱۶ pytest pass + ۳ skip مستند**، `deno check` سبز و تست gateway جداگانه **۷/۷** با Deno 2.9.6.
- کنسول موبایل: browser smoke با Chromium و profile شبیه iPhone 13؛ عرض ۳۹۰ CSS px بدون overflow، ۱۳ کارت پروژه، ایندکس ۵٬۷۳۸تایی، ۹ نتیجهٔ `logo`، جزئیات باز/بسته، Service Worker و shell/index آفلاین؛ صفر خطای page/console.
- Viking Motion: رندر MP4 واقعی **۱۸۰/۱۸۰ فریم**؛ H.264، ۱۰۸۰×۱۹۲۰، ۳۰fps، حدود ۶٫۰۵۹s و ۷۸۲٬۱۵۷ بایت؛ خروجی محلی در `viking-team/motion/out/viking-intro.mp4`.
- مسیرهای `/tmp/arena-deno`، `/tmp/arena-pytest` و Chromium/libraryها ابزارهای موقت همین محیط‌اند، نه وابستگی دائمی مخزن. E2E موبایل/Safari روی iPhone واقعی، live Supabase RLS، Buffer API و deployment واقعی هنوز تأیید نشده‌اند.

## ۴) کارهای باز مشترک
- [ ] پس از CI، jobهای doctor، regression parser و `viking-motion` را در GitHub Actions تأیید کن.
- [ ] برای کارهای staging/live از backup، حساب آزمایشی و secret manager استفاده کن؛ نتیجه را در دفتر همان محصول ثبت کن.
- [ ] اگر فهرست پروژه/command عوض شد، `README.md`, `docs/directives/README.md`, `scripts/doctor.mjs` و `tests/test_project_documentation.py` را در همان تغییر هماهنگ نگه دار.
- [ ] Safari/iPhone فیزیکی و سرویس‌های زنده را جداگانه آزمایش کن؛ شبیه‌سازی Chromium معادل تأیید iOS یا RLS نیست.

## ۵) لاگ جریان (افزایشی)
- **۲۰۲۶-۱۰-۱۴** — فرمان‌ها و test discovery در doctor اصلاح شدند؛ regression parser به CI اضافه شد؛ root ۵۶ تست سبز؛ router canonical به اعداد جاری همگام شد.
- **۲۰۲۶-۱۰-۱۴ (full validation)** — ابزارهای موقت pytest/Deno/Chromium در دسترس قرار گرفتند؛ full doctor برای هر ۱۳ دامنه و ۳۸ مرحله سبز شد؛ CHAM E2E دوباره ۱۹/۱۹ پاس شد، Orchestrator Deno ۷/۷، PWA موبایل در حالت online/offline smoke شد و Motion MP4 واقعی رندر/با ffprobe بررسی شد. محدودیت Safari واقعی و backend/deployment زنده همچنان باز است.
