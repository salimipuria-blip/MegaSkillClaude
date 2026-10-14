# تحلیل حرفه‌ای PR #67 — تغییرات، ریسک، دیباگ و دستور ادامهٔ هر پروژه

> دامنه: ۳ کامیت، ۳۷ فایل، ‎+1260/−10 خط نسبت به `main` — به‌علاوهٔ کامیت اصلاحی همین تحلیل.
> روش: diff کامل، اجرای لوکال همهٔ گیت‌ها، و تفکیک خطاهای «ناشی از PR» از «موجود در main» و «بیرونی».

## جمع‌بندی اجرایی

PR سه لایه دارد: (۱) پلنر امن تسک‌های هرمس، (۲) دستورالعمل توسعهٔ هر پروژه (`docs/directives/`)، (۳) اسکیل کدنویسی آنلاین موبایل + کنسول آیفون. **هیچ کد محصولی** در `psk/`, `lithos/`, `fjcod/`, `viking-team/`, `bison-brand-book/`, `orchestrator/` تغییر نکرده؛ اثر PR روی آن‌ها «دستور اجرایی دقیق» است، نه پیشرفت کدی — در تحلیل هر پروژه صادقانه جدا شده است.

## وضعیت CI و طبقه‌بندی خطاها

| چک | نتیجه | طبقه‌بندی |
|---|---|---|
| `psk`, `lithos`, `fjcod`, `bison-brand-book`, `viking-team`, `orchestrator`, `router` | ✅ سبز | — |
| `repo-health` | ❌→✅ اصلاح شد | **از قبل در main** (F1) |
| `hermes` (job اصلی CI) | ❌→✅ اصلاح شد | **از قبل در main** (F2)؛ CI و CI·Hermes روی main هم قرمز بودند (`gh run list --branch main`) |
| ۴ چک Vercel | ❌ `build-rate-limit` | **بیرونی**: سقف بیلد پلن Vercel، ربطی به کد ندارد (F3) |

## یافته‌ها (Findings)

### F1 — [متوسط، از قبل در main، ✅ اصلاح شد] گیت سلامت مخزن روی قالب‌های env اشتباه قرمز می‌شد
`scripts/repo_health_check.sh` فقط `.env.example` را مجاز می‌دانست و `hermes/.env.dev.example` و `.env.prod.example` (قالب نمونهٔ بدون راز) را «فایل env واقعی» گزارش می‌کرد.
**اصلاح:** معافیت `*.example` + تست رگرسیون `test_tracked_suffixed_examples_are_allowed`. فایل env واقعی همچنان fail می‌شود (تست sentinel موجود).
```bash
bash scripts/repo_health_check.sh   # حالا: passed
```

### F2 — [بالا، از قبل در main، ✅ اصلاح شد] تست یکپارچه‌سازی هرمس به‌علت باندل ناقص Miniflare همیشه قرمز بود
`hermes/conversation.test.mjs` فهرست ماژول‌های workerd را دستی نگه می‌داشت و `health.mjs`, `metrics.mjs` (و در ادامهٔ زنجیره `rate-limit.mjs` از `booking.mjs`) در آن نبود: `No such module "health.mjs" imported from "worker.mjs"`.
**اصلاح:** تکمیل فهرست تا پوشش گراف import کامل + کامنت نگه‌داری. نتیجهٔ لوکال: Integration ‏۹/۹ و Unit ‏۹۱/۹۱ سبز.
```bash
npm ci --prefix hermes --ignore-scripts --no-audit --no-fund
npm run test:integration --prefix hermes   # 9 pass
npm test --prefix hermes                   # 91 pass
```
**پیشگیری پیشنهادی (P1):** ساخت خودکار فهرست ماژول‌ها از گراف import یا یک تست نگهبان که importهای `worker.mjs` را با فهرست fixture مقایسه کند تا دفعهٔ بعد CI قبل از اجرا هشدار بدهد.

### F3 — [بیرونی] Vercel: چهار پروژه به `build-rate-limit` خورده‌اند
**راه‌حل:** در Vercel برای هر پروژه Ignored Build Step بگذار (فقط وقتی فایل‌های همان پوشه عوض شده بیلد کند) و Preview Deployment را برای برنچ‌های docs-only خاموش کن؛ ارتقای پلن لازم نیست و با سیاست بودجهٔ صفر ناسازگار است.

