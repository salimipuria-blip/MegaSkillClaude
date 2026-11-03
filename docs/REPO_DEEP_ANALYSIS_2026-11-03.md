# تحلیل عمیق مخزن MegaSkillClaude

**تاریخ بررسی:** ۲۰۲۶-۱۱-۰۳ · **شاخه:** `arena/7500e99c-megaskillclaude` · **کامیت:** `979dac8` (۱۴ اکتبر ۲۰۲۶)
**روش:** خواندن کد، اجرای واقعی تست/بیلد همهٔ پروژه‌ها، مقایسهٔ داده‌های تولیدشده با ادعاهای مستندات، بازرسی امنیتی و بررسی وضعیت شاخه/CI در GitHub.
**هیچ فایلی جز همین گزارش تغییر نکرد و هیچ سرویس زنده‌ای (Vercel/Supabase/Cloudflare) فراخوانی یا تغییر داده نشد.**

---

## ۱) خلاصهٔ مدیریتی

این مخزن یک «مگا-مونوریپو» است: ۶ محصول مستقل + یک کتابخانهٔ ۶٬۰۱۷ مهارتی + ابزارهای مسیریابی و CI. کیفیت مهندسی بالاتر از حد انتظار برای چنین مخزنی است (تست واقعی، شکست بسته، سیاست «فقط رایگان»، گزارش‌های سخت‌سازی صادقانه)، اما چهار مسئلهٔ ساختاری دارد:

1. **۹۰٪ مخزن، کتابخانهٔ مهارت است، نه محصول.** از ۳۶٬۳۴۴ فایل تحت گیت، ۳۲٬۶۱۷ فایل (۸۹.۷٪) نسخهٔ اصلی + کپی تولیدشدهٔ مهارت‌هاست؛ ۳۸۹MB محتوا و ۱۱۶MB pack گیت.
2. **شاخهٔ کاری از `main` جدا افتاده است.** این checkout با `main` هیچ نیای مشترکی ندارد و ۳٬۳۰۶ فایل عقب‌تر است. دو باگ واقعی که در همین snapshot پیدا شد (health-check و تست integration هرمس) روی `main` قبلاً رفع شده‌اند — یعنی تحلیل و هر PR از این شاخه باید اول با `main` هم‌تراز شود.
3. **امنیت «fail-closed» خوب طراحی شده، ولی سه نقطهٔ پرریسک دارد:** نصب‌کنندهٔ هرمس کامل (`curl … | bash` بدون pin)، تزریق متن ۳٬۰۱۱ مهارت شخص ثالث به system prompt هرمس بدون گارد قوی، و احراز هویت فقط-مرورگری CHAM با KDF ضعیف و رمزهای پیش‌فرض منتشرشده.
4. **داده و مستندات از هم جدا افتاده‌اند.** تعداد مهارت‌ها در چهار فایل ۵٬۹۸۶ / ۲٬۹۸۰ / ۵٬۷۰۵ نوشته شده، در حالی که دادهٔ canonical می‌گوید ۶٬۰۱۷ / ۳٬۰۱۱ / ۵٬۷۳۶. تعداد تست‌ها هم در گزارش‌ها ۱۵۱ است و امروز ۲۲۵+.

**ارزیابی کلی: ۷.۵ از ۱۰** — پایهٔ مهندسی و نظم تست قوی؛ ریسک اصلی «حجم/تکرار داده»، «چند منبع حقیقت برای اعداد» و «ورود کد شخص ثالث به مسیر مدل» است، نه باگ‌های پراکنده.

---

## ۲) نقشهٔ مخزن و اعداد واقعی

| بخش | فایل | حجم | نقش |
|---|---:|---:|---|
| `plugins/mega-skills-router/` | ۱۷٬۸۱۷ | ۱۶۶MB | کپی «قابل نصب» کتابخانه (تولیدشده) |
| `library/github-skills/` | ۱۴٬۸۰۰ | ۱۵۲MB | منبع ۳٬۰۱۱ مهارت شخص ثالث (۲۹ ریپو، MIT) |
| `psk/` | ۳٬۰۷۷ | ۱۸MB | سایت + موتور ۳٬۰۰۰ مهارت + ۳ تابع Vercel |
| `brands/` + `brand/` | ۳۹۵ | ۴۲.۶MB | دارایی برند وایکینگ (۳۶۰ استیکر + سورس) |
| `fjcod/` | ۵۰ | ۳.۸MB | CHAM Store OS (React 19 + TS) |
| `orchestrator/` | ۴۸ | ۳۲۷KB | ۱۰ تابع Supabase Edge (تاریخی) |
| `hermes/` | ۴۳ | ۵۲۹KB | دستیار تلگرام (Worker + نصب‌کنندهٔ Oracle) |
| `bison-brand-book/` | ۲۶ | ۸.۴MB | برندبوک سینمایی Vite |
| `viking-team/` | ۱۹ | ۱۷۷KB | مرکز فرمان تیم (HTML + Supabase) |
| `lithos/` | ۸ | ۳۴KB | داشبورد مانیتورینگ (بازسازی‌شده) |
| `.claude/`, `scripts/`, `tests/`, `tasks/` | ۳۶ | ۴.۹MB | مسیریاب، statusline، ابزار CI، برنامهٔ ۱۰۰ تسک |

