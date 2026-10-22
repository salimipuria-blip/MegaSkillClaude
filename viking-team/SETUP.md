# راه‌اندازی Supabase برای وایکینگ — چک‌لیست مالک

این فایل فقط کارهایی را فهرست می‌کند که **بیرونِ مخزن** و فقط توسط مالک انجام می‌شوند؛ هیچ‌کدام
از داخل ریپو یا CI قابلِ اجرا/تأیید نیستند (دسترسی زنده لازم است). ترتیب مراحل اجباری است:
فایل دوم روی جدولی تریگر می‌سازد که فایل اول ایجاد می‌کند.

هر عدد و مسیرِ این چک‌لیست با نگهبانِ `tests/test_repo_normalization.py` قفل است: هر فایلی که اینجا
نام برده می‌شود باید واقعاً وجود داشته باشد، وگرنه تست قرمز می‌شود.

## پیش‌نیازها

- پروژهٔ Supabase: `aupkeramhsufnmhkbihl` (همان URL که در `team/app.js` است).
- دسترسی به **SQL Editor** همان پروژه (برای مدیرِ اول به نقشِ service_role نیاز است).
- ایمیلِ واقعیِ مدیرِ اول — هرگز داخل مخزن کامیت نشود.
- دامنهٔ Vercel صفحهٔ تیم (برای Redirect URL).
- توصیهٔ خودِ فایل SQL: اول روی یک پروژهٔ staging اجرا و مرور شود؛ اجرای موفق، اثباتِ پیکربندیِ production نیست.

## گام ۱ — `sql/viking_supabase_schema.sql`

در SQL Editor اجرا شود. چه می‌سازد (همه idempotent):

- سه جدول: `viking_team_members`، `viking_workspace_records`، `viking_trip_media` — هر سه با
  `enable row level security`.
- دو تابعِ اجازه: `viking_is_active_member()` و `viking_is_admin()`.
- policyهای عضو/مدیر روی هر سه جدول (خواندن برای عضوِ فعال؛ افزودن/ویرایش/حذفِ ردیفِ اعضا فقط توسط مدیر).
- باکت خصوصی `viking-private` با سقف `8388608` بایت و فقط
  `image/jpeg`, `image/png`, `image/webp`, `image/heic` + سه policy روی `storage.objects`
  (خواندن/آپلود فقط زیر پوشهٔ `trips`/حذف، همه مشروط به عضوِ فعال).

## گام ۲ — `sql/viking_limit_five_active_members.sql`

بعد از گام ۱ اجرا شود (تریگر به `viking_team_members` نیاز دارد):

- تابع `viking_enforce_five_active_members()` + تریگر `viking_five_active_members`
  به‌صورت `before insert or update of active, email` روی هر ردیف.
- ششمین عضو با `active = true` ⇒ خطای `23514` با پیامِ «Viking team is limited to five active members».
- تابع از `public`, `anon`, `authenticated` revoke می‌شود (فقط از مسیر تریگر اجرا می‌شود).

## گام ۳ — ردیف مدیرِ اول

بدونِ این ردیف هیچ‌کس نمی‌تواند عضو اضافه کند (policy درجِ عضو مشروط به `viking_is_admin()` است).
مالک با ایمیلِ واقعیِ خودش، در SQL Editor:

```sql
insert into public.viking_team_members (email, role, active)
values ('<ایمیل-واقعی-مدیر>@example.com', 'admin', true)
on conflict (email) do update set role = 'admin', active = true;
```

ایمیل را در هیچ فایلِ مخزن، issue، PR یا لاگی ننویسید؛ فقط در کنسولِ Supabase.

## گام ۴ — Confirm email را روشن نگه دارید

`Auth → Providers → Email → Confirm email = ON`.
دلیل امنیتی: policyها به `auth.jwt()->>'email'` تکیه دارند؛ اگر تأییدِ ایمیل خاموش باشد، **هرکس**
می‌تواند با ایمیلِ یک عضوِ دعوت‌شده ثبت‌نام کند و پیش از عضوِ واقعی نشست بگیرد.

## گام ۵ — URL Configuration

`Auth → URL Configuration`: مقدارِ Site URL و Redirect URL = `<دامنهٔ Vercel>/team/`
(مسیرِ واقعیِ صفحهٔ تیم؛ بدونِ آن، بازگشت از ایمیلِ تأیید به صفحهٔ خطا می‌رسد).

## گام ۶ — کلیدها

- کلاینت فقط کلید publishable/anon می‌گیرد: `team/app.js` (خطِ `SUPABASE_URL` و `KEY`).
- کلید service_role هرگز به مرورگر، به ریپو یا به این سند نیاید؛ گامِ ۳ فقط در کنسول اجرا می‌شود.
- پیش از هر PR: `python3 scripts/scan_secrets.py` باید پاک باشد.

## راستی‌آزمایی بعد از راه‌اندازی (پذیرش)

| # | آزمون | انتظار |
|---|---|---|
| ۱ | ورود با حسابی که در `viking_team_members` نیست | در `viking_workspace_records` **صفر ردیف** می‌بیند (خطا نه، ردیفِ خالی) |
| ۲ | افزودن ششمین عضو با `active = true` | رد می‌شود با کدِ `23514` |
| ۳ | ورود مدیر | موفق و می‌تواند عضو اضافه/غیرفعال کند |
| ۴ | ثبت‌نام بدون تأییدِ ایمیل | نشست نمی‌دهد |
| ۵ | آپلود HEIC از آیفون به `viking-private/trips/…` | موفق؛ باکت عمومی نیست |
| ۶ | اجرای دوبارهٔ هر دو فایل SQL | بدون خطا (idempotent) و بدونِ تغییرِ داده |

## NOT RUN (از داخل این ریپو ممکن نیست)

- اجرای واقعیِ SQL روی پروژهٔ Supabase، ساختِ مدیرِ اول، تنظیمات Auth، و همهٔ شش آزمونِ بالا.
- اسکرین‌شاتِ تنظیمات (مالک باید ضمیمه کند).
- تستِ روی دستگاهِ واقعی (آیفون/HEIC) و دامنهٔ واقعیِ Vercel.

وضعیتِ اندازه‌گیری‌شدهٔ نرم‌افزارِ این پروژه (تعداد تست‌ها و آنچه اجرا شده) در
`docs/directives/05-viking-team.md` بخشِ «وضعیتِ جاری» است.
