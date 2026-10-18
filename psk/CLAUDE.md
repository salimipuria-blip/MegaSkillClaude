# MEGA SKILLS 3000 (psk) — دستور کار Claude

> وضعیت: زنده روی Vercel (`psk-3000`)، API با ENGINE_TOKEN قفل است، ۵۷ تست سبز، دقت مسیریاب ۱۰۰٪ روی مجموعهٔ طلایی | آخرین بازبینی: 2026-10-18
> فایل‌های جریان: `PROGRESS.md` (لاگ، فقط اضافه می‌شود) · `PROFESSIONAL_GUIDE.md` (ممیزی فنی همین دور) · `docs/` (معماری، امنیت، ارزیابی مسیریابی)
> ⚠️ «مگا اسکیل» یعنی پلاگین Claude Code (`plugins/mega-skills-router`)، **نه** این سایت.

```yaml
project:
  name: psk                      # MEGA SKILLS 3000 — سایت فارسیِ آیفون‌محور + موتور مسیریابی مهارت
  purpose: درخواست فارسی/انگلیسی → انتخاب مهارت از ۳٬۰۰۰ مهارت → «برنامه» یا «پاسخ» با مدل رایگان
  stack: Node >=20 ESM, zero runtime deps, Vercel serverless (api/*.js), static public/
  entrypoints:
    api: [api/health.js, api/skills.js, api/tasks.js]   # همه از api/_core.mjs (guard, route, plan)
    engine: [engine/router.mjs, engine/providers.mjs, engine/telemetry.mjs]
    ui: [public/index.html + app.js (روایت تصویری), public/engine-ui.js (موتور ۳۰۰۰), public/about.*, public/puria/]
  data:
    registry: data/skills-registry.json          # 3000 skills, 15000 triggers
    bodies: data/skills/**/SKILL.md              # 2990 verified (SHA-256 = id) + 10 repaired (allowlist) ; 0 missing/rejected
    allowlist: data/skills-repaired.json
  commands:                                      # همه در 2026-10-18 اجرا و سبز شدند (از psk/)
    check: npm run check                         # node --check روی همهٔ فایل‌های اجرایی
    test: npm test                               # 57 tests
    golden: npm run routing:golden               # 108 cases, byte-identical
    accuracy: npm run routing:accuracy           # top-1 100%, top-3 100% (floor 80%), safety 100%
    bench: npm run bench:routing                 # اختیاری؛ JSON به stdout
    dev: ENGINE_TOKEN=<24+ chars> npm run dev    # http://localhost:3000 (scripts/dev-server.mjs)
    doctor: node scripts/doctor.mjs psk          # از ریشهٔ مخزن؛ همهٔ گیت‌ها
  ci: .github/workflows/ci.yml job `psk` → npm run check && npm test (push به main بدون secret ENGINE_TOKEN شکست می‌خورد)
  deploy:
    platform: Vercel project psk-3000, Root Directory `psk`, framework Other
    trigger: push به main در salimipuria-blip/MegaSkillClaude
    url: https://psk-3000.vercel.app
    ignoreCommand: اگر psk/ از VERCEL_GIT_PREVIOUS_SHA تغییر نکرده → exit 0 (رد ساخت)؛ هر حالت دیگر exit 1 (ساخت). فقط 0/1 مجاز است.
    function: api/*.js, maxDuration 60s, includeFiles data/**
  secrets:                                       # فقط نام؛ مقدار هرگز در چت/مخزن
    ENGINE_TOKEN: [Vercel env (psk-3000), GitHub Actions secret]   # 24+ کاراکتر؛ تنظیم شد 2026-10-17
    optional_free_llm: [GROQ_API_KEY, CEREBRAS_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY]  # Vercel env
    optional: [PSK_TELEMETRY=1, PROVIDER_ORDER, <PROVIDER>_MODEL]
  status: live; /api/* → 401 بدون توکن (تأیید زنده 2026-10-18)؛ حالت «پاسخ» فقط وقتی کار می‌کند که یکی از کلیدهای مدل رایگان روی Vercel باشد
  owner_actions:
    - یک کلید مدل رایگان (ترجیحاً GROQ_API_KEY، حساب بدون کارت) در Vercel → psk-3000 → Environment Variables، سپس Redeploy
    - برچسب انسانی برای ۱۰۸ مورد مجموعهٔ طلایی (tests/fixtures/routing-labels.json)
```

