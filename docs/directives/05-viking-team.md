# 05 — Viking Experience Command (`viking-team/`)

## مأموریت و مرزها
مرکز فرمان خصوصی تیم اجرایی وایکینگ (سفرها، وظایف، تجربه‌ها، گالری وابسته به سفر) به‌همراه نسخهٔ عمومی قدیمی در ریشه. مسیر واقعی محصول `/team/` است: HTML ایستا + Supabase Auth + RLS + باکت خصوصی `viking-private`. لینک اشتراکی به‌تنهایی مجوز نیست؛ سقف تیم **۵ عضو فعال** است. `viking-team/motion/` یک Remotion study جداست و هنوز در این اپ ادغام نشده؛ برای آن از [دستور 12](12-viking-motion-study.md) استفاده کن.

## وضعیت فعلی (شواهد: `viking-team/README.md`, `sql/`)
- ✅ کلاینت تیم (`team/{index.html,app.js,styles.css}`) + تست‌های رفتاری رسانه (نمایش/دانلود/آزادسازی blob/خطای Storage) و تست‌های static سبز.
- ⚠️ اسکیما و سقف عضو در `sql/viking_supabase_schema.sql` و `sql/viking_limit_five_active_members.sql` هست، ولی اعمال‌شدن migration و آماده‌بودن ۵ حساب **تأیید زنده نشده**؛ انتشار هنوز از مخزن قدیمی است.
- رسانه: JPG/PNG/WebP/HEIC تا ۸MB، گره‌خورده به سفر؛ HEIC روی آیفون مسیر بحرانی است.

## اجرا و تست
```bash
cd viking-team && node --test tests/*.test.mjs && python3 -m unittest discover -s tests -v
grep -R -E 'service_role|sb_secret_' team && echo 'SECRET LEAK' || echo 'client clean'
```

## پروتکل دیباگ حرفه‌ای
- **ورود/دسترسی:** ترتیب بررسی: وجود حساب و تأیید ایمیل → RLS جدول‌های `viking_*` → policy باکت خصوصی. کلید anon ذاتاً عمومی است؛ هر «رفع مشکل» با service_role در مرورگر ممنوع و نشت محسوب می‌شود.
- **آپلود ناموفق:** نوع/حجم فایل، policy باکت و پیوند سفر را جدا تست کن؛ HEIC را حتماً روی آیفون واقعی (نه فقط شبیه‌ساز/مک) راستی‌آزمایی کن و نتیجه را ثبت کن.
- **رسانه نمایش داده نمی‌شود:** چرخهٔ عمر blob URL (ساخت/آزادسازی) در `team/app.js` تست رفتاری دارد؛ اول همان تست را بازتولید کن.
- موفقیت بیلد static به معنی موفقیت ورود واقعی یا آپلود آیفون نیست؛ این سه را در گزارش قاطی نکن.

## گسترش (اولویت‌بندی)
- **P0:** اتصال Vercel به همین مخزن؛ اعمال/تأیید migration روی Supabase زنده و ساخت ۵ حساب واقعی با دعوت خارج از Git.
- **P1:** تست خودکار RLS (کاربر مجاز/غیرمجاز/بدون نشست) در CI با fixture؛ سناریوی کامل آپلود HEIC آیفون در چک‌لیست انتشار.
- **P2:** فعال‌سازی دوبارهٔ قابلیت‌های رسانه‌ای تعلیق‌شده و گزارش سلامت گالری در داشبورد مالک.

## Definition of Done
تست‌های Node/Python سبز، ورود واقعی با حساب تست موفق، آپلود و مشاهدهٔ عکس از آیفون تأییدشده، هیچ secret در کلاینت، وضعیت زنده در README صادقانه به‌روز.

## پروندهٔ واقعی این دور (۲۰۲۶-۱۰-۱۴) — RLS به‌عنوان گیت ایستا (نه فقط ادعا)

**مسئله:** گیتِ قبلی می‌گفت «در فایلِ SQL عبارتِ `enable row level security` هست». این از کنارِ یک جدولِ تازه **بدون RLS** و از کنارِ یک policy اعطاشده به `anon` رد می‌شد — بدترین کلاسِ باگِ امنیتی، چون با کلیدِ anonِ عمومی قابل بهره‌برداری است.

**رفع — `tests/test_sql_contract.py` (۱۰ تست)، هرکدام پشتِ یک شکستِ واقعی:**
| تست | خطایی که می‌گیرد |
|---|---|
| هر `create table public.*` یک `alter table … enable row level security` دارد | جدولِ جدید بدون RLS |
| هر جدول حداقل یک policy دارد | جدولِ قفلِ مطلق («relation does not exist» برای anon) |
| هیچ policy به `anon`/`public` اعطا نشود | نشتِ داده با کلیدِ عمومی |
| **هر** policy باید `viking_is_active_member()` یا `viking_is_admin()` را صدا بزند | policy با `using (true)` |
| توابعِ `security definer` باید `search_path` میخ‌کوب‌شده داشته باشند و از `anon` revoke شوند | hijackِ `search_path` / اجرای تابع توسط ناشناس |
| باکت `viking-private` خصوصی، ۸MB، محدود به همان چهار MIME (شامل `image/heic`) | باکتِ عمومی یا محدودیتِ حذف‌شده |
| سقفِ پنج عضو: `pg_advisory_xact_lock(2026,5)` پیش از شمارش + `raise exception` + `errcode 23514` | مسابقهٔ هم‌زمانی ← عضوِ ششم |
| تابعِ تریگر `security invoker` + `search_path` + revoke از anon | اجرای ناخواسته با دسترسیِ بالا |
| بدون `drop table`/`truncate` و با `drop policy if exists` برای هر policy | اجرای دوباره شکست می‌خورد یا داده پاک می‌شود |
| هیچ ایمیلِ عضو در SQL | نشتِ هویت در مخزن |

**اعتبارسنجی با جهش (الزامی برای هر نگهبان جدید):**
```bash
cp -r viking-team /tmp/vtm && cd /tmp/vtm
python3 - <<'EOF'
import pathlib
p=pathlib.Path('sql/viking_supabase_schema.sql'); t=p.read_text()
t=t.replace("alter table public.viking_trip_media enable row level security;","",1)
t=t.replace('for select to authenticated using (public.viking_is_active_member());','for select to anon, authenticated using (true);',1)
p.write_text(t)
EOF
python3 -m unittest discover -s tests     # باید دقیقاً ۲ تست قرمز شود
```
این دور همین کار انجام شد و ۲ تست قرمز شدند؛ یعنی نگهبان واقعاً چیزی را نگه می‌دارد.

**مرزِ صریح:** این‌ها بررسیِ ایستای فایلِ `sql/` هستند، **نه** اثباتِ وضعیتِ staging. برای آن: `sql/*.sql` را روی پروژهٔ آزمایشی اعمال کن، با نشستِ واقعی بخوان، و تریگرِ سقف را با شش عضو امتحان کن.