- **کد محصول (بدون مهارت‌ها):** ≈ ۱۸٬۰۰۰ خط (شامل HTML/CSS داخل‌خطی)، از این مقدار ≈ ۴٬۶۰۰ خط تست.
- **گیت:** ۱ کامیت روی این شاخه، ۹۰ شاخه روی origin، ۲۵ PR باز (۱۱ مورد Dependabot)، CI روی `main` با ۱۳ job سبز.
- **زبان‌ها در GitHub:** Python 48.6MB > JS 16.4MB > HTML 15.3MB (به‌خاطر متن مهارت‌های پایتونی)، TS 2.6MB.

---

## ۳) معماری واقعی

```
منابع canonical                      تولید (sync)                     مصرف‌کننده‌ها
psk/data/skills (3,000)  ─┐
library/skills (6)        ├─→  .claude/skills/.../triggers.json  ──┬─→ route.py  (Claude Code)
library/github-skills     ┘     (6,017 مهارت / 30,065 تریگر)       ├─→ پلاگین قابل نصب (کپی کامل)
        (3,011)                    │                                └─→ hermes/build-skills → public/skills (37MB)
                                   └─→ psk/data/skills-registry.json (3,000 جدا، با SHA-256 هر فایل)
```

**سه مسیریاب مستقل** برای یک مسئله وجود دارد:

| مسیریاب | خط | الگوریتم | داده |
|---|---:|---|---|
| `psk/engine/router.mjs` | ۱۲۵ | TF-IDF + پل فارسی↔انگلیسی + سیگنال دامنه + قواعد دستی | رجیستری ۳٬۰۰۰ مهارت + بدنهٔ تأییدشده با هش |
| `hermes/skill-router.mjs` | ۱۲۷ | همان ایده، shardهای ۵۱۲تایی روی Assets | tiggers.json پلاگین |
| `.claude/.../scripts/route.py` | ۱۱۷ | نسخهٔ پایتونی همان ایده | همان tiggers.json |

هر سه «هم‌روح» هستند و کدشان کم و خواناست، اما سه پیاده‌سازی مستقل یعنی هر بهبود رتبه‌بندی باید سه بار انجام و سه بار تست شود. تنها مسیریاب psk دارای قرارداد طلایی (۱۰۸ کیس) است؛ هرمس و route.py تست رتبه‌بندی مستقل ندارند.

نکتهٔ مهم: **قرارداد ۱۰۸ کیسی، تست رگرسیون است نه سنجش دقت.** خروجی‌های فعلی در `routing-golden.json` قفل شده‌اند؛ اگر رتبه‌بندی بهتر شود ولی ترتیب عوض شود، تست می‌شکند. خودِ `psk/docs/FEATURE_STATUS.json` هم «ارزیابی gold-set در CI» را pending اعلام کرده است.

---

## ۴) نتیجهٔ اجرای واقعی (در همین محیط، Node 22.22، Python 3.11)

| پروژه | دستور | نتیجه |
|---|---|---|
| psk | `npm run check && npm test` | ✅ ۴۱ تست؛ `routing:golden` → «۱۰۸ کیس مطابق» |
| psk (کارایی) | سنجش دستی cold start | ✅ ۴۵۰ms، RSS ۱۰۷MB، هر کوئری ≈۰.۳ms |
| hermes | `npm ci --ignore-scripts && npm test` | ✅ ۹۱ تست |
| hermes | `npm run test:integration` | ❌ **۹/۹ شکست** — `No such module "health.mjs"` |
| hermes | `node build-skills.mjs` | ✅ ۶٬۰۱۷ مهارت → ۳۷MB asset (۵٬۷۳۶ فعال) |
| fjcod | `npm ci && npm run check` | ✅ typecheck + ۳۳ تست + build (374KB JS / 114KB gzip) |
| viking-team | `node --test` + `unittest` | ✅ ۴ + ۵ تست |
| bison | `npm ci && npm run build && npm audit` | ✅ build ≈1.2s · ⚠️ ۱ آسیب‌پذیری high (`vite ≤6.4.3`) |
| lithos | `npm install && npm test && npm run build` | ✅ ۳ تست + build |
| orchestrator | `pytest` + contract | ✅ ۱۶ pass، ۳ skip مستند (`--require-materialized-skills` گیت سخت‌گیر) |
| ریشه | `python -m unittest discover -s tests` | ✅ ۳۲ تست |
| ریشه | `bash scripts/repo_health_check.sh` | ❌ **۲ خطا** (پایین توضیح) |
| tasks | `apply_tasks.py --validate-only` | ✅ manifest معتبر (۱۰۰ تسک) |

