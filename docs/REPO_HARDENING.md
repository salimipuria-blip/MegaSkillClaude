# سخت‌سازی مخزن — 2026-10-12

این تغییرات در کد همین شاخه آماده و به‌صورت محلی تست شده‌اند؛ **انتشار روی سرویس‌های زنده، اعمال تنظیمات حساب و بررسی RLS زنده انجام نشده است.** هیچ کلید یا رمزی به مخزن اضافه نشده و هیچ مسیر پولی فعال نشده است.

پیگیری مستندات در 2026-10-14: rate limit رزرو هرمس، نتایج pytest، و migration schema/RLS اولیهٔ CHAM برای بازبینی در ادامهٔ همین گزارش ثبت شده‌اند؛ وضعیت اجرای زنده تغییر نکرده است.

## اصلاحات

- **GitHub admin gateway:** اعتبارسنجی واقعی نشست از `/auth/v1/user` و تطبیق UUID با `GITHUB_ADMIN_USER_IDS`. توکن عمومی anon، ادعای نقش در metadata، کاربر غیرمالک و خطای سرویس ورود مجوز نمی‌دهند. تنظیم ناقص → 503 و هیچ تماس با GitHub. نوشتن فقط با POST. خطاها توکن و پاسخ خصوصی upstream را افشا نمی‌کنند.
- **یادداشت امنیتی Orchestrator:** `orchestrator/docs/SECURITY_NOTES.md` مرزهای JWT/RLS، service-role، توابع Edge و گیت انتشار را مستند می‌کند؛ snapshot قبلی همچنان مرجع تاریخی است، نه migration قابل‌اعمال.
- **هرمس خصوصی:** تمام پیام‌های گروه/کانال نادیده گرفته می‌شوند؛ شناسهٔ چت خصوصی باید متعلق به فرستندهٔ مجاز باشد. کلید اپ به نسخهٔ v2 تغییر کرده؛ لینک‌های قدیمی مالک پس از انتشار نامعتبر خواهند بود. صفحهٔ عمومی دیگر webhook را تغییر نمی‌دهد؛ `/setup` فقط POST با کلید جداگانهٔ مالک را می‌پذیرد. راه‌اندازی مجاز پیام‌های معوق را دور نمی‌ریزد.
- **حافظهٔ هرمس:** `entry.mjs` یک Durable Object مبتنی بر SQLite برای هر گفتگو صادر می‌کند. درخواست‌های چت، یادداشت و ریست صف مشترک دارند؛ دو پیام هر نوبت در یک تراکنش افزوده می‌شوند. ریست فقط epoch فعال را عوض می‌کند و پیام‌های قبلی حذف نمی‌شوند. KV فعلی و یادداشت‌های آن یک‌بار، بدون حذف مبدأ، منتقل می‌شوند؛ بایگانی‌های قدیمی KV دست‌نخورده می‌مانند. مسیر KV بدون DO فقط برای سازگاری تست‌های محلی است؛ تنظیم انتشار `REQUIRE_CONVERSATIONS=true` از بازگشت بی‌صدا به آن جلوگیری می‌کند.
- **محدودیت رزرو هرمس:** شمارندهٔ fixed-window در `hermes/rate-limit.mjs` متمرکز شده؛ رزرو عمومی برای هر IP پنج درخواست در ساعت می‌پذیرد، خطای KV را fail-closed می‌کند و برای پاسخ 429، `Retry-After` می‌فرستد. KV اتمیک نیست؛ این کنترل best-effort است، نه مرز امنیتی یا محافظت در برابر حملهٔ توزیع‌شده.
- **گالری وایکینگ:** نام آدرس Supabase دیگر API استاندارد `URL` را نمی‌پوشاند. نمایش، دانلود، آزادسازی blob و خطاهای Storage تست رفتاری دارند.
- **CHAM — فقط محافظت موقت:** شناسهٔ ذخیره‌شده در مرورگر دیگر نشست را باز نمی‌کند؛ ورود در هر بار تازه‌سازی لازم است. تغییر نقش/رمز رکورد، مجوز نشست فعلی را بالا نمی‌برد و بازیابی داده با هویت متفاوت ورود مجدد می‌خواهد. داده‌های موجود پاک نشده‌اند. هشدار نسخهٔ محلی قبل و بعد از ورود نمایش داده می‌شود. طرح RLS و migration اجرایی schema/RLS در [`fjcod/docs/security/SUPABASE_RLS_PLAN.md`](../fjcod/docs/security/SUPABASE_RLS_PLAN.md) و `fjcod/supabase/migrations/` آمادهٔ بازبینی‌اند؛ هیچ‌کدام به Supabase اعمال نشده‌اند.
- **BISON:** وابستگی زمان بیلد `source-map-js` به نسخهٔ اصلاح‌شده ارتقا یافته است.
- **مهارت‌ها:** ۲۸۱ مهارت ناقص نگه داشته شده‌اند، ولی از مسیریابی پیش‌فرض پایتون و هرمس کنار گذاشته شده‌اند؛ ۵٬۷۰۵ مهارت قابل مسیریابی‌اند. `--include-incomplete` فقط برای بررسی دستی است.
- **یک منبع حقیقت برای کتابخانه:** `python3 scripts/sync_skill_library.py` نمایه‌ها، دستورالعمل‌ها، فایل‌های همراه و متن مجوزها را از منابع اصلی به پلاگین قابل‌نصب همگام می‌کند. `--check` بدون نوشتن، ناهماهنگی را پیدا می‌کند و در CI اجرا می‌شود. نسخه‌های تکراری برای نصب مستقل حفظ شده‌اند؛ دستی و جداگانه ویرایششان نکنید.
- **CI:** تست‌های دسترسی Gateway در Node/Deno، رسانه وایکینگ، راه‌اندازی خصوصی هرمس و SQLite چند Worker افزوده شده‌اند. کل تست‌های Orchestrator کشف می‌شوند. سه تست تاریخیِ نیازمند فایل خارجی فقط در checkout کاملاً materialize‌نشده با دلیل روشن skip می‌شوند؛ نصب ناقص همچنان fail می‌شود.

