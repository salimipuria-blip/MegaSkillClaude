# بازبینیِ عمیقِ مخزن MegaSkillClaude — ۲۰۲۶-۱۰-۲۹

> این سند نتیجهٔ یک دور بازبینیِ کامل و اجرایی است: کد، تست‌ها، CI، امنیت، ساختار مخزن، و صداقتِ مستندات.
> هر عددی که در این سند آمده **در همین checkout اندازه‌گیری شده** است، نه نقل از دفترهای پروژه. دستورها در §۸ آمده‌اند.

## ۰) خلاصهٔ اجرایی

| بُعد | ارزیابی | توضیح کوتاه |
|---|---|---|
| کیفیت مهندسی کد | **بالا (۸/۱۰)** | جداسازیِ مسئولیت، حالت‌های degrade صریح، fail-closed در مسیرهای حساس، تستِ رفتاری واقعی (نه mock-only) |
| انضباطِ تست | **بالا (۸/۱۰)** | ۴۰۹ تستِ شمارش‌شده در ۱۲ پروژه، بدون تستِ skip‌شده؛ ولی چند ماژولِ پرریسک بی‌تست‌اند |
| CI / تحویل | **شکسته (۳/۱۰)** | آخرین CI سبزِ `main`: **۲۰۲۶-۱۰-۲۲**؛ پنج push آخرِ `main` همه قرمز؛ بودجهٔ Actions تمام شده |
| مستندات | **خوب ولی دچار drift (۶/۱۰)** | صداقتِ بالا و «NOT RUN» نویسیِ درست، اما شمارنده‌ها در ۴ سند کهنه بودند و نگهبان فقط ۲ نقطه را می‌پایید |
| امنیت | **قابلِ قبول با ریسک‌های مشخص (۶/۱۰)** | صفر secret در فایل‌های track‌شده؛ اما هشِ رمزِ اعضای تیم و هشِ شمارهٔ تلفن در Git، و یک فایلِ «بازسازی‌شده» در کدِ مستقر |
| ساختار مخزن | **نیازمندِ تصمیم (۴/۱۰)** | ۳۳۸ مگابایت از ۳۴۹ مگابایتِ محتوای track‌شده **کپیِ دوگانه**ی کتابخانهٔ مهارت است (۹۶٫۹٪) |

**قضاوتِ نهایی:** این مخزن از نظر *نوشتنِ* کد و مستندات واقعاً حرفه‌ای است؛ نقطهٔ شکستش **زیرساختِ تحویل** است.
زنجیرهٔ «شاخه → PR → CI سبز → مرج» که خودِ `docs/PORTFOLIO.md` اعلامش می‌کند، دست‌کم از ۲۲ اکتبر اجرا نمی‌شود:
PR #128 با **۱۴ چکِ قرمز** مرج شده و از آن روز به بعد هیچ push‌ای روی `main` سبز نشده است.

## ۱) روش و محیط

- بررسیِ ایستا: خواندنِ کدِ هستهٔ هر پروژه (`hermes/`, `psk/`, `fjcod/src`, `lithos/api`, `scripts/`, `.github/`).
- بررسیِ اجرایی: `scripts/repo_health_check.sh`، `scripts/doctor.mjs` (۴۳ گام/۱۳ پروژه)، سوئیت‌های هر پروژه، اسکنرهای مخزن.
- نصبِ وابستگی‌ها برای ۵ پروژه‌ای که `node_modules` نداشتند (`npm ci --ignore-scripts`)، pytest در venv موقت.
- بررسیِ وضعیتِ واقعیِ GitHub با `gh`: آخرین اجراها، چک‌های PRها، پیامِ commitهای `main`.
- آنچه **انجام نشد** (و در این سند «تأییدنشده» حساب می‌شود): Deno، Chromium/Playwright، هیچ تماسِ شبکه‌ای با Cloudflare/Supabase/Vercel/Gemini، و هیچ انتشار یا migration.

## ۲) نقشهٔ عددیِ مخزن