**جمع: ۲۲۵ تست سبز، ۳ skip، ۹ تست قرمز (همه در هرمس integration).**

### دو باگ واقعیِ همین snapshot

1. **health check** فقط `*.env.example` را مجاز می‌داند، ولی `hermes/.env.dev.example` و `hermes/.env.prod.example` هم تحت گیت هستند → job `repo-health` در CI باید قرمز شود. روی `main` این glob به `*.example` اصلاح شده است.
2. **`hermes/conversation.test.mjs`** لیست `modules` مینی‌فلر `health`, `metrics`, `rate-limit` را ندارد، در حالی که `worker.mjs` آن‌ها را import می‌کند → کل تست‌های SQLite/DO می‌شکنند. روی `main` با کامنت «regression: …» رفع شده است.

---

## ۵) شکاف شاخه با `main` (مهم‌ترین ریسک فرآیندی)

- `git merge-base HEAD origin/main` → **بدون نیای مشترک**. تاریخچه‌ها بازنویسی شده‌اند (هر دو سمت تک‌کامیت به‌نظر می‌رسند).
- اختلاف درخت: **۳٬۳۰۶ فایل، +۵۴۸هزار/−۱۰۴هزار خط**؛ `origin/main` در ۲ نوامبر، این شاخه در ۱۴ اکتبر.
- پیامد: PR از این شاخه، تفاوت کل درخت را نشان می‌دهد؛ هر اصلاحی هم که اینجا انجام شود ممکن است روی `main` وجود داشته باشد (مثل همان دو باگ).
- **اقدام:** قبل از هر کار جدید، `main` را در محیط تازه checkout کنید یا این شاخه را با یک merge نقطه‌به‌نقطه (با تأیید صاحب مخزن) هم‌تراز کنید؛ ادعای «تاریخچهٔ کامل گیت حفظ شده» در README با واقعیت مخزن هم‌خوان نیست.

---

## ۶) ارزیابی پروژه‌به‌پروژه

امتیازها از ۵: کد، تست، امنیت، مستندات.

### ۶.۱ `psk/` — MEGA SKILLS 3000 · کد ۴ / تست ۴.۵ / امنیت ۴.۵ / مستندات ۴.۵
**قوی‌ترین بخش مخزن.** ۱٬۲۳۹ خط برای یک موتور مسیریابی + API + UI با پوشش تست ۰.۸ به ۱.
- ✅ تأیید SHA-256 بدنهٔ هر مهارت در زمان لود (۲٬۹۹۰ تأیید + ۱۰ allowlist)، مسدودسازی path traversal/symlink، سقف ۶۴KB، never-execute، wrap در `<skill>` با قاعدهٔ صریح system.
- ✅ `ENGINE_TOKEN` با مقایسهٔ constant-time، fail-closed روی Vercel، CSP سخت، سیاست «فقط رایگان» با گارد `:free`.
- ✅ حالت پاسخ بدون کلید، خطای صادقانه `NO_PROVIDER_CONFIGURED` می‌دهد و پاسخ جعلی نمی‌سازد.
- ⚠️ **کیفیت ۳٬۰۰۰ مهارت:** میانهٔ حجم ۱٬۸۳۹ بایت، همه از یک قالب، با فوتر «کاتالوگ ۱۰۰۰ مهارت» (ناسازگار با ۳۰۰۰) و انبوهی از ترکیب‌های مکانیکی (`saffron-poster-analyzer`, `nuts-poster-analyzer`). این‌ها «دانش» نیستند، «اسکلت»اند؛ ارزش واقعی در ۳٬۰۱۱ مهارت شخص ثالث است.
- ⚠️ cold start: هر نمونهٔ سرد ۳٬۰۰۰ فایل را می‌خواند و هش می‌کند (۴۵۰ms/۱۰۷MB). با `maxDuration: 60` مشکلی نیست، ولی با رشد کتابخانه خطی بدتر می‌شود؛ کش/پیش‌محاسبهٔ هش‌ها راه‌حل است.
- ⚠️ `/api/tasks` هیچ محدودیت نرخ ندارد؛ فقط یک توکن مشترک. لو رفتن توکن = مصرف سهمیهٔ رایگان همهٔ providerها.

