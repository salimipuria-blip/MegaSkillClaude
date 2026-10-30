# MegaSkillClaude — فهرست پروژه‌ها و روال نگه‌داری

همهٔ پروژه‌های پوریا در یک مخزن قرار دارند؛ پروژه‌ها پوشه، تست، مالکیت داده و چرخهٔ انتشار جدا دارند. جدول زیر **مرز محصول و دفتر جریان هر پروژه** را مشخص می‌کند. جزئیات وضعیت/باگ‌ها/کارهای بعدی در `PROGRESS.md` همان پوشه است؛ تغییرات CI و cross-project در [دفتر جریان ریشه](PROGRESS.md) ثبت می‌شود و دستور فنی دقیق در [فهرست دستورالعمل‌های پروژه](docs/directives/README.md) نگهداری می‌شود.

## پروژه‌ها

| پروژه | پوشه / مرز | دستور بررسی کوتاه | دفتر جریان | دستور توسعه |
|---|---|---|---|---|
| **MEGA SKILLS 3000** — سایت، API و موتور مهارت | `psk/` | `node scripts/doctor.mjs psk` | [PROGRESS](psk/PROGRESS.md) · [README](psk/README.md) | [01](docs/directives/01-psk-mega-skills.md) |
| **Hermes** — دستیار تلگرام Lite/Full | `hermes/`; برنامه‌ریزی تسک در `tasks/`; داشبورد در `observability/` | `node scripts/doctor.mjs hermes` | [PROGRESS](hermes/PROGRESS.md) · [README](hermes/README.md) | [02](docs/directives/02-hermes.md) |
| **CHAM Store OS (FJCOD)** — سامانهٔ فروش فروشگاه | `fjcod/` | `node scripts/doctor.mjs fjcod` | [PROGRESS](fjcod/PROGRESS.md) · [README](fjcod/README.md) | [03](docs/directives/03-fjcod-cham.md) |
| **Lithos Live Intelligence** — داشبورد خصوصی | `lithos/` | `node scripts/doctor.mjs lithos` | [PROGRESS](lithos/PROGRESS.md) · [README](lithos/README.md) | [04](docs/directives/04-lithos.md) |
| **Viking Experience Command** — وب‌اپ خصوصی تیم | `viking-team/` (نسخهٔ محلی و `/team/`) | `node scripts/doctor.mjs viking-team` | [PROGRESS](viking-team/PROGRESS.md) · [README](viking-team/README.md) | [05](docs/directives/05-viking-team.md) |
| **Viking Cinematic Motion Study** — نمونهٔ Remotion، هنوز محصول زنده نیست | `viking-team/motion/` | `node scripts/doctor.mjs viking-motion` | [PROGRESS](viking-team/motion/PROGRESS.md) · [README](viking-team/motion/README_FA.md) | [12](docs/directives/12-viking-motion-study.md) |
| **BISON Brand Book** — کتاب برند سینمایی | `bison-brand-book/` | `node scripts/doctor.mjs bison-brand-book` | [PROGRESS](bison-brand-book/PROGRESS.md) · [README](bison-brand-book/README.md) | [06](docs/directives/06-bison-brand-book.md) |
| **Omni LLM Orchestrator** — کد تاریخی/مهاجرتی، نه محصول فعال | `orchestrator/` | `node scripts/doctor.mjs orchestrator` | [PROGRESS](orchestrator/PROGRESS.md) · [README](orchestrator/README.md) | [07](docs/directives/07-orchestrator.md) |
| **کتابخانه و مسیریاب مهارت‌ها** — منبع canonical و پلاگین قابل‌نصب | `.claude/skills/`, `library/`, `plugins/mega-skills-router/` | `node scripts/doctor.mjs router` | [PROGRESS](plugins/mega-skills-router/PROGRESS.md) · [README](plugins/mega-skills-router/README.md) | [08](docs/directives/08-skills-library-router.md) |
| **کنسول آیفون مگااسکیل** — PWA جست‌وجوی مهارت/دستور تست | `mobile/` | `node scripts/doctor.mjs mobile` | [PROGRESS](mobile/PROGRESS.md) · [README](mobile/README.md) | [11](docs/directives/11-mobile-console.md) |
| **استیکرهای وایکینگ آفرود** — ۱۲ پک PNG و سورس | `brands/viking-offroad/` | `node scripts/doctor.mjs brand-stickers` | [PROGRESS](brands/viking-offroad/PROGRESS.md) · [README](brands/viking-offroad/stickers/README.md) | [09](docs/directives/09-viking-brand-assets.md) |
| **قالب پست/استوری وایکینگ** — HTML به PNG با Playwright | `brand/viking/` | `node scripts/doctor.mjs brand-viking` | [PROGRESS](brand/viking/PROGRESS.md) · [README](brand/viking/README.md) | [10](docs/directives/10-viking-content-renderer.md) |
| **مِتاکد / APEX-01** — ایجنت کدنویسِ خودتکامل، آمادهٔ Netlify | `apex-agent/` | `node scripts/doctor.mjs apex` | [PROGRESS](apex-agent/PROGRESS.md) · [README](apex-agent/README.md) | [13](docs/directives/13-apex-agent.md) |