### F4 — [پایین] `mobile/skills-index.json` ‏۲٫۲MB تک‌خطی است
روی آیفون بار اول سنگین است (Service Worker بعدش cache می‌کند). **پیشنهاد P1:** فشرده‌سازی gzip در هاست استاتیک + شکستن ایندکس بر اساس domain و lazy-load؛ تغییر در `mobile/build-index.py` با حفظ `--check`.

### F5 — [اطلاع] لینک‌های کنسول موبایل روی `main` قفل‌اند
تا مرج PR، دکمه‌های vscode.dev به فایل‌هایی روی main می‌روند که هنوز آنجا نیستند (`mobile/`, اسکیل جدید). رفتار درست برای بعد از مرج است؛ در بررسی PR از پیش‌نمایش همین برنچ استفاده شود.

### F6 — [پایین] ورک‌فلوی `hermes-automation.yml` عمداً فقط Plan است
`--apply-pr` داخل CI اجرا نمی‌شود (permissions: read). این با سیاست «بدون ساخت خودکار PR» سازگار است و نباید به write ارتقا یابد.

### F7 — [مثبت] امنیت پلنر جدید
`apply_hermes_tasks.py` مسیرهای `..`/مطلق/`://` را رد، موجودیت HTML و لینک Markdown را sanitize می‌کند و `--apply`/`--auto-merge` را با exit 2 رد می‌کند؛ ۱۰ تست رگرسیون در `tests/test_hermes_task_planner.py`.

### F8 — [مثبت] سازگاری ایندکس مهارت‌ها
افزودن اسکیل جدید فقط از مسیر canonical انجام شده: بدنه در `library/skills/`، ثبت در `triggers.json` (6018 مهارت، 5737 routable) و sync به پلاگین؛ `sync_skill_library.py --check` و `mobile/build-index.py --check` هر دو سبزند.

---

## تحلیل و دستور ادامه برای هر پروژه

### 0) مونوریپو و CI (`docs/directives/00-monorepo.md`)
- **اثر PR:** دو گیت قرمز قدیمی (F1/F2) سبز شد؛ بقیهٔ jobها از قبل سبز بودند.
- **دیباگ:** خطای CI را اول لوکال با همان دستور job بازتولید کن؛ اگر روی main هم قرمز است، «رگرسیون PR» نیست — با `gh run list --branch main` ثابت کن.
- **دستور بعدی (P0):** اتصال Vercel سه پروژهٔ قدیمی به همین مخزن؛ (P1) Ignored Build Step برای رفع F3.
- **DoD:** همهٔ jobها سبز + Vercel فقط برای پوشهٔ تغییریافته بیلد کند.

### 1) MEGA SKILLS 3000 — `psk/` (`01-psk-mega-skills.md`)
- **اثر PR:** کد صفر؛ فقط دستور و حضور در کنسول موبایل (کارت پروژه + دستور تست).
- **پیشرفت واقعی پروژه (قبل از PR):** Router و Plan Mode کامل؛ Answer Mode منتظر کلید رایگان مالک (`NO_PROVIDER_CONFIGURED` رفتار درست است).
- **دیباگ:** خطای مسیریابی = diff با golden صدوهشت‌موردی؛ اول `npm run bench:routing`، بعد تغییر وزن.
- **دستور بعدی:** (P0-مالک) کلید Groq/AI Studio در Vercel؛ (P1) نشست کوکی + gold-set در CI با هدف دقت ≥۸۰٪.
```bash
cd psk && npm run check && npm test && npm run bench:routing -- --label=pr67
```

