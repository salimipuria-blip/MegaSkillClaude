# دستورالعمل‌های توسعهٔ هر پروژه (Project Directives)

برای هر پروژه/زیرپروژه، دستور توسعهٔ جدا و اجرایی نگهداری می‌شود: مأموریت و مرزها، وضعیت مبتنی بر شواهد، معماری، دستورهای اجرا/تست، پروتکل عیب‌یابی، پیشنهادهای اولویت‌دار و Definition of Done. دفتر جریان داخل خود پروژه است (`PROGRESS.md`)؛ این فایل‌ها مکمل یکدیگرند، نه جایگزین.

| # | پروژه | پوشه/مرز | دستور | اولویت فعلی |
|---|---|---|---|---|
| 0 | مونوریپو و CI مشترک | ریشه | [00-monorepo.md](00-monorepo.md) | یک منبع حقیقت برای انتشار/CI |
| 1 | MEGA SKILLS 3000 | `psk/` | [01-psk-mega-skills.md](01-psk-mega-skills.md) | Answer Mode با کلید رایگان و verified |
| 2 | Hermes | `hermes/`, `tasks/`, `observability/` | [02-hermes.md](02-hermes.md) | انتشار کنترل‌شده + W1 تاب‌آوری |
| 3 | CHAM Store OS | `fjcod/` | [03-fjcod-cham.md](03-fjcod-cham.md) | **P0: بک‌اند/Auth/RLS واقعی** |
| 4 | Lithos | `lithos/` | [04-lithos.md](04-lithos.md) | راستی‌آزمایی واقعی Buffer API |
| 5 | Viking Experience Command | `viking-team/` | [05-viking-team.md](05-viking-team.md) | RLS زنده و آپلود HEIC آیفون |
| 6 | BISON Brand Book | `bison-brand-book/` | [06-bison-brand-book.md](06-bison-brand-book.md) | تست smoke و یکپارچه‌سازی انتشار |
| 7 | Omni LLM Orchestrator | `orchestrator/` | [07-orchestrator.md](07-orchestrator.md) | فقط نگه‌داری/بازنشستگی تاریخی |
| 8 | Skill library/router | `.claude/skills/`, `library/`, `plugins/` | [08-skills-library-router.md](08-skills-library-router.md) | یک منبع حقیقت و بدون drift |
| 9 | استیکرهای وایکینگ | `brands/viking-offroad/` | [09-viking-brand-assets.md](09-viking-brand-assets.md) | manifest قطعی و بازبینی بصری |
| 10 | قالب محتوای وایکینگ | `brand/viking/` | [10-viking-content-renderer.md](10-viking-content-renderer.md) | smoke render واقعی با Chromium |
| 11 | کنسول آیفون مگااسکیل | `mobile/` | [11-mobile-console.md](11-mobile-console.md) | آزمون واقعی Safari/iOS و وزن ایندکس |
| 12 | Viking Cinematic Motion Study | `viking-team/motion/` | [12-viking-motion-study.md](12-viking-motion-study.md) | lockfile، typecheck و preview کنترل‌شده |

برای تغییرات مشترکِ CI، `doctor` و فهرست پروژه‌ها از [دفتر جریان ریشه](../../PROGRESS.md) استفاده کن؛ دفتر محصول را برای تاریخچهٔ تغییر بین‌پروژه‌ای به‌جای آن بازنویسی نکن.

## روال حفظ جریان پروژه

1. پیش از تغییر، `README.md` و `PROGRESS.md` همان پروژه و directive مربوط را بخوان؛ scope و منبع حقیقت را مشخص کن.
2. برای هر تغییر رفتاری ابتدا باگ/نیاز را با تست یا دستور کم‌هزینه بازتولید کن؛ نتیجهٔ قبل/بعد را ثبت کن.
3. پس از کار، **همان نوبت** دفتر `<project>/PROGRESS.md` را در همان پروژه به‌روز کن: تاریخ، فایل/رفتار تغییرکرده، دستور و نتیجهٔ واقعی، محدودیت‌های بررسی و کارهای بعدی. گزارش را append کن؛ لاگ قبلی را بازنویسی نکن.
4. «تست ایستا»، «تست محلی»، «رندر مرورگری»، «انتشار staging» و «تأیید سرویس زنده» را جدا بنویس. مورد انجام‌نشده را با نتیجهٔ سبز محلی یکی نکن.
5. اگر معماری، command، وابستگی یا اولویت پروژه تغییر کرد، directive و جدول‌های مرکزی `README.md`/`ROADMAP.md` را در همان تغییر هماهنگ کن.
6. خروجی تولیدی را با منبع حقیقت sync کن؛ ایندکس‌های مشتق‌شده یا assetهای تولیدی را دستی ویرایش نکن.

## قواعد مشترک

1. **بودجهٔ صفر:** فقط سطح رایگان/موجود؛ fallback پولی خودکار ممنوع.
2. **هیچ رازی در Git، UI یا log:** کلید/توکن/رمز فقط در secret manager؛ `.env.example` فقط نام متغیر و مقدار خالی.
3. **تست‌نشده = تأییدنشده:** ادعای موفقیت فقط با خروجی واقعی همان check؛ تأیید زنده نیازمند دسترسی/آزمون زنده است.
4. **بدون PR اسکلتی و auto-merge:** تغییر واقعی، تست، review انسانی.
5. رابط‌های کاربر فارسی/RTL هستند؛ دسترس‌پذیری، reduced-motion، کنتراست و عرض موبایل بررسی شوند.
6. در پروژهٔ مربوط قبل از merge دستور همان پروژه از `node scripts/doctor.mjs <id>` را اجرا کن؛ بررسی سلامت ریشه جایگزین تست‌های اختصاصی نیست.
