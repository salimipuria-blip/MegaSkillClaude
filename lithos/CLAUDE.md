# Lithos (Live Intelligence) — دستور کار Claude

> وضعیت: کد و تست سبز (۱۶ تست Node + قرارداد SQL)، ولی **پروژهٔ Supabase زنده (`aupkeramhsufnmhkbihl`) از این محیط رکورد DNS ندارد** و کوئری Buffer هنوز تأیید نشده · آخرین بازبینی: 2026-10-18

```yaml
name: lithos
purpose: داشبورد خصوصی مالک — آمار اینستاگرام از Buffer، KPI و لیدها؛ «هیچ عدد ساختگی»
stack:
  frontend: index.html (یک فایل، اسکریپت inline، supabase-js 2.58.0 از jsDelivr با SRI) → vite 6.4.4 build → dist/
  api: api/buffer-sync.js (Vercel Function, Node 22, POST /api/buffer-sync, maxDuration 30s)
  data: Supabase https://aupkeramhsufnmhkbihl.supabase.co (publishable key در کلاینت؛ RLS نگهبان داده)
entrypoints: [index.html, api/buffer-sync.js, supabase/schema.sql]
commands:   # همه در 2026-10-18 اجرا و سبز شدند
  install: npm install                       # از داخل lithos/
  syntax: node --check api/buffer-sync.js
  test: npm test                             # 16/16 (8 API + 8 dashboard)
  build: npm run build                       # dist/index.html 10.30 kB (gzip 4.23 kB)
  sql: DATABASE_URL=postgresql://… bash supabase/tests/run.sh   # قرارداد owner-only روی Postgres یک‌بارمصرف
  doctor: node scripts/doctor.mjs lithos     # از ریشهٔ مخزن
deploy:
  vercel_project: lithos-live-intelligence-vercel-fixed   # Root Directory = lithos
  ci: .github/workflows/ci.yml job "lithos" (npm install, node --check, npm test, npm run build)
  skip: vercel.json ignoreCommand — بدون تغییر در lithos/ ساخت رد می‌شود (فقط exit 0/1)
secrets:
  BUFFER_API_KEY: Vercel env (secret)        # فقط سرور
  LITHOS_OWNER_EMAILS: Vercel env (allowlist, required; خالی = همه 403)
status:
  ok: [owner gate سمت سرور, timeout همهٔ fetchها, SRI, رد اسنپ‌شات صفر, خطای هر منبع در UI]
  blocked: [Supabase زنده در دسترس نیست, شکل پاسخ Buffer GraphQL تأییدنشده]
owner_actions:
  - Supabase Dashboard: پروژهٔ aupkeramhsufnmhkbihl را باز کن (Paused/Deleted؟) و Restore کن؛ اگر رفته، پروژهٔ تازه + اجرای supabase/schema.sql
  - Vercel → lithos-live-intelligence-vercel-fixed → Env: LITHOS_OWNER_EMAILS=<ایمیل ورود Magic Link مالک>
  - یک sync دستی با BUFFER_API_KEY واقعی تا شکل پاسخ Buffer ثبت شود
```

## نقشهٔ کد
| مسیر | مسئولیت |
|---|---|
| `index.html` | کل UI: ورود Magic Link (`shouldCreateUser:false`)، `refresh()` چهار کوئری با بررسی `error` هر منبع، `sync()`، خط تازگی `#asOf` |
| `api/buffer-sync.js` | `validate()` (کاربر Supabase) → `assertOwner()` (allowlist) → `gql()` Buffer → `rpc('lithos_ingest_buffer_snapshot')`؛ خطا → `lithos_set_buffer_sync_state('error')`. بخش پایانی برچسب `RECONSTRUCTED` دارد |
| `supabase/schema.sql` | بازسازی تست‌شدهٔ قرارداد: ۴ جدول، `lithos_owners`، `lithos_is_owner()`، RLS فقط‌مالک، دو RPC امن (`security definer`, `search_path=''`) |
| `supabase/tests/` | `00_supabase_stub.sql` (نقش‌ها و `auth.uid()`)، `10_owner_only.sql` (مالک/غیرمالک/anon)، `run.sh` |
| `tests/buffer-sync.test.mjs` | API با fetch ماک: ذخیره، نبود کلید، 401/405، پاسخ خالی، غیرمالک 403، allowlist خالی، 503، deadline |
| `tests/dashboard.test.mjs` | قرارداد متنی `index.html`: بررسی خطا، asOf، نبود کلید سرویس، pin+SRI، شمارش لید سمت سرور، catch در sync |
| `vercel.json` | maxDuration، هدرهای امنیتی، ignoreCommand |
| `.env.example` | نام متغیرها بدون مقدار |