## بررسی و دیباگ پروژه‌ها

`node scripts/doctor.mjs` ترتیب گیت‌های همهٔ پروژه‌ها را اجرا می‌کند؛ با شناسه فقط همان پروژه را بررسی کن:

```bash
node scripts/doctor.mjs                         # همهٔ پروژه‌ها
node scripts/doctor.mjs psk lithos              # فقط موارد نام‌برده‌شده
node scripts/doctor.mjs --list                  # شناسه‌ها و فرمان دقیق هر مرحله
node scripts/doctor.mjs mobile --json            # گزارش ماشینی
node scripts/doctor.mjs fjcod --fix              # راهنمای فرمان رفع خطا؛ خودش تغییری نمی‌نویسد
```

این ابزار commandهای تست/بیلد را اجرا می‌کند و وابستگی‌ها را خودکار نصب نمی‌کند. اگر `node_modules` لازم باشد، دستور نصب امن را گزارش می‌دهد. برای Hermes از `npm ci --ignore-scripts` استفاده کن تا `postinstall` هیچ همگام‌سازی راز انجام ندهد. مرورگر، Deno یا دسترسی staging که در محیط موجود نباشد، به‌عنوان skip/تأییدنشده ثبت می‌شود و موفقیت زنده فرض نمی‌شود.

پیش از ادعای انجام کار، تست همان پروژه را اجرا کن و نتیجه را در دفتر جریانش ثبت کن. [روال نگه‌داری و الزام به به‌روزرسانی PROGRESS](docs/directives/README.md#روال-حفظ-جریان-پروژه) به‌تفصیل مشخص شده است. وضعیت سطح‌بالا و اولویت‌ها در [ROADMAP.md](ROADMAP.md) و نتایج hardening در [گزارش سخت‌سازی](docs/REPO_HARDENING.md) است.

## CI و امنیت

CI واحد در `.github/workflows/ci.yml` گیت‌های کد، تست، typecheck، build، ایندکس PWA و قراردادهای برند را اجرا می‌کند؛ Hermes یک workflow path-filtered هم دارد. تست محلی، رندر مرورگری، تأیید Supabase/Vercel و بررسی انتشار زنده سطوح جدا هستند.

- هیچ secret، service-role key یا رمز پیش‌فرض جدیدی به Git اضافه نکن.
- `.env.example` فقط نام متغیرهای خالی است؛ مقدار واقعی فقط در secret manager.
- داده‌های CHAM هنوز backend/Auth سروری ندارند؛ برای دادهٔ واقعی مالی امن یا چنددستگاهی استفاده نشود.
- مهارت‌ها فقط از منبع canonical تغییر می‌کنند: `python3 scripts/sync_skill_library.py --check` drift را می‌گیرد.
- خروجی‌های build، MP4 و تصاویر تولیدی حجیم را به‌صورت خودکار commit نکن.

## انتشار سایت‌های قدیمی

`fjcod/`، `viking-team/` و `bison-brand-book/` هنوز از مخازن/اتصال‌های قدیمی منتشر می‌شوند؛ تغییر اینجا لزوماً روی سایت زنده نمی‌رود. پیش از Archive مخزن قدیمی، اتصال Vercel را با Root Directory پوشهٔ پروژه به همین مخزن منتقل و یک deployment واقعی را جداگانه تأیید کن. دستورهای دقیق در [ROADMAP.md](ROADMAP.md) هستند.
