# Viking Experience Command (viking-team) — دستور کار Claude

> وضعیت: کلاینت تیم و SQL/RLS تست‌شده؛ اعمال روی Supabase واقعی و آزمون ورود/آپلود آیفون هنوز باز است · آخرین بازبینی: 2026-10-18

```yaml
name: viking-team
purpose: >
  فضای کار خصوصی تیم اجرایی وایکینگ آفرود (حداکثر ۵ عضو فعال): سفرها، وظایف، تجربه‌ها،
  گزارش‌ها و آرشیو عکس خصوصیِ وابسته به سفر.
stack: Static HTML + ES module (بدون build) + Supabase (Auth, Postgres RLS, Storage) از CDN
entrypoints:
  team_app: team/index.html + team/app.js + team/styles.css    # محصول اصلی، مسیر /team/
  legacy: index.html + sw.js + manifest.webmanifest            # نسخهٔ محلی قدیمی (localStorage)، مسیر /
  preview: preview.html                                       # پیش‌نمایش طراحی، بی‌داده
  sql: sql/viking_supabase_schema.sql, sql/viking_limit_five_active_members.sql
  motion: motion/                                             # پروژهٔ جدا (ویدئو)، PROGRESS خودش را دارد
commands:            # همه از viking-team/ ، تأییدشده 2026-10-18
  node_tests: node --test tests/*.test.mjs                    # 11 pass (media 6 + team 5)
  python_tests: python3 -m unittest discover -s tests         # 15 OK (static 5 + sql contract 10)
  syntax: node --check --input-type=module < team/app.js
  secrets_guard: "! grep -R -E 'service_role|sb_secret_' team"
  all_gates: node scripts/doctor.mjs viking-team               # از ریشهٔ مخزن
deploy:
  host: Vercel (Root Directory = viking-team)، با هر push به main
  skip_rule: vercel.json ignoreCommand — فقط exit 0/1؛ اگر پوشه تغییر نکرده رد می‌شود
  ci: .github/workflows/ci.yml job viking-team (فایل viking-team/.github/... در این monorepo اجرا نمی‌شود؛ فقط مرجع)
secrets:
  browser: SUPABASE_URL + anon KEY داخل team/app.js (عمومی و مجاز؛ امنیت با RLS)
  never_in_repo: service_role, sb_secret_*, رمز اعضا، ایمیل اعضا
  supabase_project: aupkeramhsufnmhkbihl
status:
  client: تمیز؛ esc روی همهٔ ورودی‌ها، کش URL عکس‌ها، تشخیص HEIC آیفون
  database: فایل‌های SQL قرارداد-تست‌شده‌اند؛ اعمالشان روی پروژهٔ واقعی تأیید نشده
owner_actions:
  - اجرای sql/viking_supabase_schema.sql سپس sql/viking_limit_five_active_members.sql در SQL Editor پروژه
  - افزودن ردیف مدیر اول با ایمیل واقعی (خارج از مخزن)
  - روشن نگه‌داشتن Auth → Email → "Confirm email" (وگرنه هرکس با ایمیل دعوت‌شده ثبت‌نام کند وارد می‌شود)
  - Auth → URL Configuration: Site URL و Redirect URL = <دامنهٔ Vercel>/team/
  - آزمون واقعی: ورود ۵ حساب و آپلود HEIC از آیفون
```