## قواعد سخت (MUST / NEVER)
```text
MUST  هر مسیر sync قبل از تماس با Buffer یا RPC از validate() و assertOwner() رد شود (fail closed).
MUST  هر fetch بیرونی signal: deadline() داشته باشد (10s < maxDuration 30s).
MUST  «صفر واقعی» از «داده نیامد» جدا بماند: پاسخ خالی Buffer → 502 BUFFER_SHAPE_UNVERIFIED، هیچ insert.
MUST  هر پاسخ Supabase در index.html قبل از رندر برای .error با نام منبع بررسی شود.
MUST  هر اسکریپت CDN نسخهٔ دقیق + integrity داشته باشد؛ هش را از tarball رسمی npm بگیر و با فایل CDN cmp کن.
MUST  بعد از ویرایش index.html نحو اسکریپت inline را جدا چک کن (فرمان در «اشکال‌زدایی»).
NEVER کلید service_role یا sb_secret_ یا BUFFER_API_KEY در index.html / dist / مخزن.
NEVER نوشتن مستقیم snapshot یا sync_state از مرورگر — فقط از RPCهای security definer.
NEVER اجرای schema.sql روی پروژه‌ای که جدول Lithos دارد بدون diff قبلی.
NEVER حذف برچسب RECONSTRUCTED / TODO(verify) پیش از یک sync واقعی موفق و ثبت شکل پاسخ.
```

## اشکال‌زدایی
| نشانه | علت محتمل | بررسی | رفع |
|---|---|---|---|
| همهٔ کارت‌ها «—»، toast `Network error` | Supabase در دسترس نیست | `getent hosts aupkeramhsufnmhkbihl.supabase.co` (2026-10-18: خالی) | Restore پروژه در داشبورد Supabase یا پروژهٔ تازه + `schema.sql` و عوض‌کردن `U`/`K` در `index.html` و `api/buffer-sync.js` |
| `Stale — last good data` با `insights: permission denied` | کاربر در `lithos_owners` نیست یا RLS عوض شده | `select * from lithos_owners` با SQL Editor | `insert into lithos_owners(user_id) select id from auth.users where email='…'` |
| Sync → `403 LITHOS_OWNER_EMAILS not configured` | env در Vercel خالی | Vercel → Env | مقدار بده و Redeploy |
| Sync → `403 Not a Lithos owner` | ایمیل نشست در allowlist نیست (حروف بزرگ مهم نیست) | ایمیل ورود را با env مقایسه کن | ایمیل درست را اضافه کن |
| Sync → `503 Supabase auth unreachable` | قطعی Supabase | همان بررسی DNS بالا | منتظر/Restore؛ کد درست است |
| Sync → `502 BUFFER_SHAPE_UNVERIFIED` | کوئری `account{channels{metrics}}` با API واقعی نمی‌خواند یا اسکوپ توکن | پاسخ خام را بدون توکن لاگ کن | کوئری را با مستند Buffer اصلاح کن + تست ماک تازه |
| Sync → `502 An authentication JWT…` | `BUFFER_API_KEY` نامعتبر | `curl -X POST https://api.buffer.com` بدون توکن همین را می‌دهد | توکن تازه از Buffer |
| صفحه سفید، `supabase is not defined` | SRI نخواند (فایل CDN عوض شد) | Console: `Failed to find a valid digest` | هش را دوباره از tarball بساز؛ هرگز integrity را حذف نکن |
| خطای نحو فقط در مرورگر | اسکریپت inline یک‌خطی | `python3 -c "import re,pathlib;print(re.search(r'<script>(.*?)</script>', pathlib.Path('index.html').read_text(), re.S).group(1))" > /tmp/l.mjs && node --check /tmp/l.mjs` | اصلاح و تکرار |

## صف کار
- **P0 — احیای داده:** پروژهٔ Supabase زنده پاسخ دهد. پذیرش: `curl -s https://<ref>.supabase.co/auth/v1/health -H "apikey: <publishable>"` → 200 و داشبورد با ورود مالک `Live · updated` نشان دهد.
- **P0 — LITHOS_OWNER_EMAILS در Vercel:** پذیرش: sync دستی مالک ≠ 403؛ یک حساب دیگر → 403.
- **P1 — تأیید قرارداد Buffer:** یک sync واقعی؛ پذیرش: پاسخ 200، اعداد = پنل Buffer (±0)، حذف `TODO(verify)` و `RECONSTRUCTED` + تست ماک با پاسخ واقعی (بدون داده شخصی).
- **P1 — diff اسکیما:** خروجی `pg_dump --schema-only` پروژهٔ زنده با `supabase/schema.sql` مقایسه و هر اختلاف در همین فایل ثبت شود.
- **P1 — sync زمان‌بندی‌شده:** Vercel Cron روزانه؛ پذیرش: ردیف `lithos_sync_state.updated_at` کمتر از ۲۵ ساعت.
- **P2 — CSP:** `Content-Security-Policy` با `script-src 'self' 'unsafe-inline' cdn.jsdelivr.net`؛ پذیرش: smoke مرورگر بدون خطای CSP.
- **P2 — job SQL در CI:** سرویس Postgres در `ci.yml` و اجرای `supabase/tests/run.sh`.

## پروتکل به‌روزرسانی
1. قبل از کار: همین فایل + بخش آخر `PROGRESS.md` را بخوان؛ `npm test && npm run build` را اجرا کن و عدد پایه را ثبت کن.
2. هر رفع = تست رگرسیونی که روی کد قبلی شکست بخورد (مثل این دور: ۴ تست روی کد قدیم قرمز شد).
3. بعد از کار: بلوک `yaml` (commands با شمارش واقعی، status، owner_actions) و جدول‌ها را به‌روز کن؛ ورودی تاریخ‌دار به `PROGRESS.md` اضافه کن؛ `PROFESSIONAL_GUIDE.md` را ممیزی همین دور کن.
4. هر فرمان که اینجا می‌نویسی باید همان روز اجرا شده باشد؛ چیزی که تست نشده با «تأییدنشده» علامت بخورد.