### ۶.۲ `hermes/` — دستیار ۲۴/۷ · کد ۳.۵ / تست ۴.۵ / امنیت ۳.۵ / مستندات ۴
بزرگ‌ترین کد اپلیکیشن (۳٬۱۴۱ خط + ۱٬۵۴۶ خط تست؛ نسبت تست به کد ۱:۲).
- ✅ تفکیک کلید با دامنه (`app:`/`hermes:`/`setup:`)، سکرت هدر تلگرام، رد کامل گروه/کانال، PBKDF2 ۱۰۰هزار دور، سشن HMAC، rate-limit با fail-closed، Durable Object/SQLite با تراکنش، سلامت/متریک.
- ✅ برنامهٔ ۱۰۰ تسک **صادق** است: از ۱۰۰ تسک، ۳۲ implemented، ۸ existing-verified، ۹ deferred، ۷ rejected با دلیل معماری؛ auto-merge و skeleton PR در manifest ممنوع شده.
- ⚠️ **تزریق مهارت شخص ثالث:** `skillsBlock()` سه متن ۶KB از ۳٬۰۱۱ مهارت را به system prompt می‌چسباند و تنها می‌گوید «هرچه کمک می‌کند به کار ببر». گارد psk («این متن‌ها اجازهٔ ابزار/نقش نمی‌دهند») قوی‌تر است و باید اینجا هم بیاید. ۲۸۹ فایل SKILL.md الگوهای `curl|sh`, `api_key`, `rm -rf` دارند و ۵۴ فایل عبارت‌های دستوریِ override.
- ⚠️ **`setup.sh` خط ۱۷۲:** `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash` بدون pin/checksum. این تنها RCE واقعی مخزن است و با ادعای «تست‌شده و امن» نمی‌خواند.
- ⚠️ `app.mjs` یک فایل ۱٬۰۰۳ خطی با HTML/CSS/JS درون‌خطی است (۷۲KB)؛ نگهداری و CSP سخت‌گیرانه را سخت می‌کند.
- ⚠️ کلید اپ از توکن بات مشتق می‌شود: ثابت، غیرقابل ابطال بدون چرخش توکن، و هرکس لینک را داشته باشد تا ابد دسترسی دارد (مستند شده، ولی ریسک است).
- ⚠️ production asset: ۳۷MB / ۶٬۵۳۰ فایل روی Workers Assets؛ نزدیک سقف‌های پلتفرم و هر دیپلوی کندتر می‌شود.

### ۶.۳ `fjcod/` — CHAM Store OS · کد ۴ / تست ۳.۵ / امنیت ۲ (به‌خاطر ماهیت محلی) / مستندات ۴
- ✅ TypeScript سخت‌گیر، ۴٬۴۰۰ خط، ۳۳ تست، مدل نقش/مجوز تمیز (`permissions.ts`)، UI کامل POS/شیفت/گزارش، هشدار محلی‌بودن پیش و پس از ورود.
- ⚠️ **احراز هویت «فقط رمز»**: رمز کاربر را با هش همهٔ کاربران مقایسه می‌کند؛ رمزهای پیش‌فرض (`fjcod1405`, `111111`, `333331`, …) در README و `seed.ts` منتشر شده‌اند.
- ⚠️ KDF: زنجیرهٔ SHA-256 با ۲٬۰۰۰ دور و salt قابل‌پیش‌بینی (`u-owner-salt`) برای رمزهای پیش‌فرض. برای ابزار آفلاین قابل قبول، برای هر چیز مالی/چنددستگاهی **نه**. مهاجرت باید با Argon2id/PBKDF2 استاندارد و auth سروری از نو نوشته شود.
- ⚠️ SQL و RLS آماده است ولی «اعمال نشده»؛ ۵۰۰+ خط SQL بدون مصرف‌کننده = کد مرده تا زمان مهاجرت.