## نقشهٔ کد
| فایل | مسئولیت |
|---|---|
| `team/app.js` | کل منطق: `init` (بارگیری supabase-js از esm.sh و fallback jsdelivr)، `enter`/`leave` (بررسی عضویت در `viking_team_members`)، `refresh` هر ۲۰ ثانیه، `render`/`recordCard`، ویرایشگر `openEdit`/`saveEdit`، رسانه (`mediaKind`، `mediaUrl`، `renderPhotos`، `uploadFile`، `replacePhoto`، `deletePhoto`)، اعضا (`invite`، `changeMember`) |
| `team/index.html` | پوستهٔ RTL، ۸ view با `id="view-*"` و ناوبری `data-view`، شیت ویرایش |
| `team/styles.css` | ریسپانسیو (`@media(max-width:700px)`)، `safe-area-inset`، `prefers-reduced-motion` |
| `sql/viking_supabase_schema.sql` | ۳ جدول `viking_*` + RLS + توابع `viking_is_active_member()`/`viking_is_admin()` + باکت خصوصی `viking-private` (۸MB، jpeg/png/webp/heic) |
| `sql/viking_limit_five_active_members.sql` | تریگر سقف ۵ عضو فعال با `pg_advisory_xact_lock(2026,5)` و `errcode 23514` |
| `tests/media.test.mjs`، `tests/team.test.mjs` | اجرای کد واقعی `app.js` در `vm` با DOM/Supabase ساختگی (مرز: `$('loginForm').addEventListener`) |
| `tests/test_static.py`، `tests/test_sql_contract.py` | یکپارچگی HTML/JS/CSS و قرارداد RLS |

## قواعد سخت (MUST / NEVER)
```text
MUST  هر ورودی کاربر قبل از innerHTML از esc() رد شود (title, payload.*, email, display_name).
MUST  تابع‌های قابل تست بالای خط `$('loginForm').addEventListener` بمانند؛ تست‌ها فقط آن بخش را اجرا می‌کنند.
MUST  هر جدول جدید: enable row level security + policy با viking_is_active_member()/viking_is_admin().
MUST  هر تابع security definer: set search_path = '' و revoke از public, anon.
MUST  SQL ناویرانگر و تکرارپذیر بماند: create ... if not exists، drop policy if exists؛ بدون drop table/truncate.
MUST  نوع فایل آپلود فقط از mediaKind(file) بیاید؛ فهرست MIME در app.js، SQL bucket و check جدول یکی باشد.
MUST  بعد از هر تغییر: node --test + unittest + syntax + secrets guard سبز.
NEVER service_role / sb_secret_ / ایمیل یا رمز عضو در مخزن یا کلاینت.
NEVER کش کردن /team/، API، blob یا درخواست cross-origin در sw.js.
NEVER تغییر هم‌زمان index.html (legacy) و team/ برای یک قابلیت؛ دو محصول جدا هستند.
NEVER نوشتن «انجام شد» برای اعمال SQL یا آپلود آیفون بدون آزمون روی پروژهٔ واقعی.
```

## اشکال‌زدایی
| نشانه | علت محتمل | بررسی | رفع |
|---|---|---|---|
| «اتصال سرویس ورود برقرار نشد» | esm.sh/jsdelivr در شبکهٔ ایران بسته | DevTools → Network روی `@supabase/supabase-js@2.49.0` | VPN یا vendor کردن کتابخانه (صف P1) |
| «این ایمیل هنوز… دعوت نشده» | ردیف در `viking_team_members` نیست یا `active=false` یا ایمیل با حروف بزرگ ذخیره شده | `select * from viking_team_members` | insert با `lower(trim(email))`؛ check constraint حروف بزرگ را رد می‌کند |
| «مجوز تیم بررسی نشد: relation … does not exist» | SQL روی پروژه اعمال نشده | SQL Editor → Tables | اجرای دو فایل `sql/` به ترتیب |
| آپلود: «فرمت عکس پشتیبانی نمی‌شود» | MIME غیرعکس (GIF، ویدئو) | `file.type`/`file.name` در کنسول | فقط JPG/PNG/WebP/HEIC؛ HEIF و نوع خالی آیفون با `mediaKind` نگاشت می‌شوند |
| آپلود: `mime type ... is not supported` از Storage | `allowed_mime_types` باکت با کد یکی نیست | `select allowed_mime_types from storage.buckets where id='viking-private'` | اجرای دوبارهٔ بخش bucket در schema |
| عکس HEIC در Chrome/Android خالی | مرورگر HEIC را نمایش نمی‌دهد | alt تصویر پیام Safari را نشان می‌دهد | دانلود؛ یا تبدیل سمت سرور (صف P2) |
| حذف سفر: پیام «به وظیفه… وصل است» | FK `on delete restrict` از رکوردها/رسانه | فیلتر رکوردهای با همان `trip_id` | جدا کردن رکوردها/عکس‌ها از سفر، بعد حذف |
| «Viking team is limited to five active members» | تریگر سقف ۵ | شمار `active=true` | تعلیق یک عضو |
| مصرف داده بالا در گالری | (رفع‌شده 2026-10-18) هر ۲۰ ثانیه همهٔ عکس‌ها دوباره دانلود می‌شد | `mediaUrls` در `app.js` | کش `storage_path → objectURL`؛ فقط حذف‌شده‌ها revoke می‌شوند |