## کارهایی که هنوز واقعاً انجام نشده‌اند

### ۱. انتشار اصلاحات

تغییرات این شاخه خودکار روی `main` یا سرویس‌ها منتشر نشده‌اند. پس از بررسی و ادغام:

- **هرمس:** پیکربندی `hermes/wrangler.toml` با migration به نام `conversation-sqlite-v1` همراه کد منتشر شود. کلاس SQLite با binding `CONVERSATIONS` لازم است؛ پایگاه داده/کلید جداگانه در فایل ایجاد نکنید. از کلاس SQLite سازگار با سطح رایگان استفاده کنید و هیچ ارتقای پولی را خودکار نپذیرید. بهتر است اولین انتشار در زمان بدون گفتگوی در حال اجرا انجام شود تا خواندن یک‌بارهٔ KV با Worker قدیمی هم‌زمان نشود. اگر اتصال webhook نیاز به ساخت/تعمیر دارد، CLI خصوصی `setup:webhook` را طبق `hermes/README.md` اجرا کنید؛ بازکردن `/setup` کافی نیست. بعد از انتشار در **چت خصوصی** `/app` بزنید و لینک تازه را باز کنید. مبدأ و بایگانی‌های KV را برای بازگشت/بازیابی نگه دارید.
- **Gateway:** UUID واقعی مالک را از Supabase Auth پیدا کنید و در secret/environment `GITHUB_ADMIN_USER_IDS` قرار دهید؛ چند UUID با ویرگول جدا می‌شوند. `SUPABASE_URL`، `SUPABASE_ANON_KEY` و `GITHUB_ADMIN_TOKEN` فقط در تنظیمات سرور باشند. تا تنظیم allowlist، endpoint عمداً بسته می‌ماند. تابع `github-admin-gateway` باید دوباره منتشر شود؛ وجود فایل در Git به معنی امن‌شدن نسخهٔ زنده نیست.
- **Viking/BISON/CHAM:** اتصال انتشار را مطابق README بررسی کنید؛ هنوز ممکن است مخزن قدیمی منبع انتشار باشد.

### ۲. مهاجرت واقعی CHAM به بک‌اند

**مهاجرت کامل backend پیاده‌سازی یا منتشر نشده است.** فایل اجرایی `fjcod/supabase/migrations/20261014000000_cham_schema_rls.sql` فقط baseline schema/RLS را می‌سازد و هنوز به هیچ دیتابیسی اعمال نشده است؛ دادهٔ فروشگاه/عضویت seed یا وارد نمی‌شود و RPCهای تراکنشی هم در آن نیستند. محدودیت اصلی با تغییر sessionStorage حل کامل نمی‌شود: پایگاه داده و تصمیم‌های مجوز هنوز در نسخهٔ فعلی روی دستگاه و قابل دستکاری‌اند. نسخهٔ محلی را سامانهٔ امن مالی یا چنددستگاهی معرفی نکنید.