### 2) هرمس — `hermes/` و `tasks/` (`02-hermes.md`)
- **اثر PR:** پلنر sanitizeکننده + نمونهٔ legacy + ورک‌فلوی دستی read-only + **سبز شدن تست‌های یکپارچه‌سازی (F2)**.
- **ریسک باقی‌مانده:** انتشار زندهٔ Worker سخت‌سازی‌شده هنوز انجام نشده؛ اولین انتشار در زمان بدون گفتگو.
- **دیباگ:** خطای `No such module` در workerd = نقص فهرست ماژول‌های fixture (F2)؛ خطای 429 = شمارندهٔ fixed-window عمداً fail-closed است.
- **دستور بعدی:** اجرای موج W1 از `tasks/README.md` با همین پلنر (هر تسک: برنچ جدا، تست، PR جدا).
```bash
python3 tasks/apply_hermes_tasks.py --manifest tasks/hermes_tasks.json --validate-only
npm run check --prefix hermes && npm test --prefix hermes && npm run test:integration --prefix hermes
```

### 3) CHAM Store OS — `fjcod/` (`03-fjcod-cham.md`)
- **اثر PR:** کد صفر؛ دستور مهاجرت ۵مرحله‌ای بک‌اند دقیق شد و کارت پروژه به کنسول موبایل آمد.
- **وضعیت بحرانی (بدون تغییر):** داده در مرورگر، رمزهای پیش‌فرض منتشرشده، migration RLS اعمال‌نشده (`supabase/migrations/20261014000000_cham_schema_rls.sql`).
- **دیباگ:** باگ پول/موجودی اول با تست واحد `core` قرمز شود؛ مشکل نشست را با sessionStorage «رفع» نکن (رگرسیون امنیتی).
- **دستور بعدی (P0):** بک‌آپ دادهٔ فعلی ← اعمال migration روی Supabase ← Auth سروری + RPC تراکنشی فروش ← حذف/چرخش رمزهای پیش‌فرض ← تست دودستگاهی و RLS.
```bash
cd fjcod && npm ci && npm run check   # typecheck + vitest + build؛ بعد npm run e2e
```

### 4) Lithos — `lithos/` (`04-lithos.md`)
- **اثر PR:** کد صفر؛ دستور راستی‌آزمایی Buffer مشخص شد.
- **ریسک اصلی:** `api/buffer-sync.js` نیمه‌بازسازی‌شده (`RECONSTRUCTED`) و کوئری Buffer تأییدنشده؛ تا تطبیق عدد با پنل Buffer، خروجی داشبورد قابل اتکا نیست.
- **دیباگ:** ترتیب: `lithos_sync_state` ← پاسخ خام Buffer ← parser؛ مشکل داده را با service_role در کلاینت حل نکن.
- **دستور بعدی (P0):** یک sync دستی و مقایسهٔ عددها با Buffer؛ ثبت نتیجه در README پروژه.
```bash
cd lithos && npm test && npm run build
```

### 5) Viking Team — `viking-team/` (`05-viking-team.md`)
- **اثر PR:** کد صفر؛ دستور تأیید زندهٔ RLS و رسانه دقیق شد.
- **شکاف اصلی:** migration و ۵ حساب واقعی روی Supabase زنده تأیید نشده؛ انتشار هنوز از مخزن قدیمی.
- **دیباگ:** آپلود HEIC فقط روی آیفون واقعی معتبر است؛ خطای دسترسی = Auth ← RLS ← policy باکت، به همین ترتیب.
- **دستور بعدی (P0):** اتصال Vercel به همین مخزن + ساخت ۵ حساب + سناریوی کامل آپلود از آیفون.
```bash
cd viking-team && node --test tests/*.test.mjs && python3 -m unittest discover -s tests -v
```

### 6) BISON Brand Book — `bison-brand-book/` (`06-bison-brand-book.md`)
- **اثر PR:** کد صفر؛ تنها پروژهٔ بدون تست خودکار باقی مانده (فقط build در CI).
- **ریسک:** انتشار دوکاناله (Pages + Vercel قدیمی) و F3 روی همین پروژه هم دیده شد.
- **دیباگ:** شکست بیلد = اول `grep -R '<<<<<<<' .`؛ گیر اسکرول = ایزولهٔ لایه‌ای Lenis/GSAP/CSS با پروفایل Performance.
- **دستور بعدی:** (P0) یکپارچه‌سازی انتشار؛ (P1) smoke test لینک/تصویر در CI + سقف وزن تصاویر.
```bash
cd bison-brand-book && npm ci && npm run build && npm audit
```