## نقشهٔ کد
| مسیر | مسئولیت |
|---|---|
| `api/_core.mjs` | بارگذاری رجیستری یک بار در cold start؛ `guard()` (متد + Bearer با `timingSafeEqual`، fail-closed روی Vercel وقتی توکن <24)؛ `inputCheck` (۱–۴۰۰۰ کاراکتر)؛ `planOf`؛ `answerMessages` (متن مهارت = داده‌ی نامطمئن داخل `<skill>`) |
| `api/health.js` | شمارش‌ها، وضعیت محتوای مهارت، provider های تنظیم‌شده (بدون کلید) |
| `api/skills.js` | `GET ?q=` → حداکثر ۱۵ مهارت؛ q بیش از ۴۰۰۰ → 400 |
| `api/tasks.js` | `POST {input, mode: plan|answer}`؛ بدنه ≤12000 بایت؛ همه چیز در همان فراخوانی تمام می‌شود (بدون state) |
| `engine/router.mjs` | `normalize`/`tokens` (ی/ک عربی، ZWNJ، پسوند جمع، پل فارسی→انگلیسی)، `loadRegistry` (تأیید SHA-256 و جلوگیری از path traversal/symlink)، `routeSkills` (IDF + سیگنال‌های دامنه + جریمهٔ scope) |
| `engine/providers.mjs` | زنجیرهٔ فقط-رایگان Groq→Cerebras→Gemini→OpenRouter(`:free`)؛ timeout ۲۰s و deadline ۵۰s با AbortController؛ failover روی هر خطا |
| `engine/telemetry.mjs` | لاگ اختیاری allowlist‌شده (بدون متن پرسش/توکن/IP) |
| `scripts/dev-server.mjs` + `dev-shim.mjs` | شبیه‌ساز محلی Vercel |
| `scripts/routing-*.mjs`, `bench-routing.mjs` | golden، accuracy، بنچمارک |
| `tests/*.test.mjs` | router, routing-contract/signals/accuracy, cloud(API), telemetry, dev-shim, about, puria, hardening |

## قواعد سخت (MUST / NEVER)
```text
MUST  هر تغییر در engine/router.mjs → npm run routing:golden && npm run routing:accuracy ؛ اگر golden عوض شد، هر مورد تغییرکرده
      را دستی بررسی کن و فقط بعد `node scripts/routing-golden.mjs --write` ؛ دلیل را در PROGRESS بنویس.
MUST  برای هر سیگنال دامنهٔ جدید یک تست در tests/routing-signals.test.mjs با پرسش دقیق.
MUST  هر فیلد جدید پاسخ API از validated primitives ساخته شود؛ پیام خطا فارسی و بدون stack.
MUST  fetch بیرونی فقط با AbortController و deadline (الگوی providers.mjs).
NEVER fallback به مدل پولی؛ OpenRouter فقط مدل با پسوند ":free".
NEVER لاگ‌کردن متن پرسش، توکن، کلید، IP یا پاسخ مدل (telemetry فقط allowlist).
NEVER اجرای چیزی از SKILL.md؛ متن مهارت فقط مرجع است و با hash تأیید می‌شود. فایل data/skills را دستی ویرایش نکن (hash می‌شکند).
NEVER ENGINE_TOKEN یا کلیدها در کد، README، چت یا لاگ CI.
NEVER innerHTML با داده‌ی API در public/engine-ui.js (فقط textContent).
```