قبل از استفادهٔ حساس باید:
1. از دادهٔ هر دستگاه نسخهٔ پشتیبان بگیرید؛ دادهٔ مرورگر را خودکار پاک/جایگزین نکنید.
2. پروژه و schema مقصد Supabase و روش نگاشت کاربران محلی به حساب واقعی مشخص شود.
3. احراز هویت سروری، RLS نقش‌ها، تراکنش فروش/موجودی و پشتیبان‌گیری قابل بازیابی پیاده‌سازی شوند.
4. مهاجرت با دو دستگاه، کاربر غیرمجاز، ریست مرورگر و بازگردانی پشتیبان آزموده شود.

### ۳. تست نصب تاریخی Orchestrator

فایل‌های خارجی در `orchestrator/skills/registry/BASELINE_ARTIFACTS.json` مستند شده‌اند و این اصلاحات آن‌ها را جعل یا با نسخهٔ دیگری جایگزین نمی‌کند. پس از materialization معتبر، این گیت اجباری را اجرا کنید:

```bash
cd orchestrator
python -m pytest -q --require-materialized-skills tests
```

در checkout فعلی این دستور باید به‌خاطر نبود artifacts شکست بخورد؛ skip در اجرای معمول، ادعای نصب ۳۰۰۰ مهارت تاریخی نیست.

## بررسی‌های محلی

```bash
python3 scripts/sync_skill_library.py --check
python3 -m unittest discover -s tests -v
(cd psk && npm run check && npm test)
(cd fjcod && npm run check)
(cd lithos && npm test && npm run build)
(cd bison-brand-book && npm audit && npm run build)
(cd viking-team && node --test tests/*.test.mjs && python3 -m unittest discover -s tests -v)
(cd orchestrator && python scripts/audit/check_repository_contract.py && python -m pytest -q -ra tests && node --test supabase/functions/github-admin-gateway/*.test.mjs)
# --ignore-scripts جلوگیری از همگام‌سازی رمزهای واقعی هنگام نصب برای تست
npm ci --prefix hermes --ignore-scripts --no-audit --no-fund
npm run check --prefix hermes
npm test --prefix hermes
npm run test:integration --prefix hermes
node hermes/build-skills.mjs
```

تست‌های workerd/SQLite و Gateway فقط از fixture و upstream شبیه‌سازی‌شده استفاده می‌کنند؛ درخواست یا نوشتن واقعی در Telegram/Gemini/GitHub/Supabase ندارند. تست سرتاسری مرورگر/آیفون و دسترسی واقعی RLS جدا از این تست‌ها هستند.


### نتیجهٔ این نوبت

| مجموعه | نتیجهٔ محلی |
|---|---|
| PSK | ۱۶ تست + بررسی syntax |
| Root/router/sync/statusline | ۱۶ تست؛ `sync --check` بدون اختلاف |
| CHAM | ۳۳ تست + typecheck + build |
| Viking | ۴ تست رفتاری + ۵ تست static |
| Lithos | ۳ تست + build |
| GitHub gateway | ۷ تست مشترک در هر دو Node و Deno + check بومی Deno |
| Orchestrator | ۱۶ تست موفق، ۳ skip مستند؛ شکست اجباری نبود artifacts با strict gate هم تأیید شد |
| Hermes | ۴۵ تست بات/CLI + ۶ تست واقعی workerd/SQLite؛ build assets و Wrangler dry-run موفق |
| BISON | build موفق؛ `source-map-js@1.2.2` و audit صفر آسیب‌پذیری |

جمع **۱۵۱ تست یکتا موفق**، با ۳ skip تاریخیِ مشخص. audit هرمس هم صفر آسیب‌پذیری بود.
تست‌های Gateway که در دو runtime تکرار شدند دوبار در جمع حساب نشده‌اند. dry-run هرمس
فقط bundle و bindingها را بررسی می‌کند؛ هیچ انتشار واقعی انجام نداده است. بررسی کامل Deno
سایر توابع و browser E2E محلی انجام نشده‌اند؛ تست Deno Gateway مستقل اجرا شد.

### پیگیری محلی 2026-10-14

- helper محدودیت رزرو هرمس: `npm run check --prefix hermes` و `npm test --prefix hermes` موفق؛ ۸۶ تست.
- Orchestrator: قرارداد مخزن موفق؛ در محیط مجازی جداگانه `pytest` اجرا شد: ۱۶ موفق، ۳ skip به‌دلیل نبود artifactهای تاریخی checkout.
- CHAM: migration schema/RLS ساخته و با PostgreSQL parser بررسی شد (۱۱۵ statement parse شد). CLI/psql/Docker و اتصال remote در این محیط موجود نیست؛ هیچ SQL روی دیتابیس اجرا نشده، و تست رفتاری RLS هنوز انجام نشده است.
