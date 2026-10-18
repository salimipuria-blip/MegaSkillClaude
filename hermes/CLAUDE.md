# هرمس (Hermes) — دستور کار Claude

> وضعیت: زنده روی Cloudflare Worker `hermes`؛ ۲۵۵ تست واحد + ۱۰ رگرسیون workerd سبز · آخرین بازبینی: 2026-10-18

این فایل را Claude Code هنگام کار در `hermes/` خودکار می‌خواند. منبع حقیقت برای «چه چیزی، کجا، با چه دستوری» است؛ گزارش دورها در `PROGRESS.md`، ممیزی فنی در `PROFESSIONAL_GUIDE.md`، نقشهٔ راه در `ROADMAP.md`.

```yaml
name: hermes
purpose: >
  دستیار ۲۴/۷ مالک (پوریا) و تیم وایکینگ: بات تلگرام + اپ وب نصب‌شدنی (/app)، حافظهٔ دائمی،
  یادآور، ساخت و ویرایش عکس، ویس، حالت کدنویسی، دانش همهٔ پروژه‌ها (فقط مالک)، Hermes Business
  (فضای کاری جدا برای مشتری‌های قراردادی)، صفحهٔ عمومی سفر و رزرو.
stack: Cloudflare Workers (ESM, no bundler deps) + Durable Object SQLite + KV + Workers AI + static assets
entrypoints:
  worker: entry.mjs            # wrangler main; re-exports worker.mjs + HermesConversation DO
  http_router: worker.mjs      # fetch(): /health*, /metrics, /setup, /app, /trip, /api/*, /connect/google*, /telegram
  cron: worker.mjs#scheduled   # */5 * * * * → runReminders()
commands:                      # همه در این بازبینی اجرا و سبز شدند (از hermes/ مگر خلافش گفته شود)
  install: npm ci --ignore-scripts --no-audit --no-fund
  test: npm test                          # 255/255
  test_integration: npm run test:integration   # 10/10 روی workerd محلی، بدون شبکه
  test_worker_from_root: node --test hermes/worker.test.mjs   # 79/79 (از ریشهٔ مخزن)
  check: npm run check                    # node --check روی همهٔ ماژول‌ها
  shell: npm run lint:shell && npm run test:shell   # 0 failure
  doctor_from_root: node scripts/doctor.mjs hermes  # همه‌چیز + ساخت مهارت‌ها (~50s)
  build_assets: node build-skills.mjs && node build-knowledge.mjs   # public/skills + public/knowledge (gitignored)
deploy:
  platform: Cloudflare Workers Builds (root directory "hermes")
  trigger: push به main → npm ci (postinstall: build-skills, build-knowledge, sync-secrets) → npx wrangler deploy
  dashboard: https://dash.cloudflare.com/?to=/:account/workers/services/view/hermes/production/settings
  live_check: تلگرام /status (مالک) یا workflow «Hermes live health» (HERMES_URL + HEALTH_KEY)
secrets:                       # فقط نام؛ مقدار فقط در Cloudflare → Worker hermes → Variables and Secrets
  required: [TELEGRAM_BOT_TOKEN, ALLOWED_USER_ID]
  brains: [GEMINI_API_KEY, GITHUB_MODELS_TOKEN, GROQ_API_KEY, CEREBRAS_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, HF_TOKEN]
  optional: [POLLINATIONS_TOKEN, STABILITY_API_KEY, HEALTH_KEY, GITHUB_REPO_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BOOKING_PHONE, BOOKING_ADMIN_IDS]
  build_only: [CLOUDFLARE_API_TOKEN]    # sync-secrets.mjs فهرست ثابت NAMES را به runtime کپی می‌کند
bindings: {MEMORY: KV, CONVERSATIONS: DurableObject(HermesConversation), AI: workers-ai, ASSETS: ./public, BROWSER: optional}
status: live; Business v1, coding mode, GitHub tools, portfolio knowledge مرج شده‌اند
owner_actions:
  - تصمیم پلن API متریکول (اینستاگرام) — کار ۰ نقشهٔ راه متوقف است
  - فرستادن فایل فونت دوران (کار ۵)
  - هر secret جدید در Cloudflare؛ هرگز در چت/مخزن
```