## صف کار
- **P0 — اعمال روی Supabase واقعی (مالک + Claude):** اجرای دو فایل SQL و ردیف مدیر اول. پذیرش: کاربر غیرعضو در `viking_workspace_records` صفر ردیف می‌بیند؛ ششمین `active=true` با `23514` رد می‌شود؛ مدیر ورود موفق دارد.
- **P0 — Confirm email:** پذیرش: در Auth Settings روشن است (اسکرین‌شات مالک) و ثبت‌نام بدون تأیید نشست نمی‌دهد.
- **P0 — آزمون آیفون:** پذیرش: یک HEIC و یک JPG از Safari آیفون آپلود، دیده و دانلود شوند؛ ۵ حساب فعال.
- **P1 — vendor کردن supabase-js:** کپی نسخهٔ pin‌شدهٔ `+esm` در `team/vendor/` و حذف وابستگی به esm.sh. پذیرش: صفحه بدون دسترسی به esm.sh/jsdelivr وارد می‌شود.
- **P1 — CSP در `vercel.json` برای `/team/`:** `default-src 'self'; connect-src 'self' https://aupkeramhsufnmhkbihl.supabase.co; img-src 'self' blob: data:` (پس از P1 قبلی و حذف اسکریپت inline). پذیرش: ورود و گالری بدون خطای CSP در Safari و Chrome.
- **P1 — تست RLS زنده در CI:** اجرای `sql/*.sql` روی Postgres موقت با stub `auth.jwt()` و آزمودن عضو/غیرعضو/مدیر. پذیرش: job جدا در CI سبز.
- **P2 — manifest جدا برای `/team/`:** الان `start_url` و `scope` = `/` (legacy). پذیرش: «افزودن به صفحهٔ اصلی» از /team/ مستقیم اپ تیم را باز کند.
- **P2 — هم‌راستایی رنگ با برند** (مشکی + نارنجی `#F28A1E`؛ اکنون سبز تیره). فقط با تأیید طراحی مالک.
- **P2 — جلوگیری از غیرفعال کردن آخرین مدیر** (policy/trigger). پذیرش: update `active=false` روی تنها admin خطا بدهد.

## پروتکل به‌روزرسانی
1. قبل از کار: همین فایل و انتهای `PROGRESS.md` را بخوان.
2. هر باگ: اول تست قرمز در `tests/team.test.mjs` یا `tests/media.test.mjs` (اجرای کد واقعی)، بعد رفع، بعد همهٔ گیت‌ها.
3. بعد از کار: یک ورودی تاریخ‌دار به `PROGRESS.md` (چه، چرا، شمار تست‌ها، چه چیزی تأیید نشد)؛ یافته‌های فنی در `PROFESSIONAL_GUIDE.md`؛ اگر فرمان/مسیر/وضعیت عوض شد، بلوک yaml و جدول‌های همین فایل.
4. تغییر وضعیت کلی پروژه → `docs/PORTFOLIO.md` (منبع دانش هرمس) هم به‌روز شود.
