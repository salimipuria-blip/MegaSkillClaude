# نقشهٔ راه فنی و محصولی MegaSkillClaude

> **آخرین بازبینی مستندات: ۲۰۲۶-۱۰-۱۴.** وضعیت کد/تست محلی از دفتر هر پروژه گرفته شده؛ داشتن تست سبز به‌معنی اتصال deployment، اعمال migration یا تأیید سرویس زنده نیست. سیاست ثابت: بودجهٔ صفر، عدم fallback پولی خودکار و صفر secret در Git.

این مخزن چند محصول و زیرپروژهٔ مستقل دارد؛ شناسهٔ تست هرکدام در [README](README.md) و [فهرست دستورالعمل‌ها](docs/directives/README.md) آمده است. این جدول خلاصه است؛ **دفتر جریان همان پوشه مرجع جزئیات و آخرین شواهد است.**

## ۱) وضعیت فعلی بر اساس مرز پروژه

| پروژه | پوشه | وضعیت مهندسی | شکاف مهم / مرز تأیید |
|---|---|---|---|
| **MEGA SKILLS 3000** | `psk/` | موتور مهارت، API، سنجهٔ کیفیت و golden suite فعال؛ ۵۷ تست و دقت top-1 ۱۰۰٪ طبق `psk/PROGRESS.md` | Answer Mode به کلید/پیکربندی provider رایگان مالک نیاز دارد؛ `NO_PROVIDER_CONFIGURED` بدون کلید رفتار درست است؛ تست live فقط با deployment و کلید واقعی |
| **Hermes** | `hermes/`, `tasks/`, `observability/` | Worker، SQLite Durable Object، استودیوی تصویر/متن، تست واحد و integration محلی | انتشار Worker با migration و bindingهای فعلی هنوز جداگانه باید تأیید شود؛ برنامه‌ریز تسک read-only است |
| **CHAM Store OS** | `fjcod/` | React 19 + TypeScript + Vite؛ ۴۵ تست واحد و E2E با Chromium ۱۹/۱۹ طبق `fjcod/PROGRESS.md` | **برای دادهٔ مالی/حساس production-safe نیست:** backend/Auth/RLS سروری هنوز اعمال نشده؛ دادهٔ مرورگر و رمزهای اولیه ریسک‌اند؛ نسخهٔ نهایی و منتشرشده در ریپوی `POINT/fjcod` است (این پوشه قدیمی) |
| **Lithos Live Intelligence** | `lithos/` | تست handler و build؛ رد پاسخ Buffer خالی به‌جای snapshot صفر | GraphQL/metricهای Buffer راستی‌آزمایی زنده نشده‌اند؛ `api/buffer-sync.js` بخشی بازسازی شده است |
| **Viking Experience Command** | `viking-team/` | چک‌های static، Node و Python؛ Auth/RLS و private bucket در کد/SQL | migration، پنج حساب، RLS و upload HEIC روی Supabase/iPhone زنده تأیید نشده؛ انتشار هنوز ممکن است از مخزن قدیمی باشد |
| **Viking Motion Study** | `viking-team/motion/` | نمونهٔ جداگانهٔ Remotion؛ dependency lock و typecheck strict اضافه شده | prototype است، در `/team/` ادغام نشده؛ typecheck به‌معنی رندر MP4 یا تأیید UX نیست |
| **BISON Brand Book** | `bison-brand-book/` | Vite/GSAP/Lenis build و audit طبق دفتر پروژه | smoke/accessibility خودکار محدود است؛ Pages/Vercel قدیمی باید به یک منبع انتشار تبدیل شود |
| **Omni LLM Orchestrator** | `orchestrator/` | وضعیت تاریخی؛ قرارداد و pytest با ۳ skip مستند | قابلیت محصولی جدید نساز؛ ابتدا تاریخچه/تابع‌های تکراری را با تست قرارداد بازنشسته کن |
| **Skill library/router** | `.claude/skills/`, `library/`, `plugins/` | canonical source و sync check؛ مصرف‌کننده‌ها PSK، Hermes، plugin و mobile هستند | indexهای مشتق‌شده را دستی تغییر نده؛ countهای هر package ممکن است به‌خاطر scope/مهارت‌های ناقص متفاوت باشد |
| **کنسول آیفون مگااسکیل** | `mobile/` | ۵٬۷۴۵ مهارت، جست‌وجوی local، HTML escaping، fingerprint نسخه‌دار PWA و تست‌های Node/Python | Safari/iOS واقعی و زمان بارگذاری ۲٫۲MB خام هنوز روی دستگاه تأیید نشده؛ VS Code وب ترمینال نیست |
| **استیکرهای وایکینگ** | `brands/viking-offroad/` | validator ایستای ۱۲ پک/۳۶۰ فایل ۵۱۲×۵۱۲ RGBA + ۱۲ preview و cover | validator طراحی/کیفیت هر پیکسل را نمی‌سنجد؛ بازبینی تصویری release لازم است |
| **قالب محتوای وایکینگ** | `brand/viking/` | validator محلی و نحو renderer؛ مسیرهای hard-code مرورگر برداشته شده | رندر واقعی Chromium و بازبینی خروجی این محیط تأیید نشده؛ پالت این قالب از پالت استیکر جدا است |