### 7) Orchestrator — `orchestrator/` (`07-orchestrator.md`)
- **اثر PR:** کد صفر؛ نقش تاریخی/مهاجرتی تثبیت شد (قابلیت جدید اینجا ساخته نمی‌شود).
- **ریسک:** Gateway روی کاغذ امن است ولی تا تنظیم `GITHUB_ADMIN_USER_IDS` و redeploy، نسخهٔ زنده محافظت نمی‌شود (fail-closed می‌ماند).
- **دیباگ:** 503 یعنی پیکربندی ناقص (درست)؛ skipهای pytest فقط برای artifact تاریخیِ materialize‌نشده مجاز است.
- **دستور بعدی (P0):** تنظیم allowlist و redeploy تابع؛ (P1) نقشهٔ بازنشستگی توابع تکراری به نفع `psk/`.
```bash
cd orchestrator && python scripts/audit/check_repository_contract.py && python -m pytest -q -ra tests
```

### 8) کتابخانه و مسیریاب مهارت‌ها — `library/`, `plugins/` (`08-skills-library-router.md`)
- **اثر PR:** یک اسکیل canonical جدید (`online-vscode-mobile-coding`) + sync کامل به پلاگین؛ شمارنده‌ها: 6018 مهارت / 5737 routable / 30071 تریگر.
- **دیباگ:** مهارت پیدا نمی‌شود ⇒ منبع ← کامل‌بودن ← ایندکس ← امتیاز؛ ویرایش دستی خروجی sync ممنوع (CI با `--check` می‌گیرد).
- **دستور بعدی:** (P1) تست نگهبان گراف import هرمس (F2) و مجموعهٔ طلایی فارسی بزرگ‌تر؛ اثبات مسیریابی:
```bash
python3 .claude/skills/mega-skills-router/scripts/route.py "کدنویسی آنلاین با vscode از آیفون"  # نتیجهٔ اول: همین اسکیل
python3 scripts/sync_skill_library.py --check
```

### 9) دارایی‌های برند وایکینگ — `brands/` (`09-viking-brand-assets.md`)
- **اثر PR:** کد/دارایی صفر؛ فقط دستور خط لولهٔ بازبینی تصویری.
- **دستور بعدی (P1):** اسکریپت ساخت پیش‌نمایش پک‌ها و کنترل ابعاد/نام‌گذاری؛ قانون ثابت: تصویر با کد ساخته نمی‌شود، متن فارسی جدا روی عکس می‌نشیند.

### 10) کنسول آیفون و اسکیل جدید — `mobile/`, `.vscode/` (بین‌پروژه‌ای، محصول همین PR)
- **اثر PR:** مسیر واقعی «کدنویسی از آیفون»: کنسول PWA (جست‌وجوی آفلاین مهارت، کارت پروژه‌ها با لینک vscode.dev، دستور تست) + اسکیل قابل مسیریابی + پیشنهاد افزونه‌ها از `.vscode/`.
- **محدودیت صادقانه:** VS Code وب ترمینال ندارد؛ اجرای تست از CI/ترمینال ابری است و کنسول این را شفاف می‌گوید.
- **دیباگ:** ایندکس قدیمی ⇒ `python3 mobile/build-index.py` (دستی ویرایش نکن)؛ مهارت در کنسول نیست ⇒ اول در مسیریاب CLI تست کن.
```bash
python3 mobile/build-index.py --check && node --check mobile/app.js
```

## ترتیب اجرای پیشنهادی بعد از مرج
1. اتصال انتشارها به همین مخزن (CHAM/Viking/BISON) + Ignored Build Step در Vercel (F3).
2. انتشار کنترل‌شدهٔ Worker هرمس و موج W1 با پلنر جدید.
3. مهاجرت بک‌اند CHAM (تنها بدهی بحرانی واقعی).
4. تست نگهبان گراف import هرمس و gold-set فارسی مسیریاب (دقت ≥۸۰٪).

_این PR طبق سیاست مخزن auto-merge نشده و منتظر CI سبز و بازبینی انسانی است._