## اشکال‌زدایی
| نشانه | علت محتمل | بررسی | رفع |
|---|---|---|---|
| UI: «کلید دسترسی روی سرور تنظیم نشده» / API 503 | `ENGINE_TOKEN` در Vercel نیست یا <24 | `curl -s -o /dev/null -w '%{http_code}' https://psk-3000.vercel.app/api/health` (401 = توکن هست) | مالک مقدار ۲۴+ کاراکتری در Vercel بگذارد و Redeploy |
| API 401 با توکن درست | فاصله/خط اضافه در کپی، یا مقدار GitHub و Vercel متفاوت | طول توکن در UI | توکن را دوباره بدون فاصله وارد کن |
| حالت «پاسخ» → `NO_PROVIDER_CONFIGURED` | هیچ کلید مدل رایگانی در Vercel نیست | `/api/health` → `provider.configured` | owner_actions بالا |
| `PROVIDERS_EXHAUSTED` | سهمیهٔ رایگان/۵xx همهٔ provider ها | `task.error.attempts[].status` (429, timeout, invalid-json) | صبر؛ یا provider دوم اضافه شود؛ هرگز پولی |
| CI job `psk` روی main قرمز با «ENGINE_TOKEN secret is not set» | secret مخزن حذف شده | Settings → Secrets → Actions | مالک secret را دوباره بگذارد |
| golden mismatch | تغییر عمدی/ناخواستهٔ امتیازدهی | `npm run routing:golden` خروجی diff | بازبینی موردبه‌مورد؛ سپس `--write` |
| مهارت با `contentStatus: rejected` | فایل SKILL.md تغییر کرده و hash نمی‌خواند | `/api/health` → `skillContent.rejected` | فایل را از منبع برگردان یا به allowlist با hash جدید اضافه کن (با دلیل) |
| dev server با URL خراب | قبلاً crash می‌کرد (اصلاح 2026-10-18) | `curl localhost:3000/%E0%A4%A` → 400 | — |
| Vercel ساخت را رد کرد (Ignored) | psk/ تغییری نداشته — رفتار درست | لاگ Build | تغییر واقعی در psk/ یا Redeploy دستی |

## صف کار
- **P0** — کلید مدل رایگان روی Vercel (کار مالک). پذیرش: `POST /api/tasks {mode:"answer"}` → `status: completed`, `result.kind: llm-response`.
- **P1** — rate limit سبک برای `/api/tasks` (مثلاً ۳۰ درخواست/دقیقه به ازای توکن، in-memory per instance). پذیرش: تست که درخواست ۳۱ام 429 بگیرد؛ golden بدون تغییر.
- **P1** — برچسب‌های انسانی مجموعهٔ طلایی. پذیرش: `routing:accuracy` روی برچسب انسانی ≥ ۹۰٪ top-1 گزارش شود.
- **P2** — سقف بدنه بر حسب کاراکتر نه بایت (۴۰۰۰ کاراکتر CJK/۳بایتی الان به 413 می‌خورد). پذیرش: تست با ۴۰۰۰ کاراکتر `中` → 200.
- **P2** — تاریخچهٔ وظیفه/PWA (نیازمند تصمیم Supabase، `docs/FEATURE_STATUS.json`).

## پروتکل به‌روزرسانی
1. قبل از کار: همین فایل + انتهای `PROGRESS.md` را بخوان.
2. بعد از هر تغییر: `npm run check && npm test` (+ golden/accuracy اگر router عوض شد) و عددها را در این فایل (`commands`, وضعیت بالا) به‌روز کن.
3. یک بند تاریخ‌دار به انتهای `PROGRESS.md` اضافه کن (چه، چرا، شاهد تست). یافته‌ها/رفع‌ها در `PROFESSIONAL_GUIDE.md`.
4. تغییر مهم وضعیت → `docs/PORTFOLIO.md` ریشه هم به‌روز شود (هرمس از آن می‌خواند).
