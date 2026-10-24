# Professional Guide — hermes (ممیزی فنی)

> Auto-maintained: هر دور بازبینی یا رفع اشکال، یک بخش تاریخ‌دار بالای قبلی اضافه شود (یافته، شاهد، رفع، تست).
> دستور کار و نقشهٔ کد: `CLAUDE.md` · گزارش دورها: `PROGRESS.md` · نقشهٔ راه: `ROADMAP.md`.
> آخرین ممیزی: **2026-10-24**.

## ممیزی 2026-10-24 — اپ وب روی موبایل (گزارش مالک: «موقع اسکرول باگ داره»)
| # | شدت | یافته | شاهد | وضعیت |
|---|---|---|---|---|
| 1 | 🟠 | نقشهٔ توانایی‌ها بعد از کشیدن صفحه کوچک و به چپ رانده می‌ماند و نوار STANDBY غیب می‌شد | اسکرین‌شات مالک در مرورگر داخلی تلگرام (iOS): `layout()` اندازه را از `innerWidth/innerHeight` در میانهٔ ژست (کشیدن شیت/جمع‌شدن نوار ابزار) می‌خواند و رویداد `resize` بعدی نمی‌آمد | ✅ رفع: اندازه از `#stage` ثابت، رد اندازهٔ گذرا (<240×300)، `ResizeObserver` روی صفحه + `visualViewport` + `pageshow` + نگهبان ثانیه‌ای |
| 2 | 🟡 | خود صفحه قابل کشیدن/ارتجاعی بود | `body { overflow: hidden }` روی iOS جلوی pan را نمی‌گیرد؛ `#log` با `translateX(105%)` بیرون کادر بود | ✅ رفع: `html, body` ثابت + `overscroll-behavior: none`، `touchmove` فقط داخل عنصر واقعاً اسکرول‌شدنی، `#log` بسته `visibility: hidden`، همه‌چیز داخل `#stage { overflow: hidden }` |
| 4 | 🟠 | هرمس کار ناممکن وعده می‌داد (آپلود ZIP، اجرای `git status`) | اسکرین‌شات مالک از اپ | ✅ رفع: `repoIntent` + `/repo` در اپ و تلگرام، بند CANNOT در `STYLE`؛ تست در `coding.test.mjs` و `worker.test.mjs` |
| 3 | ✨ | اتصال زنده | — | `GET /api/pulse` (نیازمند کلید، فقط booleanها): توانایی سیم‌نشده کم‌رنگ، نشانگر `LIVE · ms` و ضربان هر ۲۰ ثانیه |

تست Playwright (iPhone 14 Pro Max): سه ژست کشیدن، ویوپورت گذرای 180×260 و برگشت → مرکز هسته همیشه 215 (وسط صفحه)، `scrollX/Y = 0`. `npm test` 264 → **265**، `worker.test.mjs` 79 → **80**، integration 10/10.


## ممیزی 2026-10-18

### دروازه‌های کیفیت (اجراشده)
| بررسی | قبل | بعد |
|---|---|---|
| `npm test` | 245/245 | **252/252** |
| `npm run test:integration` (workerd) | 10/10 | 10/10 |
| `node --test hermes/worker.test.mjs` (ریشه) | 78/78 | 79/79 |
| `npm run check` · `lint:shell` · `test:shell` | ✅ | ✅ |
| `node scripts/doctor.mjs hermes` | ✅ (۴۸s) | ✅ |
| `node build-skills.mjs` · `build-knowledge.mjs` | 6029 skills · 8 projects | 6029 skills · **9 projects** |