### ۶.۴ `viking-team/` — کد ۳.۵ / تست ۳.۵ / امنیت ۴ / مستندات ۳.۵
- ✅ RLS نمونهٔ خوبی است: `security definer` با `search_path = ''`, revoke از anon، باکت خصوصی، سقف ۸MB، trigger پنج‌عضو با advisory lock.
- ✅ تست SQL contract + تست رفتار رسانه.
- ⚠️ هویت بر پایهٔ **email داخل JWT** است نه `user_id`؛ تغییر ایمیل/عدم تأیید ایمیل می‌تواند مرز عضویت را جابه‌جا کند.
- ⚠️ وابستگی به CDN ثالث (`esm.sh`, `jsdelivr`) بدون SRI؛ در ایران/CDN قطع، اپ بالا نمی‌آید (fallback دارد ولی هر دو خارجی‌اند).
- ⚠️ `render()` رشته‌های HTML می‌سازد؛ `esc()` هست، ولی IDها بدون escape داخل attribute می‌روند (`data-edit="${row.id}"`) و یک خطای آینده کافی است تا XSS شود.

### ۶.۵ `bison-brand-book/` — کد ۴ / تست ۰ / امنیت ۳.۵ / مستندات ۳.۵
- ✅ بیلد سریع و تمیز، طراحی بدون فریم‌ورک، اسکرول GSAP/Lenis.
- ❌ **صفر تست** و هیچ بررسی خودکار برای ۱٬۶۹۴ خط CSS/۲۲۲ خط JS.
- ⚠️ `vite 6.4.3` با ۱ آسیب‌پذیری high (چند GHSA در `npm audit` امروز) — PR #138 برای ارتقا باز است.
- ⚠️ `public/BISON-Brand-Book.zip` (۴.۲MB) باینری تکراری داخل مخزن است؛ باید به Release/کنداکتور برود.

### ۶.۶ `lithos/` — کد ۲ / تست ۲ / امنیت ۳ / مستندات ۳.۵
- ⚠️ `api/buffer-sync.js` صریحاً «بازسازی‌شده» است: کوئری GraphQL و کلیدهای متریک Buffer **تأیید نشده** (`TODO(verify)`)؛ تست‌ها با mock هستند، پس سبز بودن تست اثبات کارکرد نیست.
- ⚠️ احراز هویت endpoint: هر توکن معتبر همان پروژهٔ Supabase کافی است؛ اگر ثبت‌نام باز باشد، هر کاربر می‌تواند سینک را صدا بزند و سهمیهٔ Buffer را بسوزاند. باید allowlist مالک اضافه شود.
- ⚠️ README می‌گوید «root = repo root» که برای مونوریپو غلط است (باید `lithos`).
- ⚠️ بدون lockfile (vite دقیق pin شده، ولی reproducible نیست).

### ۶.۷ `orchestrator/` — تاریخی · کد ۲.۵ / تست ۳.۵ / امنیت ۳.۵ / مستندات ۴
- ✅ ۱۶ تست قرارداد + ۳ skip شفاف + گیت `--require-materialized-skills`؛ Gateway ادمین با allowlist و fail-closed نمونهٔ خوبی است.
- ⚠️ ۱۰ تابع Edge که سه‌تای آن‌ها (`skill-router`, `free-llm-router`, `skill-orchestrator`) با موتور psk هم‌پوشانی کامل دارند؛ خود ROADMAP بازنشستگی‌شان را پیشنهاد داده. تا آن زمان، دو منبع حقیقت برای «مسیریابی» وجود دارد.
- ⚠️ وجود `.github/workflows/baseline-ci.yml` داخل پوشه، مرده است (GitHub فقط ریشه را می‌خواند) و فقط چون تست قرارداد آن را می‌خواند نگه داشته شده.

### ۶.۸ کتابخانهٔ مهارت‌ها و ابزار ریشه
- ✅ `sync_skill_library.py --check` صفر drift می‌دهد؛ کپی پلاگین بایت‌به‌بایت با منبع تأیید می‌شود (۱۱٬۷۳۴ فایل یکسان در نمونه‌گیری هش).
- ✅ مجوز MIT همهٔ ۳٬۰۱۱ مهارت + نگه‌داشتن متن مجوز ۲۹ ریپو در `_licenses`.
- ⚠️ اما این طراحی، **۲ برابر کردن ۱۵۲MB** است؛ هر افزودن مهارت، فایل را دو جا می‌نویسد و `triggers.json` ۳MB را دو بار نگه می‌دارد.
- ⚠️ ۲٬۲۶۸ فایل اسکریپت (py/sh/js/ps1) کتابخانه می‌تواند اجرا شود؛ هیچ اسکنر کد مخرب در این snapshot نیست (روی `main` تست `test_third_party_skill_scan.py` اضافه شده).
- ⚠️ هیچ `LICENSE` ریشه‌ای وجود ندارد، در حالی که `plugin.json` مجوز MIT اعلام می‌کند و ۳٬۰۱۱ اثر شخص ثالث در مخزن عمومی است. `CHANGELOG.md` هم که در checklist انتشار الزامی است، وجود ندارد.