| سنجه | مقدارِ اندازه‌گیری‌شده |
|---|---|
| فایلِ track‌شده | ۳۷٬۹۷۰ |
| حجمِ محتوای track‌شده | ۳۴۹٫۰ مگابایت |
| حجمِ working tree (با `node_modules`) | ۵۳۹ مگابایت · `.git` = ۱۱۳ مگابایت |
| ترکیب | ۲۹٬۶۳۲ `md` · ۳٬۶۹۲ `py` · ۸۲۶ `mjs` · ۸۲۳ `json` · ۳۶۰ `ts` |
| `library/` | ۱۶۲ مگابایت · ۱۱٬۶۷۲ فایل `md` |
| `plugins/mega-skills-router/.../references/` | ۱۷۶ مگابایت · ۱۴٬۶۸۷ فایل `md` |
| نسبتِ دوگانگی | **۳۳۸ مگابایت = ۹۶٫۹٪ محتوای track‌شده** |
| پروژه/زیرپروژهٔ مدیریت‌شده | ۱۲ (+ ریشه) · ۱۳ شناسهٔ doctor |
| تسک‌های backlog | ۱۰۰ → ۲۴ `DONE` · ۴۳ `QUEUED` · ۱۳ `BLOCKED/OWNER` · ۱۳ `BLOCKED/LIVE` · ۶ `BLOCKED/INDEX` · ۱ `BLOCKED/NET` |

## ۳) وضعیتِ واقعیِ دروازه‌ها (اندازه‌گیری، نه ادعا)

| پروژه | تستِ اندازه‌گیری‌شده | نتیجه | ادعای مستندات |
|---|---|---|---|
| ریشه (پایتون) | **۱۹۳ → ۲۰۰** | OK | ۱۸۰ در آن دور ✅ |
| `psk` | **۵۷** + golden ۱۰۸ کیس | pass | ۵۷ ✅ |
| `hermes` واحد | **۲۶۹** (worker **۸۲**) | pass | ۲۶۹/۸۲ — **پیش از این دور ۲۶۳/۷۹ بود ❌** |
| `hermes` integration (workerd) | **۱۰** | pass | ۱۰ ✅ |
| `hermes` `check` | **۳۸ ماژول** | pass | ۳۸ ✅ |
| `fjcod` | **۴۵** (vitest) | pass | ۴۵ ✅ |
| `fjcod` e2e | skip (بدون Chromium) | **«pass» گزارش شد ⚠️** | CI با `E2E_STRICT=1` سخت‌گیر است ✅ |
| `lithos` | **۱۶** | pass + build | ۱۶ ✅ |
| `bison-brand-book` | **۲۴** | pass + build | ۲۴ ✅ |
| `viking-team` | **۱۱** نود + **۱۵** پایتون | pass | ۱۵+۱۱ ✅ |
| `mobile` | **۱۷** | pass | ۱۷ ✅ |
| `orchestrator` | **۲۱** + ۳ skipِ مستند | pass | ۲۱ ✅ |
| router / کتابخانه | ۱۸۰ (همان ریشه) | pass | ۱۸۰ ✅ |
| اسکنِ secret (tracked) | **۰ یافته** | pass | ۰ ✅ |
| اسکنِ مهارتِ ثالث | ۲٬۹۴۹ فایل · ۱۶۷ یافته | current | current ✅ |
| کیفیتِ مسیریابِ `psk` | top-1 **۱۰۰٪** روی ۱۰۰ کیس | pass | ۱۰۰٪ ✅ |
| هم‌گام‌سازیِ کتابخانه | **۰ فایلِ متفاوت** | pass | ۰ ✅ |
| `doctor.mjs` کامل | ۴۳ گام · **۲ خطا → ۰ پس از اصلاحِ همین دور** | — | — |

**نتیجه:** کد و تست‌ها سالم‌اند. تنها چیزی که قرمز بود، **دو سندِ کهنه** بود که نگهبانِ شمارنده‌ها را قرمز می‌کردند (§۷).

## ۴) یافته‌ها

### P0 — مسدودکنندهٔ تحویل

