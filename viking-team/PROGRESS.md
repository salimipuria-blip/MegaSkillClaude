# Viking Experience Command — دفتر جریان پروژه

> توضیح زندهٔ پروژه؛ هر دور کاری همین‌جا اضافه می‌شود. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴**.

## ۱) پروژه در یک نگاه
- **پوشه:** `viking-team/` · **فناوری:** HTML/CSS/JS ایستا + PWA + Supabase (Auth، RLS، باکت خصوصی)
- **دو سطح محصول:**
  1. `index.html` — نسخهٔ «محلی/آفلاین» (localStorage + IndexedDB برای عکس، بدون سرور)
  2. `team/` — مرکز فرمان تیم با ورود واقعی Supabase (`team/app.js`، `team/index.html`)
- **پایگاه داده:** `sql/viking_supabase_schema.sql` (۳ جدول + RLS) و
  `sql/viking_limit_five_active_members.sql` (تریگر سقف ۵ عضو فعال)
- **انتشار:** Vercel (هنوز از مخزن قدیمی — بند P0 نقشهٔ راه)

## ۲) دستور دقیق این پروژه
```bash
node scripts/doctor.mjs viking-team  # ۴ تست node + سینتکس + ۵ تست پایتون + نگهبانِ نبود کلید سرویس
```
معادل دستی:
```bash
cd viking-team
node --test tests/*.test.mjs                              # رگرسیون رفتار رسانه (۴)
node --check --input-type=module < team/app.js            # سینتکس کلاینت
python3 -m unittest discover -s tests                     # یکپارچگی ایستا (۵)
! grep -R -E 'service_role|sb_secret_' team               # هیچ کلید مدیریتی در کلاینت
```

## ۳) وضعیت تأییدشده (۲۰۲۶-۱۰-۱۴)
| بررسی | نتیجه |
|---|---|
| `node --test tests/*.test.mjs` | ✅ **۴/۴** |
| `python3 -m unittest discover -s tests` | ✅ **۵/۵** (هر هدف ناوبری view دارد، idها یکتا هستند، RLS و باکت خصوصی اعلام شده، هیچ کلید سرویسی در کلاینت نیست) |
| سینتکس `team/app.js` | ✅ (۳۳ تابع؛ همه تعریف‌شده و استفاده‌شده — بدون تابع یتیم) |
| `sql/` | ✅ RLS روی هر سه جدول؛ `viking_is_active_member()`/`viking_is_admin()` با
  `security definer set search_path=''` و `revoke` از anon؛ سقف ۵ عضو با
  `pg_advisory_xact_lock(2026,5)` و `errcode 23514` (بدون مسابقهٔ هم‌زمانی) |
| کلید داخل کلاینت | ✅ فقط کلید `anon` (عمومی و مورد انتظار) — `service_role` جایی نیست |

## ۴) این دور چه دیده شد (بدون نیاز به تغییر)
- هیچ یافتهٔ امنیتی یا منطقی‌ای که نیاز به اصلاح داشته باشد پیدا نشد؛ کد کلاینت تمیز است
  (`esc()` روی همهٔ ورودی‌ها، `URL.revokeObjectURL` برای رسانه‌ها، محدودیت ۸MB،
  پذیرش `jpeg/png/webp/heic`، احترام به `prefers-reduced-motion`).
- نکتهٔ ظریف که مستند می‌شود: `index.html` (نسخهٔ محلی) و `team/` (نسخهٔ سروری) دو محصول جدا هستند؛
  تغییرات باید آگاهانه در یکی از آن‌ها اعمال شود، نه هر دو، وگرنه دو منبع حقیقت می‌سازد.

## ۵) کارهای باز / پیشنهاد بعدی
- [ ] **P0 نقشهٔ راه:** وصل‌کردن Vercel به همین مخزن (Root = `viking-team`) و بعد بایگانی مخزن قدیمی.
- [ ] تست خودکار RLS در CI: اعمال `sql/*.sql` روی یک پروژهٔ staging و بررسی اینکه
      کاربر غیرعضو هیچ ردیفی نمی‌بیند و تریگر سقف ۵ عضو عضو ششم را رد می‌کند.
- [ ] دعوت ۴ عضو و آزمون واقعی آپلود HEIC از آیفون (معیار موفقیت نقشهٔ راه: ۵ حساب فعال).
- [ ] فعال‌سازی دوبارهٔ آپلود رسانه در `team/app.js` (اکنون فقط دانلود/جایگزینی/حذف روی رسانهٔ موجود).

## ۶) لاگ جریان (فقط اضافه می‌شود)
- **۲۰۲۶-۱۰-۱۴** — بازبینی کامل کلاینت/SQL و اجرای همهٔ گیت‌های پروژه (۹ تست سبز).
  یافتهٔ امنیتی/منطقی‌ای برای اصلاح نبود؛ بندهای باز بالا به‌عنوان گام بعدی ثبت شد.
- **۲۰۲۶-۱۰-۱۴ (گیت کامل monorepo)** — `node scripts/doctor.mjs viking-team`: **۴ تست Node + ۵ تست Python**، نحو کلاینت و guard نبود کلید مدیریتی همگی سبز؛ تأیید staging/RLS زنده هنوز باز است.

- **۲۰۲۶-۱۰-۱۴ (دور سراسری — قرارداد SQL به‌عنوان گیت)** — تا امروز فقط «اعلامِ» RLS تست می‌شد (`assertIn("enable row level security", SQL)`)؛ یک جدولِ تازه بدون RLS یا یک policy اعطاشده به `anon` از همهٔ گیت‌ها رد می‌شد.
  - `tests/test_sql_contract.py` (۱۰ تست) اضافه شد: هر `create table public.*` باید `alter table … enable row level security` متناظر داشته باشد؛ هر جدول حداقل یک policy؛ هیچ policy به `anon`/`public` اعطا نشود؛ **هر** policy باید `viking_is_active_member()` یا `viking_is_admin()` را صدا بزند؛ توابعِ `security definer` باید `search_path` میخ‌کوب‌شده داشته باشند و از `anon` بازگرفته (revoke) شوند؛ باکتِ `viking-private` خصوصی، محدود به ۸MB و محدود به همان چهار نوع MIME ایستا (شامل `image/heic`)؛ سقفِ پنج عضو باید `pg_advisory_xact_lock(2026,5)` پیش از شمارش، `raise exception` و `errcode 23514` داشته باشد؛ تابعِ تریگر `security invoker` باشد؛ اسکیمای بدون `drop table`/`truncate` و با `drop policy if exists` برای هر policy (Idempotent)؛ و هیچ ایمیلِ عضوی در SQL نباشد.
  - **اعتبارسنجیِ نگهبان با جهش (mutation test):** حذفِ یک خطِ RLS و تبدیلِ یک policy به `to anon, authenticated using (true)` در یک کپیِ موقت، دقیقاً ۲ تست را قرمز کرد — پس این گیت‌ها «سبزِ کاذب» نیستند.
  - شمار تست‌های پایتون **۵ → ۱۵**. **دستور تأیید:** `node scripts/doctor.mjs viking-team` → ۴ تست Node + **۱۵ تست پایتون** + سینتکسِ کلاینت + نگهبانِ نبود کلید سرویس، همگی سبز.
  - **محدودیت مهم:** این‌ها بررسیِ ایستای فایلِ `sql/` هستند، **نه** اثباتِ اینکه پروژهٔ staging واقعاً این اسکیما را دارد. برای آن باید `sql/*.sql` روی یک پروژهٔ آزمایشی اعمال و با نشستِ واقعی تست شود (دو بندِ بازِ بالا).