---

## ۷) امنیت — فهرست یافته‌ها

| # | شدت | یافته | محل |
|---|---|---|---|
| ۱ | 🔴 بالا | نصب‌کنندهٔ کامل هرمس کد دوردست را بدون pin/checksum اجرا می‌کند | `hermes/setup.sh:172` |
| ۲ | 🔴 بالا | متن ۳٬۰۱۱ مهارت ثالث بدون گارد کافی داخل system prompt هرمس | `hermes/conversation.mjs` + `skill-router.mjs` |
| ۳ | 🔴 بالا | رمزهای پیش‌فرض منتشرشده + KDF غیراستاندارد ۲٬۰۰۰ دوری + salt قابل‌پیش‌بینی | `fjcod/src/core/seed.ts`, `lib/crypto.ts`, `README.md` |
| ۴ | 🟠 متوسط | CHAM هیچ auth سروری ندارد؛ داده و مجوز کاملاً در مرورگر قابل‌دستکاری است | `fjcod/` |
| ۵ | 🟠 متوسط | endpoint لیتوس برای هر کاربر معتبر پروژه باز است (سوزاندن سهمیهٔ Buffer) | `lithos/api/buffer-sync.js` |
| ۶ | 🟠 متوسط | کلید اپ هرمس ثابت و غیرقابل ابطال است (مشتق از توکن بات) | `hermes/security.mjs` |
| ۷ | 🟠 متوسط | rate-limit هرمس روی KV غیراتمیک است (خودش هم مستند کرده) | `hermes/rate-limit.mjs` |
| ۸ | 🟠 متوسط | `/api/tasks` در psk هیچ محدودیت نرخی ندارد؛ یک توکن مشترک | `psk/api/tasks.js` |
| ۹ | 🟡 کم | اکشن‌های GitHub با tag شناور (`@v4`) نه SHA pin شده‌اند | `.github/workflows/*` |
| ۱۰ | 🟡 کم | مقایسه‌های `===` برای کلید setup/app به‌جای constant-time | `hermes/worker.mjs` |
| ۱۱ | 🟡 کم | وابستگی CDN خارجی بدون SRI در viking و lithos | `viking-team/team/app.js` |
| ۱۲ | 🟡 کم | پرامپت تصویر به Pollinations (ثالث، بدون کلید) فرستاده می‌شود؛ پیش‌فرض روشن | `hermes/image.mjs` |

**نقاط قوت امنیتی که باید حفظ شوند:** صفر راز در Git (اسکن الگوها هیچ‌چیز پیدا نکرد)، توکن‌ها فقط env، fail-closed در چند لایه، تأیید یکپارچگی فایل مهارت با SHA-256، RLS با `security definer` و `search_path=''`، آدیت قرارداد مخزن در pre-commit و CI، و مستندسازی صادقانهٔ «چه چیزی اعمال نشده».

---

## ۸) کیفیت کد و تست

| پروژه | کد (خط) | تست (خط) | نسبت | تست‌ها | Lint/Type |
|---|---:|---:|---:|---:|---|
| hermes | ۳٬۱۴۱ | ۱٬۵۴۶ | ۰.۴۹ | ۹۱ (+۹ شکسته) | فقط `node --check` |
| psk | ۵۹۰ | ۴۵۹ | ۰.۷۸ | ۴۱ | فقط `node --check` |
| fjcod | ۴٬۵۹۳ | ۳۵۰ | ۰.۰۸ | ۳۳ | TypeScript strict ✅ |
| orchestrator | ۱٬۳۲۰ | ۲۸۷ | ۰.۲۲ | ۱۶ + ۳ skip | pytest |
| bison | ۱٬۹۱۶ | ۰ | ۰ | ۰ | — |
| viking | ۲۰۲ | ۱۴۲ | ۰.۷۰ | ۹ | — |
| lithos | ۶۹ | ۴۳ | ۰.۶۲ | ۳ | — |
| ریشه/ابزار | ۱٬۷۷۸ | ۵۰۵ | ۰.۲۸ | ۳۲ | unittest |