**۱. CI روی `main` از ۲۲ اکتبر سبز نشده است.**
آخرین اجرای سبزِ `CI` روی `main`: `2026-10-22T22:45Z`. پنج pushِ آخرِ `main` همه `failure` هستند:
- سه اجرای آخر (شامل مرجِ PR #128) در **۲ ثانیه** با پیامِ GitHub شکست خورده‌اند:
  *«The job was not started because recent account payments have failed or your spending limit needs to be increased»* — یعنی **هیچ جابی حتی شروع نشده**؛ این شکستِ کد نیست، شکستِ بودجهٔ Actions است.
- دو اجرای پیش‌تر (مرج‌های ۲۳ اکتبر) واقعی شکست خورده‌اند: `commit-identity`, `router`, `repo-health`, `fjcod-e2e`.

**۲. گیتِ `commit-identity` روی `main` عملاً همیشه قرمز است.**
commitهای مرج‌شده روی `main` تریلرِ `Co-authored-by: Claude <noreply@anthropic.com>` دارند (`8bd5ae3b`, `d5aa4e15`, `67cbb1e1`, `527dbc59`). اسکریپت `scripts/check_commit_identity.py` دقیقاً همین را ممنوع می‌کند و روی push به `main` (range خالی → fallback به `HEAD`) هر بار قرمز می‌شود. پس سیاستِ «پیامِ commit بدونِ هویتِ مدل» به‌طور سیستماتیک نقض می‌شود، نه به‌صورت تصادفی.

**۳. مرج با خطِ قرمز.** PR #128 در `2026-10-24T01:39Z` مرج شده، در حالی که **۱۴ چکِ Actions آن قرمز** بود (همان خطای بودجه) و `Vercel – psk-3000` هم با `upgradeToPro=build-rate-limit` شکست خورده بود. یعنی «CI سبز» به یک آیینِ اسمی تبدیل شده است.

*اثرِ آبشاری:* هر ۷ PRِ Dependabotِ باز دقیقاً در `repo-health` و `router` قرمزند — چون آن دو جاب تست‌های کهنهٔ §۷ را اجرا می‌کنند، نه به‌خاطر تغییرِ خودشان. تا این drift اصلاح نشود، هیچ PRِ وابستگی قابلِ قضاوت نیست.

### P1 — ریسکِ محصولی/امنیتی

**۴. دوگانگیِ ۳۳۸ مگابایتیِ کتابخانه (ریشهٔ اصلیِ هزینه).**
`plugins/mega-skills-router/skills/.../references/` کپیِ بایت‌به‌بایتِ `library/` است (گاردِ `sync_skill_library.py --check` این را تضمین می‌کند و ۰ اختلاف گزارش می‌دهد). نتیجه: هر clone = ۵۳۹ مگابایت؛ هر ویرایشِ یک مهارت = دو مسیر؛ و هر اجرای CIِ `router` = اسکنِ ۲ برابر.
**پیشنهاد:** نسخهٔ نصب‌پذیر را به‌صورت artifactِ release (zip امضاشده با sha256) تولید کن و فقط مانیفست + هش را در Git نگه دار؛ `--check` روی artifact اعمال شود، نه روی درختِ کپی‌شده.

**۵. `lithos/api/buffer-sync.js` «بخشی بازسازی‌شده» است.**
خودِ فایل می‌گوید: `RECONSTRUCTED TAIL — the original body past this point was lost during source recovery` و `TODO(verify): exact Buffer GraphQL query`. یعنی کدِ مستقر (Vercel) ممکن است با آنچه در Git است یکی نباشد و کوئریِ Buffer هرگز با پاسخِ واقعی تطبیق نشده باشد. رفتارِ «به‌جای نوشتنِ صفر، خطا را ثبت کن» (`BUFFER_SHAPE_UNVERIFIED`) درست و محافظه‌کارانه است، ولی این فایل تا پیش از راستی‌آزماییِ زنده نباید «تأییدشده» شمرده شود.
همچنین URL و anon key پروژهٔ Supabase **در سورس hard-code** شده‌اند؛ کلید publishable است (نشتِ فاجعه‌بار نیست) ولی مخزن را به یک پروژهٔ خاص قفل می‌کند.

**۶. موادِ اعتباریِ کاربران در Git.**
- `hermes/users.mjs`: هشِ PBKDF2-SHA256 (۱۰۰٬۰۰۰ دور) پنج عضو تیم. ۱۰۰ هزار دور برای PBKDF2-SHA256 کم است (توصیهٔ OWASP ~۶۰۰ هزار) و چون هش در مخزنِ خصوصی است، نشتِ مخزن = حملهٔ آفلاین روی رمزهای اعضا. اگر رمزها کوتاه/قابلِ حدس باشند، شکستن واقعی است.
- `hermes/booking.mjs`: `BOOKING_PHONE_SHA256` = هشِ SHA-256 خالیِ شمارهٔ موبایل مالک. فضای شماره‌های ایران کوچک است؛ این هش در چند ساعت brute-force می‌شود. **این داده در Git نشتِ حریمِ خصوصی است.**
- `hermes/sync-secrets.mjs` در `postinstall` اجرا می‌شود و secretها را با `wrangler secret bulk` همگام می‌کند؛ چون فایلِ موقت پاک می‌شود و مقادیر چاپ نمی‌شوند خوب است، ولی هر `npm install` در یک محیطِ دارای `CLOUDFLARE_API_TOKEN` به‌طور خودکار روی Workerِ تولیدی می‌نویسد. این را پشتِ یک فلگِ صریح بگذار.

**۷. `fjcod` برای دادهٔ مالی production-safe نیست — و این را باید در UI هم گفت.**
داده در مرورگر (localStorage) است، Auth سروری وجود ندارد، و `docs/ROADMAP_90D.md`/`ROADMAP.md` خودشان این را P0 اعلام می‌کنند. کد از نظر مالی دقیق است (ریالِ صحیح، مرجوعیِ جزئی، جلوگیری از موجودیِ منفی — ۴۵ تست)، ولی مرزِ اعتماد باید در خودِ محصول هم دیده شود، نه فقط در مستندات.

**۸. صفِ PRها در حال فاسد شدن است.**
۲۰ PRِ باز: ۷ PRِ Dependabot قرمز (۴ تای آن‌ها **major**: `vite 6/7 → 8`, `typescript 5 → 7`)، ۵ draftِ رهاشده (۲۴–۲۶ اکتبر)، و PRِ #12 از ۴ اکتبر. همچنین ۳ issueِ بی‌محتوا (#18–#20).
`dependabot.yml` گروه‌بندیِ درست دارد (react/remotion اتمیک) و کامنت‌هایش علتِ هر گروه را دقیق توضیح می‌دهند — ولی **major-bumpها را ignore یا به PRِ دستی هدایت نمی‌کند**، پس هر هفته چند PRِ محکوم به شکست تولید می‌شود.

**۹. driftِ مستندات، سیستمیک است نه موردی.**
نگهبانِ `tests/test_status_counters.py` فقط بخشِ «وضعیتِ جاری»ِ directiveها و ردیفِ هرمس در `PORTFOLIO.md` را می‌پاید. همین حالا:
- `hermes/PROGRESS.md` §۳ (جدولِ تأییدشده) هنوز «۱۵ ماژول / ۱۷۹ تست / ۹ integration» است؛ واقعیت: ۳۸ / ۲۶۹ / ۱۰.
- `docs/ROADMAP.md` با تاریخِ بازبینیِ ۲۰۲۶-۱۰-۱۴ مانده است در حالی که سه هفته تغییر پشتِ سر دارد.
- `hermes/PROGRESS.md` §۲ (دستورِ دقیقِ امروز) ۱۷۹ می‌گفت و نگهبان آن را نمی‌دید.

### P2 — بدهیِ فنی و بهداشتِ مخزن

**۱۰. فایل‌های `triggers.json` و ایندکس‌های مشتق‌شده تولیدکننده ندارند.** `route.py` فقط *می‌خواند*؛ اسکریپتی که `triggers.json` را بسازد در مخزن نیست. این دقیقاً دلیلِ `BLOCKED/INDEX` بودنِ ۶ تسکِ P0 (مهارت‌های `hermes-delivery`, `cham-delivery`, `viking-delivery`) است. تا این ابزار نوشته نشود، «افزودنِ مهارتِ پروژه» عملاً ممکن نیست.

**۱۱. `doctor.mjs` یک «سبزِ کاذب» باقی‌مانده دارد.** گامِ `fjcod e2e` بدونِ `E2E_STRICT=1` اجرا می‌شود؛ اسکریپت در نبودِ Chromium با کدِ ۰ و پیامِ «E2E skipped» خارج می‌شود و doctor آن را `pass` ثبت می‌کند. باید خروجی را بخواند و `skip` بزند (دقیقاً همان کاری که برای Deno/pytest می‌کند).

**۱۲. دو workflowِ بی‌اثر.** `orchestrator/.github/workflows/baseline-ci.yml` و `viking-team/.github/workflows/viking-team-static-check.yml` داخلِ زیرپوشه‌اند و GitHub هرگز اجرایشان نمی‌کند (CIِ ریشه جایشان را گرفته و کامنتِ ci.yml هم می‌گوید «پورت شده»). نگه‌داشتنشان فقط گمراه‌کننده است.

**۱۳. `lithos` تنها پروژه‌ای است که lockfile دارد ولی CI از `npm install` استفاده می‌کند** (بقیه `npm ci`). همچنین کامنتِ `.claude/hooks/session-start.sh` می‌گوید «No lockfile is tracked» که دیگر درست نیست.

**۱۴. ماژول‌های پرریسکِ بی‌تست در هرمس:** `google.mjs` (۱۷۶ خط — تبادل/تازه‌سازیِ توکنِ OAuth)، `media.mjs` (۶۴ خط)، و `booking.mjs` (فقط از طریقِ `worker.test.mjs`). `google.mjs` تنها موردی است که واقعاً باید تستِ رفتاری داشته باشد.

**۱۵. شناسهٔ مدل‌ها hard-code است** (`gemini-3.8-flash`, `kimi-k2.7-code`, …). افتِ زنجیرهٔ fallback وجود دارد، ولی هر بازنشستگیِ مدل یعنی یک انتشار. حداقل یک `MODELS` قابلِ override از env بگذار.

**۱۶. `/metrics` هرمس بدونِ احراز هویت عمومی است.** عددِ درخواست/خطا لو می‌رود (secret نیست، ولی سطحِ حمله و شناساییِ وضعیت را ساده می‌کند). اگر Prometheus از بیرون می‌خواند، حداقل `HEALTH_KEY` مثلِ `/health/deep` لازم است.

**۱۷. فقدانِ `LICENSE` در ریشه** در حالی که ۲٬۹۴۶ مهارتِ مجوزدار توزیع می‌شود. مجوزِ هر مهارت در `library/github-skills/_licenses/` نگه داشته شده (خوب)، ولی نبودِ LICENSE ریشه ابهامِ حقوقی می‌سازد.

## ۵) نقاط قوت (که باید حفظ شوند)

1. **صداقتِ ساختاری:** `NOT RUN` نویسی در دفترها، `RECONSTRUCTED TAIL` در کد، `BUFFER_SHAPE_UNVERIFIED` به‌جای نوشتنِ صفر، `E2E_STRICT`. این الگو در ۹۹٪ مخزن‌ها وجود ندارد.
2. **گاردهای ضدِ drift:** `sync_skill_library.py --check`، `coverage.test.mjs` (هر `.mjs` باید در `check` باشد)، `doctor.test.mjs` (کشفِ باگِ «سبزِ کاذبِ» parser)، و نگهبانِ شمارنده‌ها.
3. **امنیتِ مسیرهای حساس:** کلیدهای دامنه‌جدا (`appKey`/`webhookSecret`/`setupKey`)، مقایسهٔ ثابت‌زمان، PBKDF2 با salt، انقضای نشست + باطل‌سازی پس از reset، rate-limitِ fail-closed، SSRF-guard در `orchestrator` با تست، و `path traversal`/`symlink escape` در بارگذاریِ مهارت‌ها با تأییدِ SHA-256.
4. **کاراییِ سنجیده:** مسیریابِ `psk` با IDF و golden/accuracy/bench به‌عنوان گیت؛ ایندکسِ موبایل با بودجهٔ وزن و fingerprint در Service Worker.
5. **مستنداتِ پروژه‌محور:** هر پروژه `PROGRESS.md` + `CLAUDE.md` + directive دارد و `doctor` منبعِ فرمان است.

## ۶) برنامهٔ اقدام

**۲۴ ساعت**
1. بودجهٔ Actions را حل کن (Settings → Billing) و روی `main` یک اجرای سبز بگیر — بدون این، هیچ‌کدام از بقیه قابلِ اعتبارسنجی نیست.
2. تریلرِ `Co-authored-by: Claude` را از پیامِ مرج حذف کن (squash message را قبل از merge ویرایش کن) و merge را با چکِ سبز انجام بده؛ یا اسکریپتِ `pr_auto_merge.sh` را با `gh pr merge --squash --subject/--body` که تریلر را می‌زند سخت‌گیر کن.
3. driftِ شمارنده‌ها (همین دور اصلاح شد) را با PR مرج کن تا ۷ PRِ Dependabot دوباره قابلِ قضاوت شوند.

**۷ روز**
4. `lithos` را با پاسخِ واقعیِ Buffer تطبیق بده یا صریحاً در UI غیرفعالش کن؛ URL/کلید را به env ببر.
5. `users.mjs` را به KV/secret منتقل کن، PBKDF2 را بالا ببر، و `BOOKING_PHONE_SHA256` را با هشِ کلیددار (HMAC با secret) جایگزین کن.
6. `dependabot.yml`: `ignore` برای majorهای `vite`, `typescript`, `react` یا گروهِ «major-bumps» با تریاژِ دستی.
7. PRهای رهاشده را ببند/مرج کن؛ issueهای #18–#20 را ببند.

**۳۰ روز**
8. ابزارِ تولیدِ `triggers.json` را بنویس (رفعِ ۶ تسکِ `BLOCKED/INDEX`).
9. کپیِ `plugins/` را به artifact تبدیل کن تا clone و CI کوچک شوند.
10. `doctor` را برای `fjcod e2e` صادق کن؛ workflowهای بی‌اثرِ زیرپوشه را حذف/آرشیو کن؛ `LICENSE` ریشه را اضافه کن.
11. تستِ `google.mjs` و اجرای واقعیِ e2e با Chromium در محیطِ بازبینی.

## ۷) کارهایی که در همین شاخه انجام شد

- اصلاحِ driftِ شمارنده‌های هرمس در `docs/PORTFOLIO.md`، `docs/directives/02-hermes.md`، `hermes/PROGRESS.md` (بخشِ دستورهای امروز) و `hermes/README.md`: **۲۶۳/۷۹ → ۲۶۹/۸۲**، integration **۹ → ۱۰**، ماژول **۱۵ → ۳۸**.
  شاهد: `npm test --prefix hermes` = ۲۶۹/۲۶۹، `worker.test.mjs` = ۸۲، `npm run test:integration` = ۱۰/۱۰، `scripts.check` = ۳۸ فایل.
- نتیجه: `python3 -m unittest discover -s tests -p "test_*.py"` از **۴ خطا → ۱۸۰/۱۸۰ OK** و `node scripts/doctor.mjs` از `failures: 2` → **۰**.
- بخش‌های تاریخ‌دارِ snapshot (طبقِ بندِ ۷ قواعدِ مشترک) دست‌نخورده ماندند.
- بعد از این گزارش، دورِ دومِ همان روز (بررسیِ عمیق‌تر + راهنمای `docs/guides/ai-projects-3`) یک گامِ جدید (`ai-guides`) به doctor و repo-health و CI اضافه کرد؛ عددها در `PROGRESS.md`، `docs/directives/00-monorepo.md` و همین سند به **۴۳ گام / ۲۰۰ تست ریشه**؛ و دو سندِ تازه اضافه شد: [`REVIEW_3_PROJECTS_AI_GUIDE_2026-10-29.md`](REVIEW_3_PROJECTS_AI_GUIDE_2026-10-29.md) و [`HARDENING_BACKLOG_2026-10-29.md`](HARDENING_BACKLOG_2026-10-29.md) (۹ یافته با شاهدِ کد). به‌روز شدند (نگهبان خودش اختلاف را گرفت).

## ۸) ضمیمه: دستورهای بازتولید

```bash
bash scripts/repo_health_check.sh
node scripts/doctor.mjs --json            # ۴۳ گام / ۱۳ پروژه
python3 -m unittest discover -s tests -p "test_*.py"
npm test --prefix hermes && npm run test:integration --prefix hermes && npm run check --prefix hermes
npm test --prefix psk && node psk/scripts/routing-accuracy.mjs
(cd fjcod && npx vitest run) ; (cd lithos && npm test) ; (cd bison-brand-book && npm test)
node --test viking-team/tests/*.test.mjs ; (cd viking-team && python3 -m unittest discover -s tests)
node --test mobile/search.test.mjs mobile/index.test.mjs
python3 scripts/sync_skill_library.py --check ; python3 scripts/scan_third_party_skills.py --check
python3 scripts/check_skill_links.py --check ; python3 scripts/report_skill_quality.py --check
python3 scripts/scan_secrets.py
/tmp/venv/bin/python -m pytest -q -ra orchestrator/tests    # ۲۱ pass + ۳ skipِ مستند
gh run list --branch main --workflow CI --limit 30
gh pr checks 128 ; gh api repos/salimipuria-blip/MegaSkillClaude/commits?per_page=8
```

## ۹) پس‌گفتِ CI — تأییدِ همین روز

پس از pushِ این شاخه و باز شدن PR [#141](https://github.com/salimipuria-blip/MegaSkillClaude/pull/141)
روی `main`، همهٔ ۱۴ چکِ گیت‌ها **pass** شدند — از جمله `repo-health` و `router`، همان دو جابی که از
**۲۰۲۶-۱۰-۲۲** روی `main` و روی **هر** PRِ باز قرمز بودند. این تأیید می‌کند تشخیصِ §۵ درست بوده:
قرمزی از driftِ شمارنده‌ها در دو سند بود، نه از کد؛ و با یکی‌کردنِ اعداد با منبعِ canonical
(`tests/test_status_counters.py`) برطرف شد. تنها چکِ skip، `scheduled-health` است که فقط در
زمان‌بندی اجرا می‌شود.