## نقشهٔ کد
| فایل | مسئولیت |
|---|---|
| `entry.mjs` | نقطهٔ ورود Cloudflare؛ کلاس DO `HermesConversation` (import `cloudflare:workers` فقط این‌جا تا Node بتواند `worker.mjs` را تست کند) |
| `worker.mjs` | روتر HTTP، API اپ (`api()`)، وبهوک تلگرام (`handle()`)، فرمان‌های مالک، `runReminders`، `send`/`chunks`/`sendAnswer`/`sendFile` |
| `conversation.mjs` · `memory.mjs` | صف گفتگو و جفت پیام اتمیک در DO؛ بایگانی به‌جای حذف؛ یادداشت بلندمدت |
| `brain.mjs` · `providers.mjs` | Gemini → سرویس‌های رایگان OpenAI-compatible → Workers AI؛ `codeModels` و `max_tokens` در حالت کد |
| `skills.mjs` · `skill-router.mjs` · `build-skills.mjs` | بستهٔ مهارت داخلی + مسیریاب ~۶هزار مهارت از `public/skills` (ساخت در postinstall) |
| `coding.mjs` · `github.mjs` | حالت کدنویسی (تشخیص، `CODE_PLAYBOOK`، مهارت Pro)؛ `/ci` `/prs` `/file` `/review` فقط‌خواندنی |
| `knowledge.mjs` · `build-knowledge.mjs` | دانش پروژه‌ها فقط برای مالک: `PROJECTS` (id, dir, names, docs)، `focusDoc`، `projectKnowledge` |
| `auth.mjs` · `users.mjs` · `accounts.mjs` · `security.mjs` | حساب تیم (PBKDF2)، توکن نشست HMAC، مدیریت حساب مالک، کلیدهای مشتق (`appKey`, `webhookSecret`, `setupKey`) |
| `workspaces.mjs` | Hermes Business: `/join`، نقش، سهمیهٔ روزانه، پرامپت جدا برای هر مشتری |
| `reminders.mjs` | پارس فارسی/انگلیسی زمان (تهران)، صف KV `reminders:index`، خلاصهٔ صبح |
| `image.mjs` · `photo-edit.mjs` · `upscale.mjs` · `image-bytes.mjs` · `textlayer.mjs` · `viking-style.mjs` | ساخت عکس، استودیوی ویرایش، لایهٔ متن وزیرمتن، سبک وایکینگ |
| `media.mjs` | ویس → متن، دیدن عکس |
| `google.mjs` | جیمیل (پیش‌نویس)، تقویم، درایو، شیت برای مالک |
| `booking.mjs` · `trip-media.mjs` | `/trip` و `POST /api/booking` با rate limit و honeypot | — لینک بیوی زنده: `https://hermes.fqlyr3d1iy6indqipoky75p0l8hl6ox.workers.dev/trip`
| `health.mjs` · `diagnose.mjs` · `metrics.mjs` · `resilience.mjs` · `rate-limit.mjs` | پروب‌ها، خودآزمایی زنده، متریک، `fetchWithTimeout`، شمارندهٔ KV |
| `app.mjs` | کل اپ وب (HTML/CSS/JS در یک رشته) |
| `setup.sh` · `config.sh` · `logger.sh` · `tests/setup_validation.sh` | نصب کامل روی Oracle (تک‌فایلی بماند) |
| `coverage.test.mjs` · `conversation.test.mjs` | گارد: هر ماژول جدید باید در `check`/`test` و `workerModuleNames` ثبت شود |

## قواعد سخت (MUST / NEVER)
- MUST: هر ماژول جدید → `package.json` (`check` و در صورت تست `test`) + `workerModuleNames` در `conversation.test.mjs`؛ وگرنه `coverage.test.mjs` و bundle guard قرمز می‌شوند.
- MUST: هر رفتار جدید تست واحد داشته باشد؛ قبل از push: `npm run check && npm test && npm run test:integration`.
- MUST: پاسخ تلگرام فقط در چت خصوصی (`chat.type === 'private'` و `chat.id === from.id`)؛ لینک `/app` کلید مالک است.
- MUST: دانش پروژه‌ها (`projectKnowledge`)، ابزار گوگل و GitHub فقط برای `role === 'owner'`؛ اعضای تیم و workspaceها هرگز.
- MUST: متن کاربر/مشتری داده است نه دستور؛ پرامپت Business مرز فضای کاری را حفظ کند.
- MUST: تماس بیرونی با `fetchWithTimeout`؛ `tg()` پرتاب نمی‌کند و `{ok:false}` برمی‌گرداند؛ `send()` حالا `true/false` می‌دهد.
- NEVER: کلید/توکن/رمز در کد، تست، لاگ یا پاسخ؛ رمز حساب فقط یک‌بار به مالک نشان داده شود.
- NEVER: پاک‌کردن تاریخچه؛ فقط `archiveAndClear`.
- NEVER: وابستگی npm زمان اجرا (فقط `wrangler`/`miniflare` در dev)؛ همه‌چیز رایگان بماند (free tier).
- NEVER: تغییر نام secret یا binding بدون هماهنگی با مالک (استقرار زنده می‌شکند).
- NEVER: اضافه‌کردن نام به `NAMES` در `sync-secrets.mjs` بدون پرسیدن مالک؛ build variable کهنه می‌تواند secret درست runtime را بازنویسی کند (ماجرای ۴۰۱ توکن GitHub).