- **نبود لینتر:** هیچ ESLint/Prettier/Ruff نیست؛ `node --check` فقط syntax را می‌گیرد. برای ۱۸هزار خط، یک خطای تایپی رایج می‌تواند تا زمان اجرا دیده نشود.
- **نبود coverage:** هیچ آستانهٔ پوششی اعمال نمی‌شود؛ نسبت‌های بالا تخمینی از حجم‌اند نه پوشش.
- **CI بدون کش:** `setup-node` بدون `cache: npm`؛ هر job وابستگی‌ها را از نو می‌گیرد.
- **نقطهٔ قوت نادر:** `tests/test_repo_normalization.py` خودِ CI و health-check را تست می‌کند (شکست git، نبود ابزار، env تحت گیت). این سطح از «تست زیرساخت» در مخزن‌های شخصی کم‌دیده است.
- **حالت‌های شکست خاموش:** `hermes/build-skills.mjs` در هر خطا `total: 0` می‌نویسد و ادامه می‌دهد؛ یعنی بات بدون مهارت بالا می‌آید و هیچ‌کس نمی‌فهمد. باید هشدار/exit غیرصفر برای محیط deploy داشته باشد.

---

## ۹) مستندات: drift عددی

| ادعا | محل | واقعیت امروز |
|---|---|---|
| ۵٬۹۸۶ مهارت / ۲٬۹۸۰ GitHub / ۵٬۷۰۵ routable | `.claude/skills/.../SKILL.md`، `.claude-plugin/marketplace.json`، `plugins/.../plugin.json`، `plugins/.../README.md` | **۶٬۰۱۷ / ۳٬۰۱۱ / ۵٬۷۳۶** |
| «psk: ۱۶ تست» | `docs/REPO_HARDENING.md` | ۴۱ تست |
| «۱۵۱ تست یکتا» | `docs/REPO_HARDENING.md` | ۲۲۵ سبز (۲۳۴ با gateway) |
| «۵٬۷۰۵ قابل مسیریابی» | `docs/REPO_HARDENING.md` | ۵٬۷۳۶ |
| «root = repo root» برای لیتوس | `lithos/README.md` | باید `lithos` باشد |
| «تاریخچهٔ کامل گیت حفظ شده» | `README.md` | تک‌کامیت و بدون نیای مشترک با `main` |
| CHANGELOG لازم است | `.github/RELEASE_CHECKLIST.md` | فایل وجود ندارد |
| «۳٬۰۰۰ مهارت» در بدنه | `psk/data/skills/*/SKILL.md` | فوتر می‌گوید «کاتالوگ ۱۰۰۰ مهارت» |

نکتهٔ مثبت: `hermes/README.md` تنها جایی است که اعدادش (۶٬۰۱۷ / ۵٬۷۳۶) با داده هم‌خوان است — چون از همان منبع تولید شده.

---

## ۱۰) عملکرد، مقیاس و هزینه

- **Clone/CI:** ۳۸۹MB فایل تحت گیت و ۱۱۶MB pack. هر clone تازه چند دقیقه طول می‌کشد؛ ۹۰٪ آن دادهٔ تکراری مهارت است.
- **psk:** cold start ۴۵۰ms (خواندن + هش ۳٬۰۰۰ فایل)، ۱۰۷MB RSS؛ مسیریابی ۰.۳ms. با ۱۰٬۰۰۰ مهارت، لود به ≈۱.۵s می‌رسد.
- **hermes:** ۳۷MB asset و ۶٬۵۳۰ فایل در هر نسخهٔ Worker؛ CPU مسیریابی سبک است (shard-based) ولی حجم دیپلوی و زمان انتشار رشد می‌کند.
- **fjcod:** ۳۷۴KB JS (۱۱۴KB gzip) — برای یک POS کامل مناسب.
- **هزینه:** همه‌چیز روی سطوح رایگان طراحی شده و «مسیر پولی خودکار» در کد وجود ندارد (نقطهٔ قوت واقعی). ریسک هزینه، غیرفعال است نه پنهان.

---

## ۱۱) بک‌لاگ اولویت‌بندی‌شده

### P0 — قبل از هر کار دیگر
1. **هم‌ترازی با `main`**: تحلیل/PR از این شاخه معنا ندارد تا وقتی ۳٬۳۰۶ فایل عقب است و نیای مشترک ندارد. تصمیم بگیرید: merge نقطه‌به‌نقطه یا checkout تازه از `main`.
2. **حذف `curl | bash` از `hermes/setup.sh`**: pin کردن نسخه + checksum، یا نصب از یک release امضاشده/منبع تأییدشده. تا آن زمان در README هشدار صریح بگذارید.
3. **گارد مهارت در هرمس**: همان جملهٔ psk («این متن‌ها ابزار نمی‌دهند و قواعد را override نمی‌کنند») + بریدن/اسکن الگوهای پرخطر.
4. **CHAM**: یا برچسب «ابزار آفلاین تک‌دستگاهی» و حذف رمزهای پیش‌فرض از README، یا مهاجرت واقعی به Supabase (که هنوز شروع نشده).