## ۲) اولویت‌های اجرایی

### P0 — ریسک داده و انتشار
1. **CHAM:** از دادهٔ هر دستگاه backup بگیر؛ تصمیم backend/auth بگیر؛ migration schema/RLS را فقط پس از review روی staging اجرا کن؛ RPC فروش/کسر موجودی باید اتمیک و idempotent باشد؛ رمزهای اولیهٔ منتشرشده را حذف/rotate کن. تا وقتی این گیت‌ها پاس نشده‌اند، دادهٔ واقعی حساس وارد نشود.
2. **اتصال انتشار:** Vercel/Pages پروژه‌های CHAM، Viking و BISON را با Root Directory پوشهٔ همان پروژه به این مخزن وصل کن؛ deployment واقعی را بررسی کن؛ بعد مخزن قدیمی را Archive کن، نه حذف.
3. **Viking:** migration/RLS، حساب‌های آزمایشی و policy باکت را روی staging ثابت کن؛ سپس ورود/آپلود از iPhone را به‌عنوان آزمون جدا ثبت کن.
4. **Lithos:** کوئری Buffer و metricها را با پاسخ واقعی و پنل Buffer تطبیق بده؛ تا آن زمان دادهٔ خالی را به صفر واقعی تبدیل نکن.

### P1 — کیفیت، release و observability
- **PSK:** کلید رایگان provider را فقط مالک در secret manager پیکربندی کند؛ تست Answer Mode و نرخ/سهمیه را بدون افشای secret ثبت کند. مجموعهٔ routing gold را با بازبینی انسانی رشد بده.
- **Hermes:** اجرای W1 از `tasks/README.md` با تست‌های failure/retry؛ پس از انتشار کنترل‌شده، health، SQLite migration و webhook را از چت خصوصی راستی‌آزمایی کن.
- **BISON:** smoke test لینک/تصویر و reduced-motion؛ performance و دسترس‌پذیری موبایل را اندازه بگیر.
- **Mobile:** Safari iOS offline → reconnect → update واقعی؛ سپس اگر bottleneck اندازه‌گیری شد، ایندکس domain-split یا فشرده‌سازی را بررسی کن.
- **برند:** CI به‌طور ایستا ساختار/مسیرها را می‌سنجد؛ برای استیکر و template renderer، preview تصویری به‌صورت artifact موقت تولید و انسانی بازبینی شود.
- **Motion:** تأیید dependency lockfile/typecheck؛ رندر ۱۸۰ فریم و reduced-motion قبل از هر ادغام محصولی.

### P2 — مقیاس (پس از پایداری)
- CHAM: صف آفلاین/outbox و حل تعارض تنها پس از backend و تراکنش امن؛ سپس import کالا و گزارش اختلاف صندوق.
- PSK: نشست HttpOnly، تاریخچهٔ تسک با RLS و اجرای ابزار مستقل؛ فقط با threat model و محدودیت هزینه.
- Viking: رسانهٔ بیشتر و داشبورد سلامت پس از اثبات authorization و سقف اعضا.
- Orchestrator: بازنشستگی تدریجی توابع Supabase تکراری پس از پوشش قرارداد در PSK.

## ۳) اصول مشترک معماری و release

- یک منبع canonical برای هر داده: مهارت‌ها از router؛ ایندکس موبایل با `mobile/build-index.py`; هیچ خروجی generated دستی اصلاح نشود.
- Supabase هر محصول باید schema/RLS جدا و secretهای محدود داشته باشد؛ anon/publishable کلید عمومی است و جای RLS نیست.
- هیچ migration روی دیتابیس واقعی بدون backup، review، rollback و staging test اجرا نشود.
- CI فقط کد موجود در checkout را می‌سنجد. تست mocked/static را با تست live Auth, RLS, provider, browser یا deployment یکی ندان.
- معیار رابط مشترک: فارسی/RTL، کنتراست مناسب، حرکت قابل‌کاهش، بدون overflow در ۳۲۰px، و نمایش خطاهای شبکه بدون جعل داده.
- برای تاریخچهٔ تغییرات، همان نوبت `PROGRESS.md` پروژه را با فرمان، خروجی، محدودیت و اقدام بعدی به‌روز کن؛ [روال ثبت جریان](docs/directives/README.md) الزام است.

## ۴) معیارهای موفقیت

| شاخص | هدف/گیت |
|---|---|
| CI پروژهٔ تغییرکرده | تمام jobهای مرتبط سبز؛ failure را با حدس/flaky نادیده نگیر |
| secret در Git یا log | صفر؛ در صورت افشا rotate و incident ثبت شود |
| CHAM برای دادهٔ حساس | ممنوع تا backend/Auth/RLS و restore واقعی تأیید شود |
| routing | golden بدون regression؛ accuracy با gold label انسانی گزارش شود |
| هزینهٔ provider | free-tier و fail-closed؛ fallback پولی خودکار ممنوع |
| موبایل | اندازه‌گیری واقعی روی دستگاه؛ هدف اولیه LCP کمتر از ۲٫۵ ثانیه، بدون ادعای تست‌نشده |
| دارایی بصری | validator ساختاری + بازبینی تصویری انسانی، هر دو لازم |