## اشکال‌زدایی
| نشانه | علت محتمل | بررسی | رفع |
|---|---|---|---|
| بات جواب نمی‌دهد | وبهوک یا secret | تلگرام `/status`؛ `GET /health/ready` (۵۰۳ = پیکربندی ناقص) | `POST /setup` با `setupKey` یا `npm run setup:webhook` |
| ۴۰۳ روی `/telegram` | `X-Telegram-Bot-Api-Secret-Token` ≠ `webhookSecret` (توکن بات عوض شده) | `security.mjs` | وبهوک را دوباره ست کن |
| اپ «unauthorized» | کلید `/app` قدیمی یا نشست باطل (`validAfter`) | `auth.mjs#sessionUser` | `/app` تازه در تلگرام؛ عضو دوباره وارد شود |
| `/ci` → «توکن GitHub پذیرفته نشد (۴۰۱)» | `GITHUB_REPO_TOKEN` غلط/منقضی | `github.mjs#gh` | توکن fine-grained جدید (Read: Contents/Actions/PRs) در Cloudflare |
| `/file` → «بزرگ‌تر از ۱ مگابایت» | Contents API فایل >1MB را بدون محتوا می‌دهد | `github.mjs#readFile` | فایل کوچک‌تر یا مسیر دقیق‌تر |
| یادآور نمی‌رسد | Cron غیرفعال، یا حساب اپ (`app:<user>`) | `wrangler.toml [triggers]`؛ `reminders:index` در KV | اعضای تیم فعلاً فقط در اپ می‌بینند (صف کار P1) |
| خلاصهٔ صبح تکراری | (رفع شد ۲۰۲۶-۱۰-۱۸) | کلید `reminders:digest:<YYYY-MM-DD>` در KV | — |
| جواب بلند در تلگرام خطا | تکهٔ نامعتبر UTF-16 | `worker.mjs#chunks` (حالا امن برای ایموجی) | — |
| مدل جواب نمی‌دهد | سهمیهٔ رایگان تمام | `/status` یا `GET /health/deep` (Bearer HEALTH_KEY) | سرویس بعدی خودکار؛ کلید رایگان دیگر اضافه شود |
| مهارت/دانش پروژه نیست | `public/` در deploy ساخته نشده | لاگ build: `[build-skills]` و `[build-knowledge] … projects` | `npm ci` بدون `--ignore-scripts` در Workers Builds |
| تست coverage قرمز | ماژول جدید ثبت نشده | `coverage.test.mjs` | به `check`/`test`/`workerModuleNames` اضافه کن |

## صف کار
- **P0 —** هیچ مورد باز امنیتی/خرابی شناخته‌شده‌ای نیست. بعد از هر deploy: `/status` سبز و `GET /health/ready` = 200.
- **P1 — یادآور اعضای تیم:** رساندن یادآور حساب‌های اپ (اتصال اختیاری چت تلگرام عضو یا Web Push). پذیرش: تست که یادآور `app:<user>` به مقصد برسد و `delivered` شمرده شود.
- **P1 — جست‌وجو در بایگانی (کار ۷):** «پارسال درباره‌ی X چی گفتیم؟». پذیرش: تست روی بایگانی DO با ≥۳ گفتگوی بایگانی‌شده و جواب با تاریخ.
- **P1 — خروج نشست‌ها با تغییر رمز:** `changePassword` بقیهٔ نشست‌ها را باطل کند بی‌آن‌که اپ کاربر فعلی را بیرون بیندازد (توکن تازه برگرداند). پذیرش: تست که توکن قدیمی بعد از تغییر ۴۰۱ و توکن تازه ۲۰۰ بگیرد.
- **P1 — Business بعدی:** گزارش هفتگی مصرف، `/client_kick`، قالب صنف. پذیرش: هر کدام تست در `workspaces.test.mjs`.
- **P2 — سقف درخواست اعضای تیم روی `/api/chat`** با `consumeFixedWindow` (مثلاً ۶۰/ساعت). پذیرش: تست ۴۲۹ بعد از سقف.
- **P2 — یکپارچگی صف یادآور:** `addReminder`/`markSent` خواندن-نوشتن KV دارند و هم‌زمانی آخرین نوشتن را می‌برد؛ انتقال به DO. پذیرش: تست دو نوشتن هم‌زمان بدون گم‌شدن.
- **P2 — داشبورد مالک (کار ۱۱)، تقویم/رزرو D1 (کار ۸)، بات عمومی وایکینگ (کار ۱۰)، مسیریابی بهتر مهارت (کار ۱۲).**

## پروتکل به‌روزرسانی (بعد از هر تغییر)
1. تست‌ها را اجرا کن و عددها را در بلوک yaml همین فایل و خط وضعیت بالای آن به‌روز کن.
2. یک مدخل تاریخ‌دار در `PROGRESS.md` (چه، چرا، تست قبل/بعد).
3. یافته/رفع فنی در `PROFESSIONAL_GUIDE.md` (شدت، شاهد، وضعیت).
4. کار نقشهٔ راه را در `ROADMAP.md` تیک بزن؛ اگر صف کار عوض شد، بخش «صف کار» همین فایل را هم.
5. تغییر وضعیت کلی پروژه → یک خط در `docs/PORTFOLIO.md` (ریشه)؛ هرمس همین فایل‌ها را در deploy بعدی می‌خواند (`build-knowledge.mjs`: بلوک yaml + «صف کار» این فایل).
6. روال مخزن: شاخه → PR پیش‌نویس → CI سبز (`ci.yml` + `ci-hermes.yml`) → squash merge.