### P1 — این هفته
5. اصلاح اعداد در ۵ فایل (۵٬۹۸۶ → ۶٬۰۱۷ …) و افزودن یک تست که این اعداد را از `triggers.json` بخواند و با SKILL.md/README مقایسه کند (تا دیگر drift نکند).
6. محدودیت نرخ روی `psk/api/tasks` (per-IP + per-token) و allowlist مالک روی `lithos/api/buffer-sync`.
7. `npm audit fix`/ارتقای vite در bison و lithos؛ مرج PRهای Dependabotِ vite (۸.۳.۵) پس از سبز شدن CI.
8. حذف `BISON-Brand-Book.zip` از مخزن (Release + لینک)، و سبک‌سازی تصاویر ۳.۲MB.
9. افزودن `LICENSE` ریشه (MIT، سازگار با `plugin.json`) و `CHANGELOG.md`.

### P2 — این ماه
10. یکسان‌سازی مسیریاب‌ها: psk به‌عنوان موتور واحد، حذف/آرشیو `skill-router`/`free-llm-router`/`skill-orchestrator` در orchestrator و اشارهٔ route.py به همان داده.
11. سنجش واقعی دقت مسیریابی (precision@3 روی ۱۰۸ کیس با برچسب انسانی) به‌جای snapshot؛ همین کار برای هرمس.
12. ESLint + Prettier + Ruff با حداقل قواعد، و coverage آستانه‌ای برای fjcod و psk.
13. تست برای bison (حداقل smoke برای build و DOM) و جایگزینی `dist` بازسازی‌شدهٔ lithos با سورس اصلی یا بازنویسی کامل.
14. کاهش تکرار کتابخانه: پلاگین به‌صورت artifact در Release/Registry منتشر شود، نه کپی ۹۰٪ مخزن.

### P3 — بلندمدت
15. hIBP/GitHub Actions SHA pinning، SRI برای CDNها، CSP برای viking/bison.
16. مهاجرت CHAM به auth سروری با Argon2id و RPCهای تراکنشی.
17. پاکسازی ۹۰ شاخه و ۲۵ PR باز (۱۱ Dependabot) و بستن draftهای قدیمی.

---

## ۱۲) «Quick wins» کمتر از یک ساعت
- `sed` اعداد ۵٬۹۸۶/۲٬۹۸۰/۵٬۷۰۵ در چهار فایل + افزودن تست drift (نمونهٔ مشابه `test_skill_library_sync`).
- `setup-node` با `cache: npm` در هر job.
- حذف `hermes/public` از مسیر build در تست‌های محلی و اصلاح لیست `modules` (اگر `main` را merge نکردید).
- `*.example` در `scripts/repo_health_check.sh` (اگر `main` را merge نکردید).
- افزودن `LICENSE` و `CHANGELOG.md` با ۵ خط.
- تغییر آستانهٔ `MIN_SCORE`/`MAX_SKILLS` هرمس به‌صورت قابل‌تنظیم با env برای تست سریع کیفیت.

---

## ۱۳) چه چیزی بررسی **نشد**
- وضعیت زندهٔ Vercel/Supabase/Cloudflare و RLS اعمال‌شده روی دیتابیس واقعی (دسترسی شبکه محدود است؛ هیچ درخواستی به این سرویس‌ها زده نشد).
- تست سرتاسری مرورگر (`fjcod e2e`, Playwright) و iPhone واقعی.
- Deno check کل توابع Edge (فقط تست‌های Node اجرا شد؛ CI جداگانه دارد).
- اسکن کد مخرب در ۲٬۲۶۸ اسکریپت کتابخانه (فقط شمارش الگوها انجام شد).

---

## ۱۴) بازتولید
```bash
# ریشه
python3 -m unittest discover -s tests -v
bash scripts/repo_health_check.sh            # در این snapshot: ۲ خطا
python3 scripts/sync_skill_library.py --check
python3 scripts/verify_skills.py | tail -1

# پروژه‌ها
(cd psk && npm run check && npm test && npm run routing:golden && npm run bench:routing)
(cd hermes && npm ci --ignore-scripts && npm test && npm run test:integration)
(cd fjcod && npm ci && npm run check)
(cd viking-team && node --test tests/*.test.mjs && python3 -m unittest discover -s tests)
(cd bison-brand-book && npm ci && npm run build && npm audit)
(cd lithos && npm install --no-package-lock --ignore-scripts && npm test && npm run build)
(cd orchestrator && python -m pytest -q -ra tests)
python3 tasks/apply_tasks.py --manifest tasks/hermes_tasks.json --validate-only
```