### یافته‌ها
| # | شدت | یافته | شاهد (ورودی شکست) | وضعیت |
|---|---|---|---|---|
| 1 | 🔴 | خلاصهٔ صبح ۱۲ بار در روز فرستاده می‌شد | Cron `*/5` → ساعت ۸ تهران ۱۲ اجرا دارد؛ `runReminders` فقط `tehranHour === 8` را چک می‌کرد و نشانهٔ «امروز فرستاده شد» نداشت | ✅ رفع: نشانهٔ KV `reminders:digest:<YYYY-MM-DD>` (TTL دو روز) |
| 2 | 🟠 | یادآور اعضای تیم بی‌صدا گم می‌شد | `chatId = "app:sara"` → تلگرام «chat not found» می‌دهد، `tg()` پرتاب نمی‌کند، پس `markSent` و `delivered += 1` اجرا می‌شد و یادآور از فهرست اپ هم ناپدید می‌شد | ✅ رفع: شناسه‌های `app:` به تلگرام نمی‌روند و در فهرست اپ می‌مانند؛ پاسخ `ok:false` تلگرام `failed` شمرده می‌شود (باز هم `markSent` تا چت مسدود هر ۵ دقیقه تکرار نشود) |
| 3 | 🟡 | `/file` برای فایل >1MB فایل خالی می‌فرستاد | Contents API برای ۱ تا ۱۰۰ مگابایت `encoding: "none"` و `content: ""` می‌دهد → `decode("")` | ✅ رفع: پیام روشن «بزرگ‌تر از ۱ مگابایت» |
| 4 | 🟡 | `chunks()` ممکن بود ایموجی را نصف کند | پیام ۴۰۰۰+ نویسه با ایموجی روی مرز → نیمهٔ surrogate تنها → تلگرام رد می‌کند | ✅ رفع: برش یک واحد عقب‌تر |
| 5 | 🟡 | دانش هرمس بریف پروژه‌ها و پلاگین مگا اسکیل را نداشت | `PROJECTS` فقط ROADMAP/PROGRESS؛ پلاگین در `plugins/` بود و `id` = مسیر | ✅ رفع: `CLAUDE.md` اول هر پروژه (فقط بلوک yaml + «صف کار» با `focusDoc`)، پروژهٔ `mega-skills-router` با `dir` |
| 6 | 🟡 | README می‌گفت Cron کامنت است | `wrangler.toml` از قبل `crons = ["*/5 * * * *"]` دارد | ✅ رفع متن |
| 7 | 🟡 | `changePassword` بقیهٔ نشست‌ها را باطل نمی‌کند | نشست دزدیده‌شده بعد از تغییر رمز قربانی ۳۰ روز معتبر می‌ماند | ⏳ باز (P1 در CLAUDE.md؛ اپ باید توکن تازه بگیرد) |
| 8 | 🟡 | `/api/chat` برای اعضای تیم سقف درخواست ندارد | یک حساب می‌تواند سهمیهٔ رایگان Gemini را تمام کند | ⏳ باز (P2) |
| 9 | 🟡 | صف یادآور KV خواندن-نوشتن غیر اتمیک | `addReminder` و `markSent` هم‌زمان → آخرین نوشتن یکی را گم می‌کند | ⏳ باز (P2؛ انتقال به DO) |
| 10 | 🟡 | `sync-secrets.mjs` نام‌های `GITHUB_REPO_TOKEN`، `STABILITY_API_KEY`، `GOOGLE_*` را ندارد | فقط در صورت تعریف به‌عنوان build variable مهم است | ⏳ عمداً تغییر نکرد: افزودن می‌تواند secret درست runtime را با build variable کهنه بازنویسی کند؛ تصمیم با مالک |
| 11 | ℹ️ | `/metrics` عمومی است | فقط شمارنده، بدون راز | پذیرفته |

### رفع‌های اعمال‌شده (فایل → تغییر → تست)
- `worker.mjs#runReminders` → نشانهٔ روزانهٔ خلاصه، رد `app:`، شمارش `failed` → `reminders.test.mjs` (۳ تست جدید).
- `worker.mjs#send` → برگرداندن `true/false` بر اساس `ok` تلگرام (بقیهٔ فراخوان‌ها مقدار را نادیده می‌گیرند؛ رفتارشان عوض نشد).
- `worker.mjs#chunks` → امن برای surrogate pair → `worker.test.mjs` «never split an emoji».
- `github.mjs#readFile` → خطای روشن برای `encoding !== 'base64'` → `coding.test.mjs`.
- `knowledge.mjs` (`PROJECTS` با `dir` و `CLAUDE.md`، `focusDoc`) + `build-knowledge.mjs` (استفاده از `focusDoc`) → `knowledge.test.mjs` (۲ تست جدید).
- `README.md` → توضیح درست Cron و یادآور اعضای تیم.

### کارایی و امنیت
- توکن نشست: HMAC-SHA256 با کلید مشتق از `TELEGRAM_BOT_TOKEN`؛ چرخاندن توکن بات همهٔ نشست‌ها و کلید `/app` را باطل می‌کند (مستند، عمدی).
- رمزها PBKDF2-SHA256 با ۱۰۰٬۰۰۰ تکرار (سقف Workers)؛ قفل ۸ تلاش در ۱۵ دقیقه برای هر نام کاربری.
- دانش پروژه‌ها در پرامپت مالک حداکثر ۱۸۰۰ + ۲×۱۴۰۰ نویسه؛ `focusDoc` بلوک yaml و صف کار را نگه می‌دارد تا همین سقف پرمحتوا باشد.
- `public/knowledge/*` با `run_worker_first` هرگز مستقیم سرو نمی‌شود (تست «knowledge files are never served»).

### پیشنهادها
1. Web Push برای یادآور اعضای تیم (بدون سرور اضافه).
2. یک تست قرارداد که نام‌های `sync-secrets.mjs#NAMES` با فهرست secretهای `CLAUDE.md` هم‌خوان بماند (بعد از تصمیم مالک دربارهٔ یافتهٔ ۱۰).
3. برچسب «۲۰۶ تست» در `scripts/doctor.mjs` (ریشه) کهنه است؛ عدد فعلی ۲۵۲.
