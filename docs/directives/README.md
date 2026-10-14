# دستورالعمل‌های توسعهٔ هر پروژه (Project Directives)

برای هر پروژه یک دستورالعمل مجزا، دقیق و اجرایی نوشته شده است. هر فایل شامل: مأموریت و مرزها، وضعیت فعلی مبتنی بر شواهد مخزن، معماری و فایل‌های کلیدی، دستورهای اجرا/تست، پروتکل دیباگ حرفه‌ای همان پشته، راه‌حل مشکلات شناخته‌شده، پیشنهادهای گسترش اولویت‌بندی‌شده (P0/P1/P2) و «تعریف اتمام کار» (Definition of Done).

| # | پروژه | فایل | اولویت کلی |
|---|---|---|---|
| 0 | مونوریپو و CI مشترک | [00-monorepo.md](00-monorepo.md) | اتصال انتشارها به همین مخزن |
| 1 | MEGA SKILLS 3000 (`psk/`) | [01-psk-mega-skills.md](01-psk-mega-skills.md) | فعال‌سازی Answer Mode با کلید رایگان |
| 2 | هرمس (`hermes/`) | [02-hermes.md](02-hermes.md) | موج W1: تست و تاب‌آوری |
| 3 | CHAM Store OS (`fjcod/`) | [03-fjcod-cham.md](03-fjcod-cham.md) | **P0: مهاجرت واقعی به بک‌اند امن** |
| 4 | Lithos (`lithos/`) | [04-lithos.md](04-lithos.md) | راستی‌آزمایی Buffer API و RPCها |
| 5 | Viking Team (`viking-team/`) | [05-viking-team.md](05-viking-team.md) | تست زندهٔ RLS و آپلود HEIC آیفون |
| 6 | BISON Brand Book (`bison-brand-book/`) | [06-bison-brand-book.md](06-bison-brand-book.md) | تست خودکار، کارایی و دسترس‌پذیری |
| 7 | Orchestrator (`orchestrator/`) | [07-orchestrator.md](07-orchestrator.md) | نگه‌داری تاریخی و بازنشستگی تدریجی |
| 8 | کتابخانه و مسیریاب مهارت‌ها (`library/`, `plugins/`) | [08-skills-library-router.md](08-skills-library-router.md) | یک منبع حقیقت و دقت مسیریاب ≥۸۰٪ |
| 9 | دارایی‌های برند وایکینگ (`brands/`, `brand/`) | [09-viking-brand-assets.md](09-viking-brand-assets.md) | خط لولهٔ تکرارپذیر دارایی‌ها |

## قوانین مشترک همهٔ دستورها

1. **بودجه صفر:** فقط سطح رایگان (Vercel/Supabase/Cloudflare/Gemini free)؛ fallback پولی خودکار ممنوع.
2. **هیچ رازی در Git:** کلید/توکن/رمز فقط در Secretهای پلتفرم؛ `.env.example` فقط نام متغیرها.
3. **تست‌نشده = انجام‌نشده:** ادعای موفقیت فقط با خروجی واقعی دستور تست/بیلد همان پروژه.
4. **بدون PR اسکلتی و بدون auto-merge:** هر تغییر با پیاده‌سازی واقعی، تست سبز و review انسانی.
5. **فارسی و RTL** در رابط کاربر؛ اعداد فارسی و تاریخ شمسی در خروجی کاربرنهایی.
6. قبل از هر تغییر: `bash scripts/repo_health_check.sh` و تست اختصاصی همان پروژه باید سبز باشد.
