# MegaSkillClaude Monorepo — دفتر جریان مشترک

> این دفتر فقط تغییرات cross-project (CI، doctor، نقشهٔ پروژه‌ها و قراردادهای مشترک) را نگه می‌دارد. هر محصول دفتر جداگانهٔ خودش را دارد. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۲۹**.

## ۱) وضعیت مشترک
- ۱۲ پروژه/زیرپروژهٔ مدیریت‌شده (به‌علاوهٔ خود مخزن)؛ دفتر هرکدام در جدول `README.md` و دستور توسعهٔ هرکدام در [`docs/directives/`](docs/directives/README.md) است.
- `node scripts/doctor.mjs <id>` مرجع فرمان‌های دقیق هر پروژه است؛ `--list` فهرست کامل را نشان می‌دهد. اکنون **۴۳ گام در ۱۳ دامنه** (۳۸ تا پیش از ۲۰۲۶-۱۰-۱۴؛ گامِ `ai-guides` در ۲۰۲۶-۱۰-۲۹ اضافه شد).
- Router canonical: **۵٬۹۶۴** مهارت = ۳٬۰۰۰ core + ۱۸ پروژه + ۲٬۹۴۶ GitHub؛ **۵٬۹۶۴ routable**، **۰ incomplete** و **۲۹٬۸۷۸ trigger**.
- تست‌های ریشه: **۲۰۰ تست ریشه** (پایتون) با `python3 -m unittest discover -s tests -p "test_*.py"`. نگهبانِ همین اعداد `tests/test_status_counters.py` است: شمارنده‌های بخش «وضعیت مشترک» را به `triggers.json`، `library/github-skills/INDEX.json`، `scripts/doctor.mjs` و `mobile/skills-index.json` قفل می‌کند، ارجاع‌های `doctor.mjs <id>` و لینک/پوشه‌های `docs/directives/README.md` را resolve می‌کند، و اعداد داخل بخش‌های تاریخ‌دار را به‌عنوان snapshot دست نمی‌زند. قاعدهٔ انسانی‌اش بند ۷ «قواعد مشترک» در [`docs/directives/README.md`](docs/directives/README.md) است.
- CI شامل typecheck/build/test، health، skill sync، PWA، دارایی‌های برند و typecheck زیرپروژهٔ Motion است.

## ۲) اصلاحات بین‌پروژه‌ای

**باگ «سبز کاذب» در doctor پیدا و اصلاح شد.** اجرای اولیه نشان داد `common-tests` در ۰٫۰ ثانیه سبز می‌شد: parser سادهٔ `split(' ')` کوتیشن‌های `-p "test_*.py"` را به آرگومان واقعی منتقل نمی‌کرد و Python بدون کشف تست، exit 0 می‌داد.
- parser امنِ بدون shell جایگزین شد؛ آرگومان‌های quoted/escaped درست شکافته می‌شوند و فقط stepهای صریحاً shell از `bash -c` استفاده می‌کنند.
- regression در `tests/doctor.test.mjs` و CI افزوده شد؛ اجرای واقعی اکنون شمار تست کشف‌شده را بررسی می‌کند.
- **۵۹ تست ریشه در همان نوبت** (۵۶ تا پیش از آن دور، +۳ تستِ ارجاع‌های `package.json`) و `sync_skill_library.py --check` با صفر اختلاف سبز بودند؛ شمارِ جاریِ تست‌ها در بخش «وضعیت مشترک» نگه داشته می‌شود و نگهبان تست دارد.
- شمارنده‌های قدیمی مهارت در READMEها همگام شدند؛ snapshot تاریخی ۲٬۹۸۰ فقط با برچسب تاریخ خود باقی مانده است.
- `/build/` به `.gitignore` افزوده شد تا screenshot و رندرهای validation وارد commit نشوند.

## ۳) راستی‌آزمایی نهایی این نوبت

اجرای full doctor در همین محیط با دسترسی صریح به Deno، pytest و Chromium:

```bash
PATH="/tmp/arena-deno/node_modules/.bin:$PATH" \
PYTHONPATH=/tmp/arena-pytest \
CHROMIUM_PATH=/tmp/chromium \
LD_LIBRARY_PATH=/tmp/al2023/lib \
node scripts/doctor.mjs --json
```

**نتیجه: ۱۳ پروژه/دامنه، ۳۸ از ۳۸ مرحله PASS، صفر fail/skip/warn در doctor، ۹۱٫۲ ثانیه.** سه skip داخل خود pytest متعلق به آزمون‌های artifact تاریخی مهارت‌ها هستند و مستند/انتظاری‌اند؛ این‌ها stepهای skipشدهٔ doctor نیستند.
- CHAM: typecheck، ۳۳ تست Vitest، build و E2E واقعی با Chromium؛ **۱۹/۱۹** مرحله، بدون خطای console.
- Orchestrator: قرارداد سبز، **۱۶ pytest pass + ۳ skip مستند**، `deno check` سبز و تست gateway جداگانه **۷/۷** با Deno 2.9.6.
- کنسول موبایل: browser smoke با Chromium و profile شبیه iPhone 13؛ عرض ۳۹۰ CSS px بدون overflow، ۱۳ کارت پروژه، ایندکس ۵٬۷۳۸تایی، ۹ نتیجهٔ `logo`، جزئیات باز/بسته، Service Worker و shell/index آفلاین؛ صفر خطای page/console.
- Viking Motion: رندر MP4 واقعی **۱۸۰/۱۸۰ فریم**؛ H.264، ۱۰۸۰×۱۹۲۰، ۳۰fps، حدود ۶٫۰۵۹s و ۷۸۲٬۱۵۷ بایت؛ خروجی محلی در `viking-team/motion/out/viking-intro.mp4`.
- مسیرهای `/tmp/arena-deno`، `/tmp/arena-pytest` و Chromium/libraryها ابزارهای موقت همین محیط‌اند، نه وابستگی دائمی مخزن. E2E موبایل/Safari روی iPhone واقعی، live Supabase RLS، Buffer API و deployment واقعی هنوز تأیید نشده‌اند.

## ۳.۵) ۲۰۲۶-۱۰-۱۶ — زیرساخت مشترک
- **Vercel:** هر پنج پروژه (`psk`، `lithos`، `fjcod`/cham-store-os، `viking-team`، `bison-brand-book` — آخری `vercel.json` تازه) `ignoreCommand` گرفتند تا فقط پروژهٔ تغییرکرده ساخته شود؛ پیش‌تر هر PR ۵ دیپلوی می‌گرفت و سهمیهٔ ۱۰۰تایی روزانه پر می‌شد. نسخهٔ اول (`git diff` خالی) روی PR #81 استقرار cham-store-os و psk-3000 را با `fatal: bad object` (exit 128، چون clone کم‌عمق Vercel commit قبلی را ندارد) Failed کرد؛ Vercel فقط 0/1 می‌پذیرد. اصلاح: `[ -n "$P" ] && git cat-file -e "$P^{commit}" && git diff --quiet "$P" HEAD -- . && exit 0; exit 1` — پنج حالت محلی تست شد (همان sha → 0، تغییر → 1، sha ناموجود → 1، خالی → 1).
- **Codespaces:** `.devcontainer/` (Node 22، Python 3.12، Deno، gh، Claude Code CLI + افزونه) و `post-create.sh` که نصب هر پروژه را مستقل و غیرمسدودکننده انجام می‌دهد.
- **هرمس:** خودعیب‌یابی زنده (`/status`، `/health/deep`، workflow «Hermes live health») — جزئیات در `hermes/PROGRESS.md`.
- **ECC:** مخزن fork حذف شده؛ پلاگین‌ها در `plugins/` همین مخزن‌اند.

## ۴) کارهای باز مشترک
- [x] پس از CI، jobهای doctor، regression parser، `fjcod-e2e`، `bison` contract، sticker manifest و `viking-motion` spec را در GitHub Actions تأیید کن. — **۲۰۲۶-۱۰-۲۰ تأیید شد (read-only با `gh api`):** روی HEAD `37a617c8` هر ۱۱ job موفق‌اند: `repo-health, psk, lithos, router, fjcod, fjcod-e2e, bison-brand-book, viking-team, viking-motion, orchestrator, hermes` = `success`؛ به‌علاوهٔ workflowهای `CI · Hermes`، `Security and scheduled health` و `Hermes live health`. همان ۴۲ گام هم لوکال با ابزار واقعی اجرا شد (بخش ۷).
- [ ] برای کارهای staging/live از backup، حساب آزمایشی و secret manager استفاده کن؛ نتیجه را در دفتر همان محصول ثبت کن.
- [ ] اگر فهرست پروژه/command عوض شد، `README.md`, `docs/directives/README.md`, `scripts/doctor.mjs` و `tests/test_project_documentation.py` را در همان تغییر هماهنگ نگه دار.
- [ ] Safari/iPhone فیزیکی و سرویس‌های زنده را جداگانه آزمایش کن؛ شبیه‌سازی Chromium معادل تأیید iOS یا RLS نیست.

## ۵) لاگ جریان (افزایشی)
- **۲۰۲۶-۱۰-۱۴** — فرمان‌ها و test discovery در doctor اصلاح شدند؛ regression parser به CI اضافه شد؛ root ۵۶ تست سبز؛ router canonical به اعداد جاری همگام شد.
- **۲۰۲۶-۱۰-۱۴ (full validation)** — ابزارهای موقت pytest/Deno/Chromium در دسترس قرار گرفتند؛ full doctor برای هر ۱۳ دامنه و ۳۸ مرحله سبز شد؛ CHAM E2E دوباره ۱۹/۱۹ پاس شد، Orchestrator Deno ۷/۷، PWA موبایل در حالت online/offline smoke شد و Motion MP4 واقعی رندر/با ffprobe بررسی شد. محدودیت Safari واقعی و backend/deployment زنده همچنان باز است.
- **۲۰۲۶-۱۰-۲۰ (نگهبانِ شمارنده‌های وضعیت — `docs-counter-sync`)** — `tests/test_status_counters.py` (۶ تست) اضافه شد؛ شمارنده‌های بخش «۱) وضعیت مشترک» همین دفتر و سطرهای `psk`/`fjcod` در `ROADMAP.md` به منبع canonical قفل شدند (قبلاً `PROGRESS.md` ریشه و directive ۱۱ بیرون allowlist نگهبان بودند و بی‌صدا کهنه می‌شدند: ۶٬۰۱۹/۵٬۷۳۸/۳۰٬۰۸۰ و «۸ پروژه» و «۵۹ تست»). اعدادِ جاری اصلاح و بخش‌های تاریخ‌دار دست‌نخورده ماندند. TDD: نگهبان **پیش از** اصلاح ۷ failure مرتبط داد و **پس از** آن سبز شد؛ با سه جهش اثبات شد (۶٬۰۲۹→۶٬۰۱۹ ⇒ ۲ failure؛ ۷۹→۷۳ ⇒ ۱ failure؛ حذف یک گام از `scripts/doctor.mjs` ⇒ ۱ failure) و هر دو فایل با SHA-256 یکسان بازگردانده شدند. تست‌های ریشه **۷۳ → ۷۹**.
- **۲۰۲۶-۱۰-۲۰ (قاعدهٔ شمارندهٔ جاری مستند شد + نگهبان به فهرست directiveها گسترش یافت)** — پس از merge شدن PR #92 روی `main` (`b00e1cc1`). سه تست به `tests/test_status_counters.py` اضافه شد (۶ → ۸ متد؛ تست‌های ریشه **۷۹ → ۸۱**): (۱) قاعدهٔ «شمارندهٔ جاری باید منبع canonical داشته باشد» حالا در بند ۷ «قواعد مشترک» `docs/directives/README.md` **نوشته** شده و نگهبان وجودِ متنِ قاعده و نامِ فایلِ نگهبان و واژهٔ «تاریخ‌دار» را در همان فهرست می‌سنجد (تا قاعده فقط در کد نماند و برای ویرایشگرِ انسانی نامرئی باشد)؛ (۲) هر ارجاع `doctor.mjs <id>` در directiveها باید شناسهٔ واقعیِ گیت باشد؛ (۳) فهرست `docs/directives/README.md` و دیسک باید **در هر دو جهت** بخوانند (لینکِ مرده ممنوع، directiveِ یتیم ممنوع) و هر پوشهٔ backtickedِ جدول باید واقعاً وجود داشته باشد. TDD: پیش از اصلاح **۴ failure مرتبط** (`'منبع canonical'/'test_status_counters.py'/'تاریخ‌دار' not found` و `[79] != [81]`) و پس از آن `Ran 8 tests OK` و `Ran 81 tests OK`. یافتهٔ جانبی: هیچ drift واقعی در شناسه‌ها/لینک‌های directiveها نبود (نگهبان از اول سبز بود) و دو مثبتِ کاذبِ بررسیِ دستی هم شناسایی شد: `doctor.mjs --list` فلگ است نه شناسه، و شناسهٔ `repo` عمداً در README ریشه نیست چون README همان ابزار را بدون شناسه مستند می‌کند. **اثباتِ جهشِ هر سه نگهبان:** شناسهٔ جعلی `doctor.mjs bison` در directive ۰۶ ⇒ `FAILED` با پیامِ `unknown doctor id referenced: bison`؛ حذفِ سطرِ directive ۱۲ از فهرست ⇒ `FAILED` (یتیم/لینکِ مرده)؛ برداشتنِ عبارتِ «منبع canonical» از متنِ قاعده ⇒ `FAILED`. هر سه فایل با SHA-256 یکسان بازگردانده شدند. (جهشِ اول در تلاشِ نخست روی directive ۱۱ نوشته شد که اصلاً ارجاع `doctor.mjs` نداشت و `AssertionError` داد ⇒ اعمال نشد و «OK»ِ آن بی‌معنی بود؛ با هدفِ درست تکرار شد.)
- **۲۰۲۶-۱۰-۲۰ (directive ۱۱ «وضعیتِ جاری» گرفت؛ وزنِ ایندکس خودکار همگام شد)** — پس از merge شدنِ PR #93 روی `main` (`980121e2`). طبقِ قاعدهٔ تازهٔ بندِ ۷، `docs/directives/11-mobile-console.md` تا حالا **فقط** یک بخشِ تاریخ‌دارِ کهنه داشت (۵٬۷۳۸ و ۲٬۲۳۷٬۳۰۸ بایت) و هیچ «وضعیتِ جاری» نداشت، یعنی عملاً هیچ عددِ سنجیده‌شده‌ای در آن گیت نمی‌شد. بخشِ «## وضعیتِ جاری» با خروجیِ واقعیِ `build-index.py --check` اضافه شد (۵٬۷۴۸ از ۶٬۰۲۹ با ۲۸۱ ناقص · اثرانگشت `mega-mobile-v1-f0a03afbdf7bc464` · ۲٬۲۴۳٬۸۶۰ بایت خام / ۴۰۹٬۹۱۲ gzip در برابرِ بودجهٔ ۳٬۱۴۵٬۷۲۸ · ۱۷/۱۷ تست · موارد NOT RUN صریح). نگهبان هم گسترش یافت: وزن را **از خودِ `mobile/skills-index.json` بازتولید می‌کند** (`st_size` + `gzip.compress(..., 9)`، همان کاری که builder می‌کند) و اثرانگشت را از خطِ تولیدیِ `mobile/sw.js` می‌خواند ⇒ هیچ‌چیز hardcode نشده و کهنه‌شدنِ خودکار قرمز می‌شود. helperِ `status_section` پارامترِ `heading` گرفت تا بخشِ جاریِ هر سندی قابلِ انتخاب باشد (ثابتِ بی‌استفادهٔ `STATUS_HEADING` حذف شد). TDD: پیش از افزودنِ بخش، نگهبان با پیامِ `section matching '^##\\s*وضعیتِ جاری\\s*$' not found` شکست؛ پس از آن `Ran 8 tests OK` و `Ran 81 tests OK`. اثباتِ جهش: ۲٬۲۴۳٬۸۶۰→۲٬۲۳۷٬۳۰۸ ⇒ `FAILED (weight='raw')`؛ `f0a03afbdf7bc464`→`7bff70bc5794c7c0` ⇒ `FAILED`؛ هر دو با SHA-256 یکسان (`10731102…14ad`) بازگردانده شدند. شمارِ تست‌های ریشه تغییر نکرد (۸۱) چون متدِ تازه‌ای اضافه نشد و همان متدِ قبلی گسترش یافت.
- **یادداشتِ blocked-on-owner:** `brand/viking/brief.json` هنوز هر ۱۱ ادعای کمپین `source: ""` و `verified: false` دارد و noteِ خودش می‌گوید مقدار فقط از بریفِ واقعیِ کمپین پر شود ⇒ این مورد با دادهٔ مالک بسته می‌شود و ساختنِ عدد/منبع = جعل؛ عمداً **انجام نشد** (`render.mjs` هم تا `verified=true` fail-closed است).
- **۲۰۲۶-۱۰-۲۰ (راستی‌آزماییِ مجددِ ۴۲ گام پس از reset شدن محیطِ نشست)** — محیطِ نشست پاک شده بود (`node_modules` همهٔ پروژه‌ها، `/tmp/msc-venv`، Deno و Chromium همه رفته بودند)، پس همان مجموعهٔ رایگان دوباره نصب شد: `npm ci --ignore-scripts` برای hermes ۴۰/lithos ۱۵/bison ۱۷/fjcod ۹۲/motion ۲۵۳، `npm i -g deno` (۲٫۹٫۶)، pytest در venv بیرونِ مخزن، و Chromium 153 از `@sparticuz/chromium` (چون `cdn.playwright.dev` در allowlist نیست). نتیجهٔ `node scripts/doctor.mjs --json`: **۱۳ دامنه، ۴۲/۴۲ گام PASS، `failures: 0`، صفر skip، ۱۰۶٫۸ ثانیه** — با اعدادِ جاری: `repo` و `router` هر دو **Ran 81 tests**، psk **۵۷ تست** و **top-1 ۱۰۰٫۰٪**، fjcod **۴۵ تست + E2E PASSED**، hermes **۲۵۵ + ۱۰ integration**، orchestrator **۲۱ passed + ۳ skipped مستند**، mobile **۵۷۴۸/`f0a03afbdf7bc464`/۲٬۲۴۳٬۸۶۰B**، router `verify_skills --strict` ⇒ **HASHED: 3020**. هیچ‌کدام از این ابزارها وارد Git نشدند و `git status` فقط سه تغییرِ متن/تست را نشان می‌داد.
- **۲۰۲۶-۱۰-۲۰ (راستی‌آزمایی سراسری ۴۲ گام با ابزار واقعی)** — نصب کامل وابستگی‌ها (`npm ci --ignore-scripts` برای hermes/lithos/bison/fjcod/motion؛ venv پایتون برای pytest؛ Deno از npm؛ Chromium از `@sparticuz/chromium` چون `cdn.playwright.dev` در allowlist محیط نبود) و اجرای `node scripts/doctor.mjs --json`: **۱۳ دامنه، ۴۲/۴۲ گام PASS، `failures: 0`، صفر skip، ۹۲٫۷ ثانیه**. جزئیات، اعداد اندازه‌گیری‌شده و محدودیت‌ها در بخش ۷ و دفتر هر پروژه.

- **۲۰۲۶-۱۰-۲۰ (تریاژِ ۱۷ PR باز + نگهبانِ «قفل↔manifest»)** — پس از merge شدنِ PR #94 روی `main` (`1dbceebb`). وضعیت: **۱۷ PR باز = ۱۶ Dependabot + یک PR انسانی (#12 `claude/psk-pwa`، باز از ۲۰۲۶-۱۰-۰۴، بدون هیچ check و `mergeable_state: null`)**. لاگِ jobهای CI در این سندباکس خوانده نمی‌شود (`gh api actions/jobs/<id>/logs` ⇒ فایلِ ۰ بایتی؛ `gh run view --log-failed` ⇒ `EOF` از `results-receiver.actions.githubusercontent.com` که در allowlist نیست)، پس علتِ هر ۵ PR قرمز **بازتولیدِ محلی در worktree موقتِ `/tmp/wt`** (بدون دست‌خوردنِ درختِ کاری) + دادهٔ واقعیِ registry مشخص شد:
  - **#72 و #76** ⇒ `FAIL` در همان تستِ خودِ ریپو `viking-team/motion/tests/composition.test.mjs:57`: `assert.equal(pkg.dependencies.remotion, pkg.dependencies['@remotion/cli'], 'cli and runtime must match')`؛ پیامِ واقعی `actual '4.0.534'` ≠ `expected '4.0.506'` (#72) و برعکس (#76). نصبِ هر دو سالم است (۲۶۴/۲۷۳ بسته، exit 0) ⇒ این دو **یکدیگر را بلاک می‌کنند** و هیچ‌کدام به‌تنهایی قابلِ merge نیست.
  - **#73 و #75** ⇒ `FAIL` در `npm ci` با `ERESOLVE`؛ متنِ واقعیِ خطا: peerِ `@types/react-dom@19.3.0` به `@types/react@^19.3.0` نیاز دارد در حالی که `@types/react@18.3.31` نصب است (#73)، و متقارن peerِ `@types/react-dom@18.3.7` به `@types/react@^18.0.0` در برابرِ `@types/react@19.3.0` (#75) ⇒ react و react-dom و هر دو `@types` **باید اتمیک با هم** بروند.
  - **مسیرِ صحیحِ motion اندازه‌گیری شد:** `remotion` + `@remotion/cli` = `4.0.534` و `react` + `react-dom` = `19.3.0` و `@types/react(-dom)` = `^19.3.0` با lockfileِ بازتولیدشده ⇒ `npm ci` exit 0 (۲۶۱ بسته)، **۶/۶ تست**، `tsc --noEmit` exit 0.
  - **#60** ⇒ بلاکِ peer: `npm view @vitejs/plugin-react@6.1.2 peerDependencies` = `vite: "^8.0.0"` در برابرِ vite قفل‌شدهٔ `7.3.6`؛ `peerDependenciesMeta` نشان می‌دهد سه peerِ دیگر (`oxc-transform-react`, `@rolldown/plugin-babel`, `babel-plugin-react-compiler`) **optional** هستند ⇒ تنها مانع واقعی همان #61 است. ترکیبِ `vite@8.3.4` + `plugin-react@6.1.2` محک خورد: `npm ci` exit 0 و `npm run check` (شاملِ `tsc -b`، **۴۵/۴۵** vitest، `vite build`) exit 0.
  - **سبزهای CI که محلی هم راستی‌آزمایی شدند** (همان گام‌های CI هر job): #59 typescript `7.0.2` روی fjcod ⇒ tsc 7.0.2، ۴۵/۴۵ + build ✅؛ #62 lucide-react `1.55.0` ⇒ ۴۵/۴۵ + build ✅؛ #56 playwright-core `1.64.0` ⇒ ۴۵/۴۵ + build ✅؛ #57 bison vite `8.3.4` ⇒ ۲۴/۲۴ + build ✅؛ #58 lithos vite `8.3.4` ⇒ `node --check api/buffer-sync.js` OK، ۱۶/۱۶ + build ✅ **اما** diffش فقط `lithos/package.json` را می‌برد و `lithos/package-lock.json` روی `6.4.4` می‌ماند (`npm install` محلی ۹۷۴ خط lock را بازنویسی کرد: ۳۲۵+/۶۴۹−)؛ چون jobِ lithos با `npm install` اجرا می‌شود نه `npm ci`، CI سبز می‌شود ولی قفلِ commit‌شده ناسازگار می‌ماند.
  - **ترکیبِ کلِ خوشهٔ fjcod** (vite 8.3.4 + plugin-react 6.1.2 + typescript 7.0.2 + playwright-core 1.64.0 + lucide-react 1.55.0 با lock بازتولیدشده) ⇒ `npm ci` exit 0، ۴۵/۴۵، build exit 0.
  - **چهار PR اکشن** (#53 setup-python 5→7 چهار `uses:`، #54 checkout 4→7 شانزده `uses:` در سه workflow، #55 setup-node 4→7 دوازده `uses:`، #71 upload-artifact 4→7 یک `uses:`) هیچ تغییرِ دیگری ندارند و هیچ نگهبانی در ریپو نسخهٔ اکشن‌ها را pin نکرده (`grep` روی `tests/*.py` برای checkout/setup-node/setup-python/upload-artifact ⇒ خالی)؛ آخرین releaseهای پایدار هم دقیقاً همان ماژورِ هدف‌اند (`v7.0.1`, `v7.1.0`, `v7.0.0`, `v7.0.2`).
  - **نگهبانِ تازه:** `test_npm_lockfiles_resolve_every_manifest_range` در `tests/test_repo_normalization.py` (۱۶ → ۱۷ متد؛ تست‌های ریشه **۸۱ → ۸۲** و `docs/PORTFOLIO.md` از ۷۹ کهنه به ۸۲ اصلاح شد). نگهبان آفلاین است و سه چیز را می‌سنجد: مجموعهٔ ۶ پوشهٔ npmِ `.github/dependabot.yml` باید دقیقاً همان پوششِ تست باشد؛ هر پروژهٔ **وابستگی‌دار** باید lockfile داشته باشد؛ و نسخهٔ resolvedِ هر وابستگی باید rangeِ manifest را ارضا کند **و** `packages[""]`ِ lock دقیقاً برابرِ rangeهای manifest باشد. `psk` عمداً در فهرست است و از lock موجه‌اً معاف (هیچ dependency/devDependency ندارد و jobش هرگز `npm install` نمی‌زند). helperِ `_satisfies` فقط rangeهای واقعیِ این manifestها را می‌فهمد (`^`, `~`, exact, `>=`) و برای شکلِ ناشناخته `None` برمی‌گرداند تا به‌جای حدسِ «سبز» گزارش شود. نگهبان روی `main` **از اول سبز** بود (بدون drift موجود) و با **۵ جهش** اثبات شد: بامپِ manifestِ bison بدون lock ⇒ `FAILED` با ۲ drift؛ `remotion` در lock به `4.0.499` ⇒ `FAILED`؛ حذفِ `node_modules/react` از lock ⇒ `FAILED`؛ حذفِ `lithos/package-lock.json` ⇒ `FAILED`؛ و driftِ `packages[""].devDependencies` به‌تنهایی ⇒ `FAILED`. همهٔ فایل‌ها با SHA-256 یکسان بازگردانده شدند. (دو تلاشِ نخستِ جهشِ lock بی‌اثر بود چون نسخهٔ جایگزین با manifestِ main برابر بود و «OK» داد ⇒ با نسخهٔ واقعاً متفاوت تکرار شد.)
  - **انجام نشد / NOT RUN:** هیچ PR ای merge یا rebase نشد (بدون approval جداگانه)؛ به هیچ PR ای comment یا دستورِ `@dependabot` داده نشد؛ fjcod E2E زیرِ بامپ‌ها اجرا نشد (نیاز به Chromium دارد و CI هر ۵ fjcod-PR سبز را قبلاً `fjcod-e2e` دیده)؛ رندرِ واقعیِ MP4 با remotion 4.0.534 انجام نشد (فقط `tsc` + تستِ spec). ترتیبِ پیشنهادیِ merge و جدولِ ریسک در گزارشِ تحویلیِ همین نوبت آمده و اجرای آن منتظرِ approval جداگانه است.

- **۲۰۲۶-۱۰-۲۰ (تسکِ ۹۹ از backlog: `docs/DEPENDENCY_REVIEW.md` + نگهبانش)** — پس از merge شدنِ PR #96 روی `main` (`79f22db5`؛ CI پس از merge هم ۱۳ `success` + `scheduled-health` skipped + `Workers Builds: hermes` سبز). وسطِ همان نوبت، PR انسانیِ **#95** («docs: 100-task backlog for delivery agents»، باز شده ۱۰:۳۰، فقط `docs/AGENT_TASKS_100.md` با ۱۶۰ خطِ افزوده) پیدا شد: **۱۰۰ تسک با اولویتِ P0=۱۴ / P1=۴۷ / P2=۳۹ و شمارهٔ پیوستهٔ ۱ تا ۱۰۰** در ۱۲ بخش + ۱۰ «قانون ثابت». بررسیِ هم‌پوشانی نشان داد **تسکِ ۹۹** دقیقاً کارِ همین نوبت است («برای هر کدام شاخهٔ جدا، اجرای تست‌های پروژه، گزارشِ امن/شکست در یک جدول؛ ادغام با مالک») ولی معیارِ پذیرشش — «جدول در `docs/DEPENDENCY_REVIEW.md`» — هنوز تحویل نشده بود، پس همین دور تکمیل شد (تطبیقِ دستیِ من با آن backlog: تسکِ ۳۶ «عددِ کهنهٔ `docs/PORTFOLIO.md` + قفلش با نگهبان»، تسکِ ۹۷ «نگهبانِ شمارنده‌ها برای **همهٔ** `docs/directives/*.md`، امروز ۴ سند از ۱۴» و تسکِ ۵۹ «lockfile برای `stickers/src`»). سندِ `docs/DEPENDENCY_REVIEW.md` ساخته شد: ۸ بخش (خلاصه، جدولِ اکشن‌ها، جدولِ npm به تفکیکِ هر هدف، جفت‌های بلاک‌کننده، PRهای انسانی، ترتیبِ پیشنهادیِ merge، NOT RUN و فرمان‌های بازتولید) با همان اعدادِ اجراشدهٔ نوبتِ قبل و سه سطرِ تازه که قبلاً از قلم افتاده بودند: `/hermes` (بدون PR باز؛ `wrangler 4.149.0` با `latest 4.151.2` موجود ولی PR ندارد، و `miniflare 5.20261006.1-alpha` که `npm outdated` برایش **دانگریدِ ماژور** به `4.20260730.0` پیشنهاد می‌دهد ⇒ بامپِ خودکار اینجا اشتباه است)، `/psk` (بدون PR و بدون وابستگی؛ `deps 0 / dev 0` و jobش هرگز `npm install` نمی‌زند) و `/` برای اکشن‌ها. نگهبانِ تازه `test_dependency_review_verdicts_every_dependabot_target` در `tests/test_repo_normalization.py` (۱۷ → ۱۸ متد؛ تست‌های ریشه **۸۲ → ۸۳** و `docs/PORTFOLIO.md` هم‌تراز شد): هر ۷ هدفِ `.github/dependabot.yml` باید **بخشِ سرفصل‌دارِ خودش** را داشته باشد با دستِ‌کم یک سطرِ جدولی که واژهٔ وضعیت (`امن`/`شکست`/`بلاک`) را بیاورد، به‌علاوهٔ سطرِ «تاریخِ اندازه‌گیری: YYYY-MM-DD»، عبارتِ «merge … با مالک»، بخشِ `NOT RUN`، ستونِ «| وضعیت |» و ≥۱۶ ارجاعِ `#<num>`. TDD: پیش از نوشتنِ سند ⇒ `FAILED` با `docs/DEPENDENCY_REVIEW.md is missing…` و `Ran 83 tests / failures=2`؛ پس از آن `Ran 83 tests OK`. **سه اصلاحِ واقعیِ نگهبان در همین مسیر:** (۱) نخستین نسخه فقط «نامِ پوشه در متن» را می‌خواست و جهشِ M1 (برداشتنِ backtick از سطرِ خلاصه) **بی‌اثر** و سبز شد ⇒ قاعده به «بخشِ سرفصل‌دار + سطرِ وضعیت‌دار» سخت شد؛ (۲) قاعدهٔ «سلولِ دقیقاً برابر» هم شکننده بود چون `github-actions` در سطرِ خلاصه به‌شکلِ «`github-actions` در `/`» آمده بود؛ (۳) کلاسِ `[\u0600-\u06FF]` نیم‌فاصله (U+200C) را می‌بلعید و «امن» را با ZWNJ برمی‌داشت ⇒ به `[\u0600-\u06BC\u06BE-\u06FF]` اصلاح شد. اثباتِ جهش پس از اصلاح: حذفِ سرفصلِ ``` ### `/lithos` ``` ⇒ `FAILED` با `'/lithos (no section of its own)'`؛ بی‌وضعیت‌کردنِ سطرِ `/hermes` ⇒ `FAILED` با `'/hermes (section has no verdict row)'`؛ حذفِ «تاریخِ اندازه‌گیری» ⇒ `FAILED`؛ و «merge فقط با مالک» → «ادغام آزاد» ⇒ `FAILED`. سند با SHA-256 یکسان بازگردانده شد. **تغییرِ رویه از این نوبت:** قانونِ ۲ همان backlog (که هنوز draft است و روی `main` نیست) می‌گوید «فقط PR پیش‌نویس بساز؛ هرگز merge نکن — merge فقط با مالک»، و با الگوی سه دورِ قبل (#93/#94/#96 که زیرِ mandates «ادامه بده» خودکار squash+merge شدند) فرق دارد ⇒ PR این نوبت **پیش‌نویس** نگه داشته می‌شود و merge منتظرِ تصمیمِ صریحِ مالک می‌ماند.
- **۲۰۲۶-۱۰-۲۰ (راستی‌آزماییِ مجددِ ۴۲ گام پس از پاک شدنِ دوبارهٔ محیط)** — محیطِ نشست باز هم پاک شده بود (همهٔ `node_modules`، `/tmp/msc-venv`، Deno و Chromium)، پس همان مجموعهٔ رایگان بازسازی شد: `npm ci --ignore-scripts` برای lithos ۱۵/bison ۱۷/fjcod ۹۲/hermes ۴۰/motion ۲۵۳، pytest 9.1.1 در venv بیرونِ مخزن، Deno 2.9.6 از npm، و Chromium **۱۳۱٫۰٫۶۷۷۸٫۰** از `@sparticuz/chromium@131.0.0` — تلاشِ نخست با نسخهٔ `153.0.0` فقط باینریِ brotli‌فشرده داد و اجرا با `error while loading shared libraries: libnspr4.so` شکست (آن `libnspr4`/`libnss3` در سیستم هم نبودند و `apt` در allowlist نیست)، پس `bin/al2023.tar`ِ همان بسته استخراج شد که `lib/libnspr4.so` و `lib/libnss3.so` را دارد + `bin/swiftshader.tar`، با `LD_LIBRARY_PATH=/tmp/chromium/lib`. `mobile` هیچ `package.json` ای ندارد و ۱۷ تستش با `node --test` و بدون وابستگی اجرا می‌شود. نتیجهٔ `node scripts/doctor.mjs --json` (بارِ اول پس از بازسازیِ محیط: ۴۲/۴۲ PASS، `failures: 0`، ۸۲٫۸ ثانیه، `Ran 82 tests`؛ و بارِ دوم پس از افزودنِ نگهبانِ این دور: **۱۳ دامنه، ۴۲/۴۲ گام PASS، `failures: 0`، صفر skip، ۸۲٫۷ ثانیه** با `repo/common-tests` و `router/python-tests` هر دو **Ran 83 tests**)، psk **۵۷/۵۷** و top-1/top-3/safety **۱۰۰٫۰٪** و golden **۱۰۸ مورد**، fjcod **۴۵/۴۵ + `E2E PASSED`** با مرورگرِ واقعی، hermes **۲۵۵ + ۱۰**، lithos ۱۶، bison **۲۴ + `found 0 vulnerabilities`**، viking-team **۱۱ + Ran 15**، mobile **۱۷ + `5748 routable`/`mega-mobile-v1-f0a03afbdf7bc464`/`2243860 B raw / 409912 gz`**، brand-viking **۳ + ۷** (با «fails closed on an unverified brief»)، motion ۶، orchestrator `21 passed, 3 skipped` و router `Summary: HASHED: 3020`.

## ۶) لاگ جریان — ۲۰۲۶-۱۰-۱۴ (دور سراسری: گسترش و سخت‌سازیِ همهٔ پروژه‌ها)

این دور روی **تبدیلِ «بندهای باز» به گیتِ قابل‌اجرا** در تک‌تک پروژه‌ها متمرکز بود؛ هر تغییر با اندازه‌گیریِ قبل/بعد و دستورِ واقعی ثبت شده است. خلاصهٔ بین‌پروژه‌ای:

| پروژه | تغییرِ این دور | شاهدِ اندازه‌گیری‌شده |
|---|---|---|
| PSK | ۵ خطای واقعیِ مسیریابی + ۵ سیگنال/قانون جدید | دقت top-1 **۹۵٪ → ۱۰۰٪** (fa/en/mixed هر سه ۱۰۰٪)؛ تست‌ها ۴۷→۵۳ |
| Hermes | گپِ ۱۳ ماژولِ چک‌نشده بسته شد + نگهبانِ پوشش | سینتکس ۱۷/۳۰ → **۳۰/۳۰**؛ تست‌ها ۱۸۵→۱۸۹ |
| CHAM | باگِ حسابداریِ مرجوعی در `expectedCash` + ۸ تست | انتظارِ صندوق ۳٬۳۵۰٬۰۰۰ → ۵۰۰٬۰۰۰ تومان؛ تست‌ها ۳۳→۴۱؛ E2E واقعی **۱۹/۱۹** |
| Lithos | تفکیک «صفر واقعی» از «داده نیامد» در UI | خطاهای چهار منبع حالا دیده می‌شوند؛ تست‌ها ۴→۹ |
| Viking Team | قرارداد SQL/RLS به عنوان گیت ایستا | تست‌های پایتون ۵→**۱۵**؛ با جهش (mutation) صحتِ نگهبان تأیید شد |
| BISON | ارجاع نسبیِ ZIP اصلاح شد + نخستین قرارداد ایستا | ۸ تست جدید؛ با جهش تأیید شد |
| Orchestrator | ناسازگاریِ fail/skip در doctor اصلاح شد | نبودِ pytest/deno حالا **skip با دستورِ نصب** است، نه fail |
| Router/Library | ارجاع‌های شکستهٔ package.json گیت شدند | ۱۸ ارجاع شکسته شناسایی؛ ۱ استثنای مستند با تستِ ضدپوسیدگی |
| استیکرها | MANIFEST.json قطعی + حذفِ عددِ جادوییِ `+6` | ۳۶۰ استیکر/۳۰٬۶۰۳٬۵۳۹ بایت پین شد؛ سورسِ دوم (`duos.js`) کشف شد |
| قالب وایکینگ | رندر واقعی + بریفِ کمپینِ fail-closed | PNGهای ۱۰۸۰×۱۳۵۰ و ۱۰۸۰×۱۹۲۰ واقعی؛ تست‌ها ۳→۱۰ |
| کنسول موبایل | بودجهٔ وزنِ ایندکس + smoke واقعیِ مرورگر | ۲٬۲۳۷٬۳۰۸B خام / ۴۰۸٬۴۹۷B gzip؛ آفلاین ۵٬۷۳۸ مدخل از cache |
| Motion | قفلِ مشخصات + رندر مجددِ تأییدشده | ۱۸۰/۱۸۰ فریم، H.264، ۱۰۸۰×۱۹۲۰، ۷۸۲٬۱۵۷ بایت (برابر با دور قبل) |
| CI/مخزن | job جدید `fjcod-e2e` و ۵ گامِ جدید | تست‌های ریشه ۵۶→**۵۹**؛ نگهبانِ CI خودش job جدید را گرفت و به‌روز شد |

**الگوی مشترکِ این دور (قابل تکرار در دورهای بعد):**
1. اول با یک سنجه/تستِ کم‌هزینه بازتولید کن (دقتِ مسیریاب، جهش در SQL، ارجاع نسبی در HTML)؛ بعد اصلاح کن.
2. هر اصلاحِ رفتاری یک **تستِ نگهبانِ نام‌دار** می‌گیرد تا خرابیِ بعدی به همان قانون اشاره کند، نه به یک درصد.
3. هر نگهبان با **جهش (mutation)** امتحان می‌شود: اگر برگرداندنِ باگ، تست را قرمز نکند، تست بی‌ارزش است.
4. ابزارِ مفقود (pytest/deno/مرورگر) از «خرابیِ پروژه» جدا گزارش می‌شود — skip با دستورِ نصب، هرگز pass.
5. ادعاهای عددی/کمپینی از کد و هنر به یک **منبعِ قابلِ ردیابی** منتقل می‌شوند و تا تأیید نشوند، خروجی مسدود است.

**محدودیت‌های سراسریِ اعلام‌شده:** هیچ‌کدام از این‌ها تأییدِ سرویسِ زنده نیستند — RLS/staging واقعی، انتشار Vercel، APIی زندهٔ Buffer، Safari/iOS فیزیکی و حساب‌های تلگرام/Cloudflare همچنان باید جداگانه آزمایش شوند. رندرها و مرورگرهای این دور ابزارهای موقت در `/tmp` هستند، نه وابستگیِ مخزن.

## ۷) لاگ جریان — ۲۰۲۶-۱۰-۲۰ (نگهبانِ شمارنده‌ها + راستی‌آزماییِ کامل ۴۲ گام)

### ۷٫۱) چه چیزی و چرا
دو کارِ مستقل در یک دور: (الف) بستنِ شکافِ «شمارندهٔ کهنه در سندِ مرجع» با یک نگهبانِ تست، و (ب) اجرای واقعیِ همهٔ گیت‌ها با ابزارِ کامل تا اعدادِ مستند حدس نباشند.

**ریشهٔ مشکلِ (الف):** نگهبانِ قبلی (`tests/test_project_documentation.py::test_router_counts_match_canonical_indexes_and_bootstrap_copies`) فقط چهار سند را می‌سنجید (plugin README، library README، GitHub README، directive ۰۸). `PROGRESS.md` ریشه و `docs/directives/11-mobile-console.md` بیرونِ آن allowlist بودند، پس وقتی canonical از ۶٬۰۱۹ به ۶٬۰۲۹ رفت، سندِ مرجعِ مونوریپو کهنه ماند و هیچ گیتی قرمز نشد.

### ۷٫۲) تغییرها (فقط متن/تست؛ بدون تغییرِ رفتارِ محصول)
| فایل | تغییر | دلیل |
|---|---|---|
| `tests/test_status_counters.py` | **فایلِ تازه**: ۶ تست نگهبان | قفل‌کردنِ شمارنده‌های «وضعیتِ جاری» به منبعِ canonical + ممنوع‌کردنِ `unittest discover` تودرتو |
| `PROGRESS.md` | سطرِ تاریخ، شمارِ router (۶٬۰۲۹ = ۳٬۰۰۰ core + ۱۸ پروژه + ۳٬۰۱۱ GitHub؛ ۵٬۷۴۸/۲۸۱/۳۰٬۲۰۳)، افزودنِ سطرِ «۷۹ تست ریشه»، تاریخ‌دارکردنِ ادعای «۵۹ تست»، بستنِ چک‌باکسِ CI، دو ورودیِ لاگ و همین بخش | انطباقِ سندِ مرجع با واقعیتِ سنجیده‌شده |
| `ROADMAP.md` | سطرِ `psk`: ۴۷ تست/۹۵٪ → **۵۷ تست/۱۰۰٪**؛ سطرِ `fjcod`: ۳۳ تست → **۴۵ تست + E2E ۱۹/۱۹** با ارجاع به دفترِ پروژه و یادداشتِ منبعِ انتشار (`POINT/fjcod`) | رفعِ تناقضِ سندِ مرکزی با دفترِ خودِ پروژه |
| `psk/PROGRESS.md` · `mobile/PROGRESS.md` · `fjcod/PROGRESS.md` | **فقط append** ورودیِ تاریخ‌دارِ ۲۰۲۶-۱۰-۲۰ با فرمان، خروجی و محدودیت | ثبتِ همان نوبت، بدون بازنویسیِ لاگِ قبلی |

**دست‌نخورده (عمداً):** `triggers.json`، `mobile/skills-index.json`، `plugins/**` و هر خروجیِ تولیدی دیگر؛ بخش‌های تاریخ‌دارِ اسناد (مثل «پروندهٔ این دور ۲۰۲۶-۱۰-۱۴» در directive ۱۱ با عددِ ۵٬۷۳۸) به‌عنوان snapshot باقی ماندند — نگهبان فقط بیرونِ بخشِ تاریخ‌دار را می‌سنجد. شمارهٔ بخشِ «۳٫۵» هم عمداً تغییر نکرد تا diff محدود بماند (هیچ ارجاعِ `PROGRESS.md#anchor` در مخزن نیست).

### ۷٫۳) نگهبانِ تازه چه چیزی را قفل می‌کند
- شمارِ `skills/routable/incomplete/triggers` و تفکیکِ `core/project/github` از `.claude/skills/mega-skills-router/references/triggers.json` (با cross-check در برابر `library/github-skills/INDEX.json`) در برابرِ متنِ «وضعیتِ مشترک»؛
- شمارِ دامنه/گام از خودِ `scripts/doctor.mjs` (ایستا، بدون subprocess)؛
- شمارِ تست‌های پایتونِ ریشه با شمارشِ AST متدهای `TestCase.test_*` (نه با اجرای تودرتو)؛
- برابریِ طولِ `mobile/skills-index.json` با `counts.routable_skills`؛
- نبودِ شمارندهٔ کهنه (۵۷۳۸/۲۲۳۷۳۰۸/۴۰۸۴۹۷/۵٬۷۳۸) بیرونِ بخش‌های تاریخ‌دار در directive ۱۱ و `ROADMAP.md`؛
- اینکه هر عددِ تست/درصد در سطرهای `psk` و `fjcod` نقشهٔ راه، در دفترِ همان پروژه هم وجود داشته باشد (ادعای بی‌منبع ممنوع).

**درسِ همین دور (به نگهبان تبدیل شد):** نسخهٔ اولِ تست با `subprocess` یک `unittest discover` روی همان فایل اجرا می‌کرد؛ چون الگو خودش را دوباره کشف می‌کرد، اجرا تودرتو شد (۳ سطح، ~۴۶ ثانیه) و بعد شکست. رفع: شمارشِ ایستا + تستِ `test_no_python_test_spawns_a_nested_unittest_discovery` که هر `unittest discover` subprocess را در `tests/` قرمز می‌کند.

### ۷٫۴) محیطِ راستی‌آزمایی (همه رایگان، همه بیرونِ مخزن)
```bash
# وابستگی‌های پروژه‌ها (بدون اجرای lifecycle script؛ postinstall هرمس sync-secrets دارد)
npm ci --prefix hermes --ignore-scripts --no-audit --no-fund          # 40 بسته
(cd lithos && npm ci --ignore-scripts --no-audit --no-fund)           # 15
(cd bison-brand-book && npm ci --ignore-scripts --no-audit --no-fund) # 17
(cd fjcod && npm ci --ignore-scripts --no-audit --no-fund)            # 92
(cd viking-team/motion && npm ci --ignore-scripts --no-audit --no-fund) # 253
# psk هیچ وابستگی و lockfile ندارد ⇒ نصب لازم نیست (تست‌ها با node --test بومی)
python3 -m venv /tmp/msc-venv && /tmp/msc-venv/bin/python -m pip install pytest   # pytest 9.1.1 (PEP 668 ⇒ venv)
npm install -g deno                                                            # deno 2.9.6
npm install @sparticuz/chromium   # در /tmp/msc-tools؛ سپس brotliDecompressSync روی bin/chromium.br و bin/al2023.tar.br
```
`cdn.playwright.dev` در allowlist این محیط نبود (`ECONNRESET`) ⇒ `npx playwright install chromium` ناموفق ماند و مسیرِ مستندِ خودِ مخزن (بستهٔ npm + brotli) جایگزین شد. مسیرهای `/tmp/msc-venv`، `/tmp/msc-tools` و `/tmp/chromium` ابزارِ موقّتِ همین محیط‌اند و هیچ‌کدام واردِ کد، CI یا Git نشدند (`git status` پس از همهٔ buildها فقط سه تغییرِ متن/تست را نشان می‌داد؛ `dist/` و `node_modules/` هر پروژه ignore شده‌اند).

### ۷٫۵) نتیجهٔ اندازه‌گیری‌شدهٔ هر ۴۲ گام
`node scripts/doctor.mjs --json` ⇒ **`failures: 0` · ۱۳ دامنه · ۴۲/۴۲ گام PASS · صفر skip · ۹۲٬۷۲۰ms**

| دامنه | گام‌ها | شاهدِ عددیِ واقعی |
|---|---|---|
| `repo` | 3/3 | health exit 0؛ **Ran 79 tests OK**؛ skill sync «0 differing files» |
| `psk` | 5/5 | **۵۷/۵۷ تست**؛ golden بدون regression؛ **top-1 ۱۰۰٫۰٪ · top-3 ۱۰۰٫۰٪ · safety ۱۰۰٫۰٪** (fa/en/mixed هر سه ۱۰۰٪)؛ bench p50 ۳۴٫۳۶۵µs (handler) و ۲۴۳٫۳۳۳µs (routing) |
| `lithos` | 3/3 | **۱۶ تست** pass؛ `node --check api/buffer-sync.js`؛ build سبز |
| `fjcod` | 2/2 | **۴۵ تست در ۵ فایل**؛ **E2E ۱۹/۱۹** با Chromium 153 و `E2E_STRICT=1`، صفر خطای console |
| `bison-brand-book` | 3/3 | **۲۴ تست** contract؛ build سبز؛ `npm audit --omit=dev` ⇒ **۰ آسیب‌پذیری** |
| `viking-team` | 4/4 | node **۱۱ تست**؛ python **Ran 15 tests**؛ app syntax؛ گامِ «نبودِ کلیدِ سرویس در `team/`» پاک (خودِ الگوها در این دفتر نوشته نمی‌شوند تا بازبینیِ امنیتیِ diff هشدارِ کاذب نگیرد) |
| `hermes` | 5/5 | shell syntax سه فایل؛ check ۳۸ ماژول؛ **۲۵۵ تست واحد**؛ **۱۰ تست integration**؛ skills-build سبز |
| `mobile` | 3/3 | index-cache «**۵۷۴۸** routable · `mega-mobile-v1-f0a03afbdf7bc464` · ۲٬۲۴۳٬۸۶۰B raw / ۴۰۹٬۹۱۲B gzip · بودجه ۳٬۱۴۵٬۷۲۸»؛ **۱۷ تست**؛ syntax |
| `brand-stickers` | 2/2 | asset-contract و manifest هر دو سبز |
| `brand-viking` | 4/4 | asset-contract؛ renderer syntax؛ renderer **۳ تست**؛ content-contract **۷ تست** |
| `viking-motion` | 2/2 | typecheck سبز؛ spec **۶ تست** |
| `orchestrator` | 3/3 | contract «repository contract: OK»؛ **pytest ۲۱ passed + ۳ skipped مستند** (artifactهای تاریخی materialize نشده‌اند؛ گیتِ سخت `--require-materialized-skills`)؛ `deno check --no-remote` سبز |
| `router` | 3/3 | sync بدون drift؛ **Ran 79 tests OK**؛ `verify_skills.py --strict` ⇒ **Summary: HASHED: 3020** |

### ۷٫۶) اثباتِ جهش (mutation) — نگهبان واقعاً نگهبان است
| جهش | انتظار | نتیجهٔ واقعی |
|---|---|---|
| `PROGRESS.md`: «**۶٬۰۲۹**» → «**۶٬۰۱۹**» | قرمز | **FAILED (failures=2)** ✅ |
| `PROGRESS.md`: «**۷۹ تست ریشه**» → «**۷۳ تست ریشه**» | قرمز | **FAILED (failures=1)** ✅ |
| `scripts/doctor.mjs`: حذفِ گامِ `skill-library-sync` (۴۲→۴۱) | قرمز | **FAILED (failures=1)** با پیامِ `'۴۱' not found` ✅ |

پس از هر جهش، فایل از روی کپیِ بایت‌به‌بایت بازگردانده شد و برابری با **SHA-256 یکسان** ثابت شد (`PROGRESS.md` = `3d69f113…fa39`، `scripts/doctor.mjs` = `049bc462…7e38`)؛ `git status` هم نشان داد `doctor.mjs` تغییرکرده باقی نمانده.
**تلاشِ ناموفقِ نخست:** جهشِ سوم در اجرای اول واقعاً اعمال نشد (الگوی جست‌وجو با فاصله‌های فایل نمی‌خواند و `AssertionError: pattern not found` داد) و خروجی «OK» بی‌معنی بود؛ با حذفِ خطِ واقعی تکرار شد و این بار نگهبان قرمز شد. «OK» روی جهشِ اعمال‌نشده، اثباتِ نگهبان نیست.

### ۷٫۷) گیت‌های پایانی
`python3 -m unittest discover -s tests -p "test_*.py"` ⇒ **Ran 79 tests — OK** · `sync_skill_library.py --check` ⇒ **0 differing files** · `scan_secrets.py` ⇒ **0 finding(s), 0 read/size error(s)** · `repo_health_check.sh` ⇒ **exit 0** · `mobile/build-index.py --check` ⇒ سالم و بدون drift.

### ۷٫۸) محدودیت‌ها و کارهای بازِ این دور
- **بدون تغییرِ رفتارِ محصول:** هیچ کدِ اجراییِ محصول عوض نشد؛ فقط متن، مستندات و یک فایلِ تستِ تازه.
- **NOT RUN / تأییدنشده:** Supabase RLS و migration (چام/وایکینگ/لیتوس)، `LITHOS_OWNER_EMAILS` و کلیدِ رایگانِ provider در Vercel، انتشار Worker هرمس، API زندهٔ Buffer، Safari/iPhone فیزیکی، رندرِ MP4 موشن در این دور (فقط typecheck/spec اجرا شد)، و وضعیتِ ریپوی `POINT/fjcod` (بیرونِ این checkout).
- **انجام شد (فقط با مجوزِ صریحِ مالک در همین نوبت):** commit روی شاخهٔ کاری `arena/f47ed04a-megaskillclaude` (بدون force push و بدون rewrite تاریخچه).
- **انجام نشد (عمداً و بدون مجوزِ جدا):** push به هر شاخه، بازکردن/merge هر PR، release/tag، deploy، هر DDL/DML یا migration یا seed، تغییرِ secret/permission/OAuth/webhook، فعال‌سازی سرویسِ پولی یا سهمیه‌دار، و Archive/حذف/انتقالِ مخزن.
- **گام بعدیِ پیشنهادی:** همین نگهبان را در `docs/directives/README.md` به‌عنوان قانونِ «شمارندهٔ جاری باید منبعِ canonical داشته باشد» مستند کن تا دفترِ directiveها هم اجازهٔ عددِ بی‌منبع ندهند (تغییرِ متن، بدون ریسک)؛ سپس سراغِ P0 واقعی یعنی اتصالِ انتشار و SQL/RLS روی staging برو که نیازمندِ دسترسیِ زنده و تأییدِ جداست.

## ۸) لاگ جریان — ۲۰۲۶-۱۰-۲۰ (اجرای دسته‌ایِ backlog: تسک‌های ۴، ۵، ۶، ۳۶، ۳۷، ۵۰، ۵۹، ۹۷)

### ۸٫۱) چه چیزی و چرا
دستورِ مالک: «تمام تسک هارو یکبار pr کن». پس هر تسکی از `docs/AGENT_TASKS_100.md` (PR #95) که **بدونِ دسترسیِ زنده و بدونِ نصبِ پولی** قابلِ اجرا بود در همین دور پیاده شد و همه در **یک PR (به‌صورت DRAFT)** می‌روند؛ محتوای PR #97 (تسک ۹۹) هم چون هنوز merge نشده داخلِ همین مجموعه است. اصلِ ثابتِ همهٔ تسک‌ها: هر ادعای عددی باید از **منبعِ canonicalِ داخلِ ریپو** بازخوانی شود و با یک نگهبان قفل بماند.

### ۸٫۲) تغییرها
| فایل | تغییر | تسک |
|---|---|---|
| `.claude/skills/mega-skills-router/scripts/route.py` · `plugins/mega-skills-router/skills/mega-skills-router/scripts/route.py` | aliasهای برند (`هرمس/چام/وایکینگ/آفرود` + فرم‌های انگلیسی) و `خنده‌دار→funny`، `هالووین→halloween`؛ **هر دو کپی بایت‌به‌بایت یکسان** | ۴، ۵ |
| `tests/test_mega_skills_router.py` | دو تستِ پذیرش: هم‌ارزیِ توکنِ فارسی/انگلیسی، و مسیریابیِ «کپشن خنده دار هالووین» از مسیرِ `main()` (نه `search_index`) | ۴، ۵ |
| `tests/test_status_counters.py` | هلپرهای `node_test_count`/`python_test_count`/`hermes_suite_counts`/`sticker_assets`/`motion_spec`/`psk_counts` + جدولِ `DIRECTIVE_COUNTERS` برای **هر ۱۳ directive** + نگهبانِ سطرِ هرمس در `PORTFOLIO.md` | ۹۷، ۳۶ |
| `docs/directives/*.md` (۱۲ سند) | بخشِ «وضعیتِ جاری» با اعدادِ اندازه‌گیری‌شده و NOT RUN هر حوزه (سندِ ۱۱ از قبل داشت) | ۹۷ |
| `docs/PORTFOLIO.md` | سطرِ هرمس: `۲۵۲ تست` → **۲۵۵ تست واحد (۷۹ worker) + ۱۰ integration**؛ شمارِ تستِ ریشه → **۹۷** | ۳۶ |
| `scripts/doctor.mjs` | همان عددِ کهنهٔ `۲۵۲` در متنِ `why` اصلاح شد (رفتار تغییر نکرد) | ۳۶ |
| `brands/viking-offroad/stickers/src/package-lock.json` | **فایلِ تازه**: `lockfileVersion 3`، `playwright-core@1.56.0` دقیق از registry | ۵۹ |
| `brands/viking-offroad/stickers/README.md` | `npm install --no-package-lock` → **`npm ci`** + توضیحِ نگهبانِ SHA | ۵۹ |
| `.github/dependabot.yml` · `docs/DEPENDENCY_REVIEW.md` · `tests/test_repo_normalization.py` | پوششِ پوشهٔ تازه (۸ هدفِ هفتگی)، بخشِ تریاژِ مخصوصِ آن با verdict **امن**، و به‌روزرسانیِ `NPM_PROJECTS`/`npm_dirs` | ۵۹ |
| `tests/test_repo_normalization.py` | نگهبانِ #۳: sha256+بایت+IHDR هر **۳۷۳ PNG** در برابرِ `MANIFEST.json` (دوطرفه: فایلِ بیرون از manifest هم قرمز می‌شود)؛ نگهبانِ #۴: هر مسیرِ نام‌برده در `viking-team/SETUP.md` باید وجود داشته باشد | ۵۹، ۵۰ |
| `viking-team/SETUP.md` | **فایلِ تازه**: چک‌لیستِ مالک (ترتیبِ دو فایلِ SQL، تریگر و کدِ `23514`، ردیفِ مدیرِ اول، Confirm email، URL Configuration، کلیدها، ۶ آزمونِ پذیرش، NOT RUN) | ۵۰ |
| `scripts/check-supabase.mjs` · `tests/check-supabase.test.mjs` | **فایل‌های تازه**: سنجهٔ read-only آمادگیِ Supabase فقط با URL + کلیدِ publishable (۹ تست با fetchِ mock) | ۳۷ |
| `.github/workflows/ci.yml` | گامِ تازه در jobِ `repo-health`: `node --check` + `--expected-only` + `node --test tests/check-supabase.test.mjs` | ۳۷ |
| `scripts/build_claudeai_skill.py` · `tests/test_claudeai_skill_build.py` | **فایل‌های تازه**: ساختِ zip رسمیِ claude.ai در دو واریانتِ `full`/`lite`، خودبسنده و بایت‌بایت بازتولیدپذیر (۸ تست) | ۶ |
| `.gitignore` | `dist/` (خروجیِ پیش‌فرضِ سازندهٔ zip) | ۶ |

### ۸٫۳) پذیرش‌ها — خروجیِ واقعیِ فرمان‌ها
| تسک | فرمان | خروجیِ دیده‌شده |
|---|---|---|
| ۵ | `route.py "کپشن خنده دار هالووین"` (و فرمِ ZWNJ) | `[social-captions-batcher, caption-cta-bank, caption-writer-fa]` — قبلاً `[]` بود |
| ۴ | `_tokens("کپشن خنده دار هالووین") == _tokens("caption funny halloween")` | `{caption, funny, halloween}` در هر دو؛ رتبهٔ «چام/وایکینگ» **بلاک** (skill مربوطه در ایندکس نیست) |
| ۳۶ | `npm test --prefix hermes` + شمارشِ ایستا روی همان ۱۶ فایلِ `scripts.test` | **۲۵۵ تست / pass 255 / fail 0**؛ `worker.test.mjs` = **۷۹**؛ `test:integration` = **۱۰** |
| ۵۹ | `npm ci` در `stickers/src` | «added 1 package, audited 2 packages» و **found 0 vulnerabilities**؛ SHA هر ۳۷۳ PNG با manifest برابر |
| ۳۷ | `node --test tests/check-supabase.test.mjs` | **۹ تست / pass 9 / fail 0**؛ `--expected-only` بدونِ کلید و بدونِ شبکه؛ بدونِ کلید ⇒ exit 2 |
| ۵۰ | نگهبانِ #۴ | **۶ مسیرِ واقعی** بررسی شد؛ جهشِ `team/app.js`→`team/client.js` ⇒ قرمز |
| ۶ | `build_claudeai_skill.py --variant both` | lite **۳٬۲۳۱٬۲۳۱ بایت** (۶۱٫۶٪ سقفِ ۵MB) با ۳٬۰۱۸ skill؛ full **۱۶٬۸۲۰٬۴۰۱ بایت** با ۶٬۰۲۹ skill در **۱٫۵ ثانیه**؛ ساختِ دوباره ⇒ **sha256 یکسان** |
| ۶ | اجرای routerِ **داخلِ zipِ استخراج‌شده** | هر `path` برگشتی در **هر دو** zip وجود دارد (۳ نتیجه برای lite، ۳۰ برای full) |
| ۹۷ | `python3 -m unittest tests.test_status_counters` | **۱۰ تست OK**؛ هر ۱۳ directive بخشِ «وضعیتِ جاری» با عددِ canonical دارند |

### ۸٫۴) اثباتِ جهش (mutation)
| جهش | انتظار | نتیجه |
|---|---|---|
| حذفِ aliasهای `funny/halloween` از هر دو `route.py` | قرمز | تستِ کپشن **FAILED** ✅ (بازگردانی با `cp -p` و `sync --check` = 0 differing) |
| `docs/directives/04-lithos.md`: «۱۶ تست» → «۹۹ تست» | قرمز | **FAILED** با پیامِ «no line pairing 'تست' with the canonical ۱۶» ✅ |
| `docs/directives/12-…`: «۳۰ fps» → «۶۰ fps» | قرمز | **FAILED** ✅ |
| `docs/PORTFOLIO.md`: «۲۵۵ تست واحد» → «۲۵۲» | قرمز | **FAILED** ✅ |
| یک بایت از `packs/pack-01-salam/01.png` | قرمز | **FAILED** با sha256 واقعیِ پیش/پس (`bc63b655…` → `221f1545…`) و بازگردانیِ تأییدشده ✅ |
| `viking-team/SETUP.md`: `team/app.js` → `team/client.js` | قرمز | **FAILED** ✅ |
| حذفِ حلقهٔ منبع‌ها از `build_claudeai_skill.py` | قرمز | **FAILED** در هر دو واریانت («returned path is not a file»)؛ بازگردانی با SHA-256 یکسان (`9e4f6ec8…`) ✅ |

### ۸٫۵) گیت‌های پایانی (همه اجرا شدند)
`unittest discover -s tests` ⇒ **Ran 97 tests — OK** · `tests.test_mega_skills_router` ⇒ **۱۹ OK** · `sync_skill_library.py --check` ⇒ **0 differing files** · `scan_secrets.py` ⇒ **0 finding(s)** · `check_brand_assets.py --stickers` ⇒ **۳۶۰ PNG معتبر** · `build_sticker_manifest.py --check` ⇒ **OK** · `mobile/build-index.py --check` ⇒ **5748 routable، بودجه سالم** · `node --test tests/doctor.test.mjs` ⇒ **1/1** · `repo_health_check.sh` ⇒ **exit 0** · psk: `npm test` **۵۷/۵۷**، `routing:golden` **۱۰۸ کیس**، `routing:accuracy` **top-1/top-3/safety = ۱۰۰٫۰٪**.

### ۸٫۶) NOT RUN / بلاک (صریح)
- **تسک‌های ۱–۳ (رتبهٔ «چام»، «وایکینگ»، «تور آفرود وایکینگ»):** aliasها اضافه شدند ولی ایندکس هیچ skill از این برندها ندارد؛ افزودنِ skill یعنی بازتولیدِ `triggers.json` که **تولیدکننده‌اش در این ریپو نیست** (`sync_skill_library.py` فقط annotate/propagate می‌کند) ⇒ بدونِ آن، رتبه‌سنجی ممکن نیست.
- **تسک‌های ۱۹–۲۱، ۳۸، ۳۹، ۴۹، ۹۸، ۱۰۰:** اجرا نشدند (نیاز به سرویسِ زنده/مرورگر/CI-تغییر یا در حوزهٔ مالک).
- **doctor کاملِ ۴۲ گام:** در این checkoutِ تازه `node_modules` بیشترِ پروژه‌ها نصب نیست ⇒ فقط گام‌های سبک اجرا شد.
- **رندرِ دوبارهٔ استیکر (Chromium) و E2E چام:** بدونِ مرورگر قابلِ اجرا نیست؛ به‌جایش پایداریِ SHA با manifest قفل شد.
- **Supabase/Vercel/Cloudflare/Buffer زنده، migration، seed، انتشار Worker:** بیرونِ دسترسی و نیازمندِ تأییدِ جدا.

### ۸٫۷) مجوزها
انجام شد (با مجوزِ قبلیِ مالک): commit و push روی شاخهٔ کاری و بازکردنِ **یک PR به‌صورت DRAFT**. انجام نشد (بدونِ مجوزِ جدا): merge/close هر PR، release/tag، deploy، force push، بازنویسیِ تاریخچه، هر DDL/DML یا migration یا seed، تغییرِ secret/permission/OAuth/webhook، فعال‌سازیِ سرویسِ پولی، Archive/حذف/انتقالِ مخزن.

## ۹) لاگ جریان — ۲۰۲۶-۱۰-۲۰ (ادامهٔ همان PR: تسک‌های ۱۹، ۲۰، ۲۱ در هرمس و ۹۸ در CI)

### ۹٫۱) چه چیزی و چرا
ادامهٔ دستورِ «تمام تسک هارو یکبار pr کن» روی **همان PR #98** (بدونِ PR دوم). چهار تسکِ باقی‌مانده که بدونِ دسترسیِ زنده ممکن بودند: سه P0 در هرمس (۱۹، ۲۰، ۲۱) و یک P1 در CI (۹۸). اصلِ حاکم: هر سه تغییرِ هرمس با تستِ واقعیِ همان ماژول قفل شدند و هیچ تستِ موجودی حذف یا ضعیف نشد — دو assertionِ `diagnose.test.mjs` **قوی‌تر** بازنویسی شدند (پیامِ جدید + حفظِ دلیلِ خامِ بالادستی).

### ۹٫۲) تغییرها
| فایل | تغییر | تسک |
|---|---|---|
| `hermes/diagnose.mjs` | `explainFailure()` + `probe(…, explain)`؛ `getOk` حالا `err.status` را نگه می‌دارد؛ کاتالوگِ **صفر-مدل** دیگر «کلید معتبر است (۰ مدل)» نیست بلکه شکست با راهنمایِ مجوز است؛ بودجهٔ `trim` برای پیامِ توضیح‌دار ۱۴۰→۲۶۰ تا شاهدِ خام بریده نشود | ۱۹ |
| `hermes/diagnose.test.mjs` | ۲ assertion قوی‌تر + ۲ تستِ تازه (کاتالوگِ خالیِ GitHub Models؛ `explainFailure` فقط آنچه می‌شناسد را ترجمه می‌کند و برای ۴۰۲/۴۰۰۶ همان دلیلِ خام را برمی‌گرداند) | ۱۹ |
| `hermes/resilience.mjs` | `ServicePark`: شمارشِ ۴۰۱/۴۰۳ در **KV**، پارک به مدتِ `PARK_MS` = یک ساعت پس از `PARK_THRESHOLD` = ۳ خطایِ متوالی، `succeed()` پاک‌کردنِ شمارنده، و تحملِ KV خراب (پارک هرگز نباید جواب را بشکند) | ۲۰ |
| `hermes/providers.mjs` | سیم‌کشیِ پارک در حلقهٔ مغزها: پیش از هر provider خوانده می‌شود، در شاخهٔ ۴۰۱/۴۰۳ ثبت و در پاسخِ موفق پاک می‌شود؛ پیامِ فارسیِ «۳ بار پشت‌سرهم رد شد؛ تا حدود N دقیقهٔ دیگر صدا زده نمی‌شود» | ۲۰ |
| `hermes/resilience.test.mjs` | ۵ تستِ تازه، از جمله پذیرشِ اصلی: پس از سه خطا **هیچ فراخوانیِ شبکه‌ای** برای آن سرویس انجام نمی‌شود (`calls` بدون تغییر) و پس از یک ساعت دوباره صدا زده می‌شود | ۲۰ |
| `hermes/providers.mjs` | `fitSystem` حالا بلوک‌های محافظت‌شده (`OWNER PORTFOLIO KNOWLEDGE` و `LONG-TERM NOTES`) را **پیش از هر برشی** رزرو می‌کند (`PROTECTED_SHARE` = ۰٫۵۵، حداقل ۳۰۰ نویسه) و هر بلوک را با نشانِ خودش نگه می‌دارد؛ منطقِ قبلی به `fitPersona()` منتقل شد تا مسیرِ بدونِ نشان دست‌نخورده بماند؛ `FULL_BUDGET`/`SMALL_BUDGET` صادر شدند | ۲۱ |
| `hermes/conversation.mjs` | بلوکِ یادداشت‌ها به `withNotes()` استخراج شد (بدونِ تغییرِ خروجی) تا تستِ بودجه **ترکیبِ واقعیِ production** را بسنجد، نه بازسازیِ دستیِ آن | ۲۱ |
| `hermes/fitsystem.test.mjs` | تستِ پارامتری روی **هر ۷ provider** × دو بودجه (`provider.budget` و `SMALL_BUDGET`) با fixture از **سندهای واقعیِ ریپو** (`docs/PORTFOLIO.md`، `psk/PROGRESS.md`) | ۲۱ |
| `scripts/check_commit_identity.py` | **فایلِ تازه**: هفت الگویِ «انتساب به مدل» (تریلرِ co-author، generated-with، مدل به‌عنوانِ نویسنده، `AI-generated`، سخن‌گفتن به‌عنوانِ AI، ایموجیِ ربات، `Signed-off-by` رباتیک) و **نه** نامِ محصول؛ دامنهٔ پیش‌فرض = commitهای زیرِ بررسی، `--all-history` برای ممیزی؛ «هیچ چیزی اسکن نشد» هرگز PASS نیست | ۹۸ |
| `tests/test_commit_identity.py` | **فایلِ تازه**: ۷ تست، شاملِ جهشِ سطحِ git با `git commit-tree` (commitِ معلق با تریلر ⇒ exit 1، بدونِ آن ⇒ exit 0) | ۹۸ |
| `.github/workflows/ci.yml` · `tests/test_repo_normalization.py` | job تازهٔ `commit-identity` با `fetch-depth: 0` و `filter: blob:none` (فقط پیام‌ها دانلود می‌شوند) + گامِ متنِ PR؛ نگهبانِ مجموعهٔ jobها به ۱۲ به‌روز شد و محتوای job (بی‌secret بودن) هم سنجیده می‌شود | ۹۸ |
| `docs/PORTFOLIO.md` · `docs/directives/00-monorepo.md` · `docs/directives/02-hermes.md` · `scripts/doctor.mjs` | اعدادِ canonical: هرمس ۲۵۵→**۲۶۳** تستِ واحد (worker همان ۷۹، integration همان ۱۰) و تستِ ریشه ۹۷→**۱۰۴**. هر دو را **نگهبان‌های دورِ قبل لو دادند** و مقدارِ درست را خودشان گفتند | — |

### ۹٫۳) پذیرش‌ها — خروجیِ واقعی
| تسک | فرمان | خروجی |
|---|---|---|
| ۱۹ | `node --test diagnose.test.mjs` | **۷ تست / ۷ pass**؛ پیامِ Gemini ⇒ «کلید GEMINI_API_KEY نامعتبر است؛ در Cloudflare … عوض یا حذف کن» + `(400 API key not valid…)`؛ GitHub Models با صفر مدل ⇒ «توکن … مجوز Models: Read ندارد (کاتالوگ ۰ مدل داد)» و `ok: false` |
| ۲۰ | `node --test resilience.test.mjs` | **۹ تست / ۹ pass**؛ پس از سه ۴۰۱/۴۰۳ ⇒ رکوردِ `service-park:Groq` در KV با `failures: 3` و `reason: HTTP 403` (هرگز مقدارِ کلید) و **صفر فراخوانیِ شبکه** در دورِ بعد؛ پس از یک ساعت دوباره فعال و با یک پاسخِ سالم پاک می‌شود |
| ۲۱ | `node --test fitsystem.test.mjs` | **۴ تست / ۴ pass**؛ پیش از رفع: «GitHub Models @ 5000: the project-knowledge block was dropped» ⇒ پس از رفع، در هر ۷ provider و هر دو بودجه، حافظه (`NOTE-MARK`) و دانشِ پروژه (`PORTFOLIO-MARK`) و سرآغازِ persona زنده‌اند و طول از بودجه بیشتر نمی‌شود |
| ۹۸ | `python3 -m unittest tests.test_commit_identity` | **۷ تست OK**؛ `--range origin/main...HEAD` ⇒ clean؛ `--all-history --json` ⇒ **۲۳۵ commit، ۱۸۱ ادعا** (همه `co-author trailer`) |
| همه | `npm test --prefix hermes` · `npm run test:integration` · `npm run check` | **۲۶۳ تست / ۲۶۳ pass / ۰ fail** · **۱۰/۱۰** · `node --check` روی ۳۸ ماژول بدون خطا |

### ۹٫۴) اثباتِ جهش
| جهش | انتظار | نتیجهٔ واقعی |
|---|---|---|
| `PARK_THRESHOLD` از ۳ به ۵ | قرمز | ۳ تستِ تسک ۲۰ **not ok** (pass 6 / fail 3) ✅ |
| `fitSystem`: غیرفعال‌کردنِ شناساییِ نشان (`protectedAt = -1`) | قرمز | **not ok** با همان پیامِ «the project-knowledge block was dropped» ✅ |
| `diagnose.mjs`: کوتاه‌کردنِ راهنمایِ کلیدِ Gemini | قرمز | ۳ تست **not ok** ✅ |
| commitِ معلق با تریلرِ `Co-Authored-By: Claude Opus 5.5` (با `git commit-tree`؛ هیچ شاخه‌ای جابه‌جا نشد) | قرمز | `--range <sha>^..<sha>` ⇒ **exit 1** و همان commit بدونِ تریلر ⇒ **exit 0** ✅ |

بازگردانیِ هر سه فایل با `cp -p` و سپس `sha256sum -c` ⇒ **هر سه OK**؛ اجرای مجدد: **۲۰ تست / ۲۰ pass**.

### ۹٫۵) یافتهٔ مهمِ این دور (نیازمندِ تصمیمِ مالک)
`scripts/check_commit_identity.py --all-history` روی تاریخچهٔ واقعی: **۱۸۱ ادعایِ شناسه در ۲۳۵ commit**، همه از نوعِ تریلرِ `Co-Authored-By: Claude … <noreply@anthropic.com>` (از جمله `Claude Opus 5.5`، `Claude Opus 4.8`، `Claude Sonnet 5.5`). یعنی:
- نگهبانِ تسک ۹۸ **بیکار نیست** — روی دادهٔ واقعی قرمز می‌شود؛
- ولی پاک‌کردنِ تاریخچهٔ منتشرشده یعنی **بازنویسیِ تاریخچه + force push** که بدونِ مجوزِ صریحِ جدا انجام نمی‌شود ⇒ **NOT RUN**؛
- پس دامنهٔ گیت عمداً «commitهای زیرِ بررسی» است (`origin/<base>...HEAD` در CI، در غیرِ این صورت `HEAD`) تا از ورودِ مواردِ تازه جلوگیری کند بدونِ اینکه روی ارثیه قرمزِ دائمی بدهد و در نتیجه خاموش شود.

### ۹٫۶) بازیابیِ محیط (بدونِ از دست رفتنِ کار)
فضای کاری بینِ دو نوبت **re-clone** شده بود: `HEAD` به `79f22db5` برگشته بود، کلون shallow (`git rev-list --count HEAD` = ۱) و `origin/arena/…` محلی وجود نداشت، در حالی که commitِ نوبتِ قبل (`935da365`) سالم روی GitHub و داخلِ PR #98 بود و تغییراتش به‌صورتِ uncommitted در درخت مانده بود. بازیابی: `git fetch origin <branch>:refs/remotes/origin/<branch>` + `git reset --mixed origin/<branch>` (بدونِ `--hard`، بدونِ force push، بدونِ بازنویسیِ تاریخچه) و سپس `git fetch --unshallow --filter=blob:none` برای ممیزیِ تاریخچه. پس از آن `git status` دقیقاً تغییراتِ همین نوبت را نشان داد.

### ۹٫۷) NOT RUN / بلاک
- **تسک ۳۸** (صفحهٔ «راه‌اندازی اولیه» در اپِ چام): به‌خاطرِ قيدِ still-bindingِ «ساختِ ویژگیِ تازهٔ CHAM در این ریپو تا اثباتِ منبعِ انتشارِ واقعی (`POINT/fjcod` → `cham-store-os.vercel.app`)» ⇒ تصمیم با مالک.
- **تسک ۱۰۰** (workflow هفتگیِ doctor→issue): نیازمندِ `permissions: issues: write` است و پذیرشش «اجرای دستیِ موفقِ workflow»؛ تغییرِ permission در CI و اجرای واقعی روی GitHub بیرونِ مجوزِ فعلی است ⇒ **NOT RUN**.
- **تسک‌های ۱–۳**: بدونِ تغییر (تولیدکنندهٔ `triggers.json` در ریپو نیست).
- **۳۹/۴۹** (pgTAP و jobِ RLS): نیاز به Supabase/Postgres زنده.
- اجرای زندهٔ `check-supabase.mjs` روی پروژهٔ واقعی، انتشارِ Worker، رندرِ استیکر، E2E چام و doctor کاملِ ۴۲ گام (در این checkout فقط `hermes` و `stickers/src` وابستگی دارند).

### ۹٫۸) گیت‌های پایانی
`python3 -m unittest discover -s tests -p "test_*.py"` ⇒ **Ran 104 tests — OK** · `npm test --prefix hermes` ⇒ **۲۶۳/۲۶۳** · `npm run test:integration --prefix hermes` ⇒ **۱۰/۱۰** · `npm run check --prefix hermes` ⇒ **۳۸ ماژول، بدون خطا** · `node --test tests/check-supabase.test.mjs` ⇒ **۹/۹** · `node --test tests/doctor.test.mjs` ⇒ **۱/۱** · `sync_skill_library.py --check` ⇒ **0 differing files** · `scan_secrets.py` ⇒ **0 finding(s)** · `check_brand_assets.py --stickers` و `build_sticker_manifest.py --check` ⇒ سالم · `mobile/build-index.py --check` ⇒ سالم · `repo_health_check.sh` ⇒ **exit 0** · psk ⇒ **۵۷/۵۷**، golden **۱۰۸ کیس**، accuracy **۱۰۰٫۰٪**.

### ۹٫۹) مجوزها
انجام شد (با همان مجوزِ قبلی): commit و push روی شاخهٔ کاریِ همین PR (fast-forward، بدونِ force). انجام نشد: merge/close هر PR، ready-for-review کردنِ PR، release/tag، deploy، force push، بازنویسیِ تاریخچه (از جمله پاک‌کردنِ تریلرهای ارثی)، هر DDL/DML/migration/seed، تغییرِ secret/permission/webhook، سرویسِ پولی.

### ۹٫۱۰) قرمزیِ CI روی pushِ اول و رفعِ آن (با بازتولید، نه حدس)
pushِ اولِ این دور (`4ccf6799`) سه job را قرمز کرد: `commit-identity` (گامِ «Identity-checker regressions»)، `router` (گامِ `python -m unittest discover`) و `repo-health` (گامِ `node --test tests/doctor.test.mjs` — که خودش `scripts/doctor.mjs repo --json` را اجرا می‌کند و سطرِ `common-tests` را `pass` می‌خواهد، پس هر شکستی در سوئیتِ پایتون آن را قرمز می‌کند). لاگِ jobها در این سندباکس خوانده نمی‌شود (`actions/jobs/<id>/logs` ⇒ ۰ بایت از `productionresultssa16.blob.core.windows.net`؛ annotationها فقط «exit code 1») ⇒ علت **بازتولیدِ محیطِ runner** شد:

- در همان ریپو، حتی با `GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null HOME=/tmp/fakehome` ⇒ تست **OK** (چون `.git/config` همین کلون هویت دارد).
- در `git clone --depth 1` تازه در `/tmp/ci-sim` (دقیقاً وضعیتِ runner) ⇒ **شکست**: `git commit-tree` با «Author identity unknown … fatal: empty ident name (for <user@e2b.local>) not allowed».

یعنی تستِ جهشِ تسک ۹۸ به هویتِ gitِ محیط وابسته بود. رفع: هویت روی خودِ خطِ فرمان (`git -c user.name=identity-guard -c user.email=identity-guard@localhost -c commit.gpgsign=false commit-tree …`) تا نه به configِ runner وابسته باشد نه به کلیدِ امضا. تأیید پس از رفع، در همان کلونِ شبیهِ CI: `tests.test_commit_identity` ⇒ **۷ OK**، `discover` کامل ⇒ **Ran 104 tests — OK**، `node --test tests/doctor.test.mjs` ⇒ **۱/۱**.
شبیه‌سازیِ خودِ jobِ `commit-identity` هم با merge refِ واقعیِ PR انجام شد (`git fetch origin refs/pull/98/merge` ⇒ `b96de505`): `--range origin/main...FETCH_HEAD` ⇒ **۳ commit، clean، exit 0** (commitِ mergeِ خودِ GitHub هم پاک است) و متنِ واقعیِ PR از همان pipelineِ `printf` ⇒ **clean، exit 0**. کلونِ blobless با تاریخچهٔ کامل در این سندباکس ساخته نمی‌شود (`early EOF` / `bad pack header` روی `file://`) ⇒ آن بخش **NOT RUN** و به خودِ CI واگذار شد.

## ۱۰) لاگ جریان — ۲۰۲۶-۱۰-۲۲ (پنج تسکِ حوزهٔ روتر/کتابخانهٔ مهارت + تریاژِ کاملِ ۱۰۰ تسک)

### ۱۰٫۱) چه چیزی و چرا
ادامهٔ همان PR (#98، بدونِ PR دوم). این دور سراغِ خوشهٔ **روتَر و کتابخانهٔ مهارت** رفت، چون بیشترین تسکِ P1/P2ِ آفلاین‌شدنی آن‌جا بود و چون یک حفرهٔ واقعی پیدا شد: `route.py` و `SKILL.md` **دو کپیِ دستی** هستند و تستِ برابریِ قدیمی فقط از خطِ `DEFAULT_MIN_SCORE` به پایین را مقایسه می‌کرد — یعنی کلِ واژگانِ `ALIASES`/`SYNONYMS` می‌توانست در یک کپی عوض شود و هیچ تستی قرمز نشود (تسک ۱۴ دقیقاً همین را می‌خواست).
پیش از هر تغییری اندازه‌گیری شد: ۲۴ + ۲۵ + ۲۵ عبارتِ فارسیِ واقعی با CLI اجرا شد تا عبارت‌هایی که **امروز `[]` می‌دهند** پیدا شوند (۱۵ مورد)، و واژگانِ انگلیسیِ موجود در ایندکس شمرده شد تا نقشهٔ هم‌معنا از واژه‌هایی ساخته شود که **واقعاً در ایندکس هستند** (`depreciation`، `memoir`، `taxpayer`، `reservation`، `stocktaking`، `advertisement` در **۰** مهارت بودند ⇒ عمداً استفاده نشدند).

### ۱۰٫۲) تغییرها
| فایل | تغییر | تسک |
|---|---|---|
| هر دو کپیِ `scripts/route.py` (۲۹۵/۲۸۵ خط) | `SYNONYMS` با **۲۷ ورودیِ اندازه‌گیری‌شده** + `_synonym_query()` + یک retry خودکار **فقط وقتی نتیجه خالی است**؛ نتیجهٔ retry با `"fallback": "synonym"` علامت می‌خورد. `--min-score` صریح **نقض نمی‌شود** (retry همان آستانه را نگه می‌دارد) | ۱۰ |
| همان دو کپی | `search_index(..., explain=True)` و فلگِ `--explain`: `query_tokens`، `token_weights` (وزنِ IDF هر توکن)، `matched_tokens`، `unmatched_tokens`، `trigger_tokens`، `coverage`، `phrase_match`، `name_hits`. خروجیِ پیش‌فرض **بدونِ تغییر** ماند | ۱۱ |
| همان دو کپی | `--json-lines` (یک شیءِ فشرده در هر خط) و `--fields name,score,…` از میانِ **۸ فیلدِ معتبر**؛ فیلدِ ناشناخته ⇒ `parser.error` با فهرستِ معتبرها؛ `--fields` بر `--explain` اولویت دارد تا مصرف‌کنندهٔ ارزان پولِ تشخیص ندهد | ۱۶ |
| `scripts/scan_third_party_skills.py` (تازه) | اسکنرِ ۱۰ الگو (prompt-override، persona-hijack، `curl\|sh`، base64→exec، reverse-shell، exfil-endpoint، credential-path، sudo، install-hook، hidden-content) روی `library/github-skills`؛ دو دامنهٔ `instructions` (پیش‌فرض، CI) و `all` (ممیزی)؛ خروجیِ **قطعی** (بدونِ timestamp)؛ `--check` مثلِ lockfile گزارشِ commit‌شده را مقایسه می‌کند؛ **هیچ فایلی را حذف یا بازنویسی نمی‌کند** | ۱۷ |
| `library/SECURITY_SCAN.md` (تازه، تولیدی) | گزارشِ ۲۲۱ خطی: جدولِ دامنه، جدولِ ۱۰ الگو، صفِ بازبینیِ همهٔ یافته‌ها، و بخشِ «خطوطِ متمایز» که ۱۶۶ یافته را به **۱۰۷ خطِ متمایز** فرومی‌کاهد (۱۶ مهارت یک boilerplateِ مشترک دارند) | ۱۷ |
| `tests/test_skill_router_sync.py` (تازه، ۶ تست) | نگهبانِ تسک ۱۴: کپیِ پلاگینِ `route.py` باید **بایت‌به‌بایت** حاصلِ سه جایگزینیِ مستند از کپیِ canonical باشد (کلِ فایل، نه فقط از `DEFAULT_MIN_SCORE`)؛ `SKILL.md` فقط در سه خطِ مستند (۱۱/۱۳/۱۸ از ۲۰)؛ دو ایندکس skill‌به‌skill برابر جز فرمِ مسیر؛ ۱۵ فایلِ domain با نشانِ `incomplete`؛ ۴۶ notice مجوز بایت‌به‌بایت؛ و ۴۰ `INSTRUCTIONS.md` نمونه برابرِ مبدأ canonical | ۱۴ |
| `tests/test_third_party_skill_scan.py` (تازه، ۵ تست) | درختِ fixture با یک مهارت برای هر الگو + یک decoy؛ اثباتِ اینکه اسکنر **چیزی را تغییر نمی‌دهد** (هشِ درخت قبل/بعد)؛ ردکردنِ فایلِ باینری؛ قطعیتِ بایتِ گزارش؛ قرمزیِ `--check` با یک بایت drift | ۱۷ |
| `tests/test_mega_skills_router.py` | ۴ تستِ تازه: ۱۵ عبارتِ خالی × ۲ کپی (premise هم assert می‌شود)، retry نباید وقتی چیزی match شده فعال شود، `--explain` و وزنِ IDF، و دو مودِ خروجی + اعتبارسنجیِ `--fields` | ۱۰/۱۱/۱۶ |
| `tests/test_repo_normalization.py` | **نگهبانِ #۵** برای `docs/BACKLOG_TRIAGE.md`: پوششِ هر ۱۰۰ شماره دقیقاً یک بار، وضعیت‌ها فقط از راهنما، جمعِ جدول = شمارِ سطرها، و هر `DONE` باید commit/PR نام ببرد | — |
| `docs/BACKLOG_TRIAGE.md` (تازه) | تریاژِ کاملِ ۱۰۰ تسک با دلیلِ اندازه‌گیری‌شده (پایین‌تر) | — |
| `.github/workflows/ci.yml` | گامِ `python3 scripts/scan_third_party_skills.py --check` در jobِ `router` (پس از `sync --check`) | ۱۷ |
| شمارنده‌ها | تستِ ریشه ۱۰۴→**۱۲۲** در `PROGRESS.md`، `docs/PORTFOLIO.md`، `docs/directives/00-monorepo.md` (هر سه را نگهبان مطالبه کرد) | — |

### ۱۰٫۳) پذیرش‌ها — خروجیِ واقعی
| تسک | فرمان | خروجی |
|---|---|---|
| ۱۰ | `route.py "<عبارت>"` روی ۱۵ عبارتِ خالی | **۱۵/۱۵ حل شد**؛ top-1ها: «انبارگردانی»⇒`stock-count-cycle-plan`، «بلیط هواپیما رزرو کن»⇒`domestic-flight-notes-ir`، «دفترچه خاطرات»⇒`diary`، «تنخواه گردان»⇒`petty-cash-management`، «مرخصی کارمند»⇒`hr-pro`/`leave-management`، «شیفت کاری»⇒`camp-roster-manager`، «متن آگهی استخدام»⇒`recruitment-pipeline`، «ترازنامه»⇒`financial-analyst` |
| ۱۱ | `route.py "سئو سایت" --limit 1 --explain` | `token_weights: {seo: 4.524373, website: 1.470994}`، `matched_tokens: [seo, website]`، `coverage: 1.0`، `name_hits: 1` ⇒ توکنِ نادر از عمومی سنگین‌تر است؛ بدونِ `--explain` هیچ کلیدِ اضافه‌ای در خروجی نیست |
| ۱۶ | `route.py … --json-lines --fields name,score` | دو خطِ فشرده، هر کدام یک شیء، فقط دو کلید، همان ترتیبِ آرایهٔ پیش‌فرض؛ `--fields name,bogus` ⇒ `error: unknown field(s) bogus; valid fields: …` (۸ فیلد) |
| ۱۷ | `scan_third_party_skills.py --report/--check` | دامنهٔ `instructions`: **۳٬۰۱۱ فایل / ۳۲٬۴۵۵٬۴۳۶ بایت / ۱۶۶ یافته در ۸۰ مهارت** در ۸٫۹ ثانیه؛ دامنهٔ `all`: **۱۴٬۷۸۶ فایل / ۱۱۹٬۵۷۲٬۸۷۷ بایت / ۲۵۷ یافته در ۹۹ مهارت** (۶ باینری رد شد) در ۳۱ ثانیه؛ `--check` ⇒ «report is current» |
| ۱۴ | `python3 -m unittest tests.test_skill_router_sync` | **۶ تست OK در ۰٫۳۱ ثانیه**؛ `sync_skill_library.py --check` هم هنوز **0 differing files** |
| همه | `python3 -m unittest discover -s tests -p "test_*.py"` | **Ran 122 tests — OK** (پیش از این دور ۱۰۴) |

### ۱۰٫۴) اثباتِ جهش
| جهش | نتیجه |
|---|---|
| یک بایت در `SYNONYMS` کپیِ پلاگین (`"بلیط": "ticket"`→`"tickets"`) | **RED** — همان حفره‌ای که تستِ قدیمی نمی‌دید ✅ |
| یک بایت در `SKILL.md` پلاگین | **RED** ✅ |
| یک `source_path` در `references/triggers.json` پلاگین | **RED** ✅ |
| یک مسیر در `references/domains/general.md` | **RED** ✅ |
| یک بایتِ اضافه در یکی از ۴۶ notice مجوز | **RED** ✅ |
| یک بایتِ اضافه در `references/skills/13c-metabolic-flux/INSTRUCTIONS.md` | **RED** ✅ |
| حذفِ سطرِ تسک ۴۲ از `docs/BACKLOG_TRIAGE.md` | **RED** ✅ |
| وضعیتِ یک سطرِ تسک به `WIP` (بیرونِ راهنما) | **RED** ✅ |
| جمعِ `DONE` در خلاصه ۱۸→۱۷ | **RED** ✅ |
| `DONE` بدونِ نامِ commit/PR (تسک ۱۹) | **RED** ✅ |

بازگردانیِ همه با `cp -p` و **تأییدِ SHA-256** (همه `restored=True`)؛ پس از بازگردانی: `test_skill_router_sync` ۶/۶، `test_repo_normalization` ۲۳/۲۳، `sync --check` ۰ differing.

### ۱۰٫۵) یافتهٔ این دور: یک فایلِ یتیمِ commit‌شده در کپیِ پلاگین
`plugins/mega-skills-router/skills/mega-skills-router/references/skills/_licenses/mattpocock__skills__LICENSE` در ایندکس skill نیست و هیچ کدی به آن ارجاع نمی‌دهد؛ **بایت‌به‌بایت برابر** با `references/licenses/mattpocock__skills__LICENSE` است (همان‌جا که `sync` امروز noticeها را می‌نویسد) و در commit `45818f1c` (۲۰۲۶-۱۰-۱۳، PR #45 «add Matt Pocock's skill pack») اضافه شده. علتِ ماندگاری: `synchronize()` فقط می‌نویسد و **هرگز prune نمی‌کند**، و `--check` هم فقط «تازگیِ» آنچه می‌نویسد را می‌سنجد، نه نبودنِ اضافات ⇒ هیچ گیتی آن را نمی‌دید.
اقدام: **حذف نکردم** (حذفِ فایلِ tracked نیازمندِ مجوزِ صریحِ مالک است). به‌جایش در `tests/test_skill_router_sync.py` به‌عنوانِ تنها استثناِ نام‌برده (`KNOWN_ORPHAN_DIRECTORIES = {"_licenses"}`) ثبت شد، پس **یتیمِ دوم** بلافاصله قرمز می‌کند. پیشنهاد: یا حذفِ همین یک فایل با تأیید شما، یا افزودنِ prune به `sync_skill_library.py` (تغییرِ رفتارِ ابزارِ canonical، باز هم با تأیید شما).

### ۱۰٫۶) تریاژِ کاملِ ۱۰۰ تسک ⇒ `docs/BACKLOG_TRIAGE.md`
تا پیش از این دور فقط ۲۰ تسک از ۱۰۰ بررسی شده بود. حالا هر ۱۰۰ تسک با دلیلِ اندازه‌گیری‌شده دسته‌بندی شده‌اند: **DONE ۱۸** · **QUEUED ۴۹** (آفلاین ممکن، در صف) · **BLOCKED/LIVE ۱۳** · **BLOCKED/OWNER ۱۳** · **BLOCKED/INDEX ۶** · **BLOCKED/NET ۱**. چند نمونه از سنجش‌هایی که «بلاک»ها را از «صف» جدا کرد: `import PIL` ⇒ ModuleNotFoundError (پس تسک‌های تصویری به venv+Pillow نیاز دارند، نه دسترسیِ زنده)؛ فونتِ Vazirmatn **در ریپو هست** (`brand/viking/assets/*.woff2`) پس تسک ۸۷/۵۸ دانلود نمی‌خواهند؛ `consumeFixedWindow` در `hermes/rate-limit.mjs`، `hermes/workspaces.test.mjs`، `hermes/skill-router.mjs`، `orchestrator/supabase/functions/github-llm-verifier/net.test.mjs` و `psk/api/tasks.js` **موجودند** پس تسک‌های ۲۳–۳۵، ۶۵–۷۰، ۹۴ قابلِ اجرا هستند؛ `mobile/vercel.json` وجود ندارد (تسک ۸۱).

### ۱۰٫۷) گیت‌ها
`discover` ⇒ **Ran 122 tests — OK** · روتر ۲۳ + برابری ۶ + اسکنر ۵ = **۳۴ OK** · نرمال‌سازی **۲۳ OK** · `sync_skill_library.py --check` ⇒ **0 differing files** · `scan_third_party_skills.py --check` ⇒ **current (3,011 files, 166 findings)** · `scan_secrets.py` ⇒ **0 finding(s)** (گزارشِ امنیتیِ تازه فقط الگو را **نقل** می‌کند و خودِ scan_secrets را قرمز نکرد) · `repo_health_check.sh` ⇒ **exit 0** · `mobile/build-index.py --check` ⇒ سالم (5748 routable) · `check_brand_assets.py --stickers` و `build_sticker_manifest.py --check` ⇒ سالم (۳۶۰ PNG، 30,603,539 بایت) · ساختِ claude.ai: lite **۳٬۲۳۳٬۴۲۳ بایت** (پیش از این دور ۳٬۲۳۱٬۲۳۱، چون `route.py` بزرگ‌تر شد) و **بایت‌بایت بازتولیدپذیر** (sha256 `5d04f3140a0847ee…` در دو ساخت) ⇒ ۶۱٫۷٪ سقفِ ۵MB · psk ⇒ **۵۷/۵۷**، golden **۱۰۸ کیس**، accuracy **۱۰۰٫۰٪**. هرمس در این دور دست نخورد و `node_modules` هم پس از re-clone نصب نشد ⇒ سوئیتِ هرمس **NOT RUN** (شمارهای canonicalِ ۲۶۳/۷۹/۱۰ با نگهبانِ ایستا سنجیده شدند).

### ۱۰٫۸) NOT RUN / بلاک
`docs/BACKLOG_TRIAGE.md` فهرستِ کامل را دارد. خلاصهٔ این دور: تسک‌های ۱–۳، ۸، ۹، ۱۳ (ایندکسِ تولیدی)، ۷ (دادهٔ واقعیِ مالک)، ۲۲/۲۴/۳۹/۴۹/۵۳/۷۱/۷۲/۷۶/۷۹/۸۰/۸۲/۸۹ (سرویس/مرورگر/دیتابیسِ زنده)، ۳۸ و ۴۰–۴۸ (قیدِ CHAM)، ۵۱ (دانلودِ بیرونِ allowlist)، ۵۷ (اسکرین‌شات + تأیید مالک)، ۱۰۰ (permission در CI) · حذفِ فایلِ یتیم و prune کردنِ `sync` (نیازمندِ مجوز) · اسکنِ کاملِ audit در CI (۳۱ ثانیه؛ فقط لوکال اجرا شد) · سوئیتِ هرمس و fjcod و lithos (وابستگی‌ها در این checkout نصب نیستند).

### ۱۰٫۹) مجوزها
انجام شد (با همان مجوزِ قبلی): commit و push روی شاخهٔ کاریِ همین PR (fast-forward، بدونِ force). انجام نشد: merge/close/ready-for-review هر PR، release/tag، deploy، force push، بازنویسیِ تاریخچه، **هر حذفی** (از جمله فایلِ یتیمِ ۱۰٫۵)، DDL/DML/migration/seed، تغییرِ secret/permission/webhook، سرویسِ پولی.

## ۱۱) لاگ جریان — ۲۰۲۶-۱۰-۲۲ (پنج تسکِ دیگر: ۹۰، ۹۱، ۹۲، ۹۴، ۱۸ + بازیابیِ درخت)

### ۱۱٫۱) بازیابی پیش از کار
این checkout بار سوم از نو clone شده بود: `HEAD` روی `79f22db5` (= `main`) افتاده بود و هر ۴ commitِ شاخه از تاریخِ محلی غایب بودند، در حالی که محتوایِ فایل‌ها در درختِ کاری مانده بود. پیش از هر ویرایشی سنجیده شد: `gh pr view 98` ⇒ head `fc45cc67` سالم، `git ls-remote` ⇒ همان SHA، و `git diff origin/…` ⇒ **صفر اختلافِ محتوایی** (تنها ۱۴ فایلِ untracked که در ایندکس نبودند). بازیابی با `git fetch` + `git reset --mixed` (بدونِ `--hard`) و اثباتِ بایتی: `git write-tree` == `HEAD^{tree}` == `522289b6…`، `porcelain` صفر. تاریخِ محلی همچنان **shallow با ۵ commit** است ⇒ برای پرسش‌های تاریخی فقط به اسنادِ داخلِ مخزن استناد شد، نه به `git log`.

### ۱۱٫۲) تسک ۹۰ (P1) — لینکِ محلیِ مرده در مهارت‌های وارداتی
`library/CLAUDE.md` یک snippetِ ad-hoc داشت با baselineِ ۲۰۲۶-۱۰-۱۸: **۱۱۴ مهارت با لینکِ مرده، ۶۷ بدونِ پرچم**. اول همان snippet **verbatim** اجرا و همان ۱۱۴/۶۷ بازتولید شد، بعد جای خودش را به `scripts/check_skill_links.py` داد.
قراردادِ داده از خودِ داده استخراج شد نه از حدس: از **۶۷۸** `missing_files` ثبت‌شده برای ۲۸۱ مهارتِ پرچم‌دار، **۶۷۷** مسیرِ داخلِ پوشهٔ مهارت و ۱ زیرمهارتِ تودرتو بود و **صفر** مسیرِ `../`، صفر placeholder، صفر پیوندِ پوشه ⇒ قاعده: «لینکِ نسبیِ داخلِ پوشه که فایلِ واقعی نام می‌برد = وعدهٔ فایلِ همراه؛ اگر نیست ⇒ `incomplete`».
تجزیهٔ ۶۷ مورد (هر کدام خوانده شد):
| دسته | تعداد | قاعده |
|---|---|---|
| پرچمِ واقعی گرفت | **۳ مهارت / ۴ فایل** | `git-guardrails-claude-code` («The bundled script is at: `scripts/block-dangerous-git.sh`» — پوشه فقط SKILL.md و SOURCE.md دارد)، `qdrant-search-quality` (`diagnosis/SKILL.md`, `search-strategies/SKILL.md`؛ مطابقِ سابقهٔ `templates/SKILL.md` در ۲۸۱ پرچمِ موجود)، `wizard` («The delightful UX is already solved by `template.sh`») |
| `code_sample` | ۳۶ لینک | داخلِ بلوکِ کدِ **بسته** ⇒ قالبِ خروجی است نه وعدهٔ فایل. نمونه‌ها: «### Generated SKILL.md» در `microsoft-skill-creator` (که بدونِ این قاعده اشتباهاً پرچم می‌گرفت)، فهرستِ `llms.txt` در `create-llms`/`update-llms`، و `registry["vit_h"](checkpoint="x.pth")` در `segment-anything-model` که رجکسِ لینک آن را می‌گرفت |
| `upstream` | ۱۹۰ لینک | `../../DESIGN.md`، `../../../c-level-advisor/…` ⇒ در چیدمانِ تختِ portable **نمی‌توانند** وجود داشته باشند (همان دلیلِ ۴۲ مهارتِ بی‌پرچمِ امروز) |
| `placeholder` | ۲۶ لینک | `{slug}`، `<type>`، `src`، `url`، `2` |
| `justified` (بررسیِ دستی، سنجاق‌شده به شمارهٔ خط) | ۲ لینک | `self-improving-agent:162` («sister plugin in this repo» — پیوندِ پوشه) و `security-pen-testing:305` (سطرِ جدولِ see-also به مهارتِ دیگرِ همان سوئیت) |

**بلوکِ کدِ fail-closed:** ۱۶ فایل fence فرد دارند، پس «داخلِ کد» فقط وقتی پذیرفته می‌شود که بلوک **بسته** شده باشد؛ اگر فایلی با fence باز تمام شود، لینک‌هایش پروزا حساب می‌شوند و در `unclosed_fence` گزارش می‌گیرند (امروز صفر).
اثر: **۲۸۱→۲۸۴ ناقص، ۵٬۷۴۸→۵٬۷۴۵ قابل‌مسیریابی**. فایل‌های همراه از مبدأ **آورده نشدند** — یکی‌شان اسکریپتِ shellِ شخصِ ثالث است و قاعدهٔ `library/CLAUDE.md` اجرای اسکریپتِ وارداتی را ممنوع کرده؛ آوردنش تصمیمِ مالک است و در `owner_actions` ثبت شد.
هم‌گامیِ شمارش‌ها (پذیرشِ صریحِ تسک): `INDEX.json` (۳ ورودی، diff دقیقاً ۱۶ سطر) + ۳ `SOURCE.md` (خطِ `INCOMPLETE:` با همان boilerplate یکتا، به‌عنوانِ سطرِ آخر) + `sync_skill_library.py` (۹ فایل: دو ایندکس، ۴ domain، ۳ کپیِ portable SOURCE.md) + `mobile/build-index.py` (ایندکس و `sw.js`: `mega-mobile-v1-db2702efc8f36526`، ۲٬۲۴۲٬۶۳۵B خام / ۴۰۹٬۶۱۷B gzip) + **۳۳ جایِ مستند/تست** در ۱۵ فایل: هر دو `SKILL.md` (خطوطِ ۳ و ۱۸)، `plugin.json`، `library/README.md` (انگلیسی و فارسی)، `library/github-skills/README.md`، README پلاگین، `CLAUDE.md` پلاگین (۲ جا)، `PROGRESS.md` پلاگین، دستورِ ۰۸ (۲ جا)، دستورِ ۱۱ (۳ جا)، `mobile/CLAUDE.md` (۲ جا)، `mobile/README.md`، `mobile/index.html`، `mobile/manifest.webmanifest`، `ROADMAP.md`، و سه تست (`test_project_documentation`، `test_mega_skills_router`، `test_skill_router_sync`). سطرهاى تاریخ‌دار (`PROGRESS.md:۵۷/۱۱۶/۱۵۹`، `docs/REPO_HARDENING.md`، `hermes/ROADMAP.md`، `mobile/PROGRESS.md`، `mobile/PROFESSIONAL_GUIDE.md`، `library/PROFESSIONAL_GUIDE.md`) عمداً **منجمد** ماندند.

### ۱۱٫۳) تسک ۹۴ (P1) — گاردِ DNS-rebinding
گارد در `orchestrator/supabase/functions/github-llm-verifier/index.ts` **از قبل** بود (`resolveHostPublic` پیش از هر `fetch`، با `redirect:"manual"` و اعتبارسنجیِ هر hop)، ولی قاعدهٔ تصمیمش inline و **بدونِ تست** بود. منتقل شد به `dnsAnswersArePublic()` در `net.mjs`: fail-closed روی مجموعهٔ خالی، ورودیِ junk، و **یک** آدرسِ خصوصی میانِ عمومی‌ها (همان ترفندِ rebinding؛ `some` به‌جای `every` خودِ حفره است). `net.test.mjs` از ۴ به **۷ تست** رسید + نگهبانِ ایستا روی `index.ts` (import از `net.mjs`، ترتیبِ resolve **پیش از** fetch، `redirect:"manual"`، سقفِ hop، و شمارِ محل‌های `fetch(` = ۲ تا محلِ سومِ بی‌بررسی اضافه نشود).
**یافتهٔ مهم:** این تست‌ها در **هیچ jobِ CI اجرا نمی‌شدند** (jobِ `orchestrator` فقط `github-admin-gateway/*.test.mjs` را می‌دوید) ⇒ گامِ «Free LLM mesh SSRF and DNS-rebinding regressions» اضافه شد. این mesh فقط GET می‌زند (`method:"POST"` در فایل نیست) و تست همین را قفل کرده تا POSTِ بعدی بدونِ گارد نیاید.

### ۱۱٫۴) تسک ۱۸ (P2) — نسخه و CHANGELOG پلاگین
`plugins/mega-skills-router/CHANGELOG.md` ساخته شد (Keep a Changelog + semver با تعریفِ MAJOR/MINOR/PATCH مخصوصِ همین پلاگین) و نسخه **۱٫۲٫۰ → ۱٫۳٫۰** (MINOR: فلگ‌های تازه و fallback هم‌معنا بدونِ شکستِ قرارداد) هم‌زمان در `plugin.json`، `marketplace.json` ریشه و تازه‌ترین مدخلِ CHANGELOG. `tests/test_plugin_versioning.py` (۷ تست) این سه‌جا، یکتایی/نزولیِ بودن/تاریخِ مدخل‌ها، پُربودنِ بخش‌ها، و **انطباقِ مدخلِ جاری با `counts` واقعیِ ایندکس** را قفل می‌کند ⇒ تغییرِ شمار بدونِ bump و مدخلِ تازه ممکن نیست. تاریخِ نسخه‌های پیش از ۱٫۲٫۰ **بازسازی نشد**: tag وجود ندارد و این clone تاریخِ `plugin.json` را پیش از `79f22db5` نشان نمی‌دهد؛ مدخلِ ۱٫۲٫۰ به `plugins/mega-skills-router/PROGRESS.md` استناد می‌کند و همان‌جا نوشته شده که tag برای تأییدش نیست.

### ۱۱٫۵) تسک ۹۱ و ۹۲ (P2) — نام‌گذاری و مجوزها
**۹۱:** هر ۱۰ مهارتِ `mp-*` از `mattpocock/skills` هستند و frontmatterشان نامِ بدونِ پیشوند دارد؛ اندازه‌گیری نشان داد **هر ۱۰ پیشوند ضروری است** چون همان نام از مخزنِ دیگری (`sickn33/agentic-awesome-skills`, `alirezarezvani/claude-skills`, `phuryn/pm-skills`) در ایندکس هست. سیاست در `library/github-skills/README.md` مستند شد (نامِ پوشه canonical، frontmatter دست‌نخورده، قاعدهٔ importِ آینده) با جدولی که تست آن را **سطر‌به‌سطر با `INDEX.json`** مقایسه می‌کند — نخستین نسخهٔ آن جدول را اشتباه نوشتم و همین تست ۴ سطرِ غلط را لو داد.
**۹۲:** `_licenses/` **توجیه** شد نه پاک (حذف = مجوزِ مالک): ۴۶ فایل، هر ۲۹ مخزن پوشش داده شده، ۵ مخزن چند LICENSE مسیرمحور دارند (۱۱/۴/۳/۲/۲ + ۲۴ مخزن یکی)، ۴۵ تایِ ۴۶ توسط `SOURCE.md` ارجاع شده‌اند، و تنها فایلِ بی‌ارجاع (`sickn33__agentic-awesome-skills__skills_remote-gpu-trainer_LICENSE`) با دلیلِ ماندنش در README نام برده شده. تست مجموعهٔ بی‌ارجاع را به **دقیقاً همین یک فایل** قفل می‌کند ⇒ noticeِ سرگردانِ دوم قرمز می‌شود. (کپیِ یتیمِ `_licenses` در درختِ پلاگین — یافتهٔ §۱۰٫۵ — همچنان منتظرِ تصمیمِ مالک است و با `KNOWN_ORPHAN_DIRECTORIES` نگهبانی می‌شود.)

### ۱۱٫۶) جهش‌ها و گیت‌ها
**۱۳ جهش، همه قرمز:** ۵ روی ممیزیِ لینک (بی‌پرچم‌کردنِ `wizard`، کوتاه‌کردنِ `missing_files`، حذفِ خطِ `INCOMPLETE:`، جابه‌جاییِ سنجاقِ توجیه از ۱۶۲ به ۱۶۳، بازگرداندنِ `wizard/template.sh`) · ۴ روی نام‌گذاری/مجوز (مخزنِ اشتباه در جدولِ README، شمارِ اشتباهِ مجوز، حذفِ نامِ noticeِ بی‌ارجاع، ارجاعِ SOURCE.md به noticeِ ناموجود) · ۴ روی نسخه (اختلافِ marketplace، تاریخِ آینده، ترتیبِ معکوسِ مدخل‌ها، حذفِ ادعای `--explain`) · و ۴ روی گاردِ DNS (`every`→`some`، حذفِ `resolveHostPublic` از `safeGetJson`، `redirect:"follow"`، inline کردنِ قاعده به‌جای helper). بازگردانیِ همه با `cp -p` و **تأییدِ SHA-256**؛ فایلِ موقتیِ `wizard/template.sh` هم ساخته و پاک شد (untracked، بدونِ حذفِ tracked).
**گیت‌ها:** `discover` ⇒ **Ran 152 tests — OK** (پیش از این دور ۱۲۲) · ممیزیِ لینک ⇒ `unflagged: [] · findings: 0` · `sync --check` ⇒ **0 differing files** · `scan_third_party_skills.py --check` ⇒ current (۳٬۰۱۱ فایل، ۱۶۶ یافته) · `mobile/build-index.py --check` ⇒ سالم با fingerprint تازه · `node --test …/net.test.mjs` ⇒ **۷/۷** · `scan_secrets.py` و `repo_health_check.sh` در پاسِ نهایی.

### ۱۱٫۷) NOT RUN / بلاک
· آوردنِ فایلِ همراه از مبدأ (`raw.githubusercontent.com` در allowlist این محیط نیست؛ تصمیمش هم با مالک) · حذفِ noticeِ بی‌ارجاع و کپیِ یتیمِ `_licenses` (نیازمندِ مجوز) · **تسک ۹۳** (گزارشِ کیفیتِ مهارت‌ها) و ۱۲/۱۵ (حجمِ نصب و ایندکسِ پیش‌توکن‌شده) به دورِ بعد ماندند تا همین پنج تسک کامل و سبز land شوند · سوئیتِ هرمس/fjcod/lithos (دست‌نخورده؛ وابستگی‌ها نصب نیستند) · Deno check واقعی روی `github-llm-verifier/index.ts` در این محیط (Deno نصب نیست؛ CI انجامش می‌دهد).

### ۱۱٫۸) مجوزها
انجام شد (با همان مجوزِ قبلی): commit و push روی شاخهٔ کاریِ همین PR (fast-forward). انجام نشد: merge/close/ready-for-review، release/tag، deploy، force push، بازنویسیِ تاریخچه، **هر حذفی** (فایلِ همراه، noticeِ بی‌ارجاع، کپیِ یتیم)، DDL/DML/migration/seed، تغییرِ secret/permission/webhook، سرویسِ پولی.

## ۱۲) لاگ جریان — ۲۰۲۶-۱۰-۲۲ (دورِ دوم: تسک ۹۳ + باگِ قاعدهٔ fence)

شاخهٔ تازه از `c6a07ca9` (همان mergeِ PR #98) شروع شد. تنها تسکِ این دور **۹۳** بود و یک باگِ واقعی که حینِ ساختنش پیدا شد.

**تسک ۹۳ (P2) — گزارش کیفیت:** `scripts/report_skill_quality.py` هر ۳٬۰۲۹ `library/**/SKILL.md` را با شش سیگنالِ قابلِ بازبینی امتیاز می‌دهد (طولِ prose از `\w+` تا markdown شمرده نشود، workflow با سه سطح ۲۵/۱۵/۶، خروجیِ تعریف‌شده ۲۰/۱۲، چک‌لیست ۱۵/۱۰، ساختارِ سرفصل ۱۰/۵، نمونهٔ کد ۵، و ۱۰− امتیاز برای پرچمِ `incomplete`) و `library/QUALITY_REPORT.md` را **قطعی و بدون timestamp** بازتولید می‌کند تا `--check` بایت‌به‌بایت مقایسه کند. سنجه‌ها: میانهٔ امتیاز ۷۲، میانگین ۷۰٫۸، باندها `strong 759 / usable 1755 / thin 468 / weak 41 / stub 6`، و ۵۰ ضعیف‌ترین با `missing` هر ردیف. میانگینِ ۱۸ مهارتِ curated (۸۹٫۷) از ۳٬۰۱۱ وارداتی (۷۰٫۹) بالاتر است. گزارش صریحاً می‌گوید که **ساختار** را می‌سنجد نه درستیِ توصیه را، و هیچ فایلی را تغییر نداده است.

**باگِ قاعدهٔ fence (پیدا شد چون تابع را مشترک کردم):** برای اینکه دو ابزار یک تعریف از بلوکِ کد داشته باشند، `code_regions` را از `check_skill_links.py` import کردم و سنجهٔ خودم با آن اختلاف پیدا کرد. ریشه‌اش دو شرطِ جاماندهٔ CommonMark بود: fence بسته‌کننده باید **حداقل به همان تعداد** marker داشته باشد (نه فقط همان کاراکتر) و تورفتگیِ fence **۰–۳ فاصله** است. اثرِ اندازه‌گیری‌شده روی ۳٬۰۱۱ مهارت: ۳۷ فایل بد جفت می‌شدند (۱٬۴۳۵ سطر در سمتِ اشتباه) و ۲۶ فایل «باز» به‌جای ۱۶ فایلِ واقعاً باز. سطل‌های ممیزیِ لینک **بی‌تغییر** ماندند (ممیزی پیش از قاعدهٔ fence وجودِ هدف را چک می‌کند) ولی هر سنجه‌ای که prose را می‌شمارد روی ۳۷ فایل متنِ اشتباهی را اندازه می‌گرفت. دو تستِ تازه در `tests/test_skill_link_audit.py` همان دو شرط را با شکلِ واقعیِ `aws-cost-optimize` و `markdown-to-html` سنجاق کردند.

**دو تلهٔ سنجه که پیش از انتشار گرفته شدند:** (۱) سه مهارتِ `mcp-*` کلِ بدنه را داخل یک fence از نوع `prompt` دارند (آرتیفکتِ مبدلِ upstream) و بدونِ پوست‌کندن، `mcp-create-adaptive-cards` با ۱٬۲۳۷ کلمه prose امتیازِ ۵ می‌گرفت و رأسِ «ضعیف‌ترین‌ها» می‌شد — یعنی آرتیفکتِ سنجه به‌جای مهارتِ ضعیف؛ پوست‌کندن فقط وقتی رخ می‌دهد که همهٔ سطرهای غیرخالیِ بدنه داخلِ همان یک fence باشند. (۲) دو عددِ داخلِ جمله‌های گزارش (`۶٬۰۲۹` و `۱٬۲۳۷`) hardcode بودند؛ اکنون از سنجه مشتق می‌شوند و تست باز-مشتق‌شان می‌کند، به‌علاوه تستی هر مسیری را که گزارش نام می‌برد با درخت چک می‌کند.

**گیت‌ها:** `discover` ⇒ **Ran 177 tests — OK** (پیش از این دور ۱۵۲) · `report_skill_quality.py --check` ⇒ current · `check_skill_links.py --check` ⇒ `unflagged: [] · findings: 0` · `tests.test_skill_quality_report` ۲۳/۲۳ · `tests.test_skill_link_audit` ۱۵/۱۵ · گامِ تازهٔ CI: `Skill quality report is current` در jobِ `router`.

**NOT RUN:** جهش‌های این دور (فقط ۲ مورد دستی: آستانهٔ ۴۰۰→۳۰۰ و حذفِ پوست‌کندن، هر دو قرمز دیده شدند) به‌صورتِ کاملِ systematic اجرا نشد · امتیازدهیِ محتوایی · نیمهٔ `psk/` · اصلاحِ markdownِ آن ۱۶ فایل و پوست‌کندنِ دائمیِ ۳ مهارت (دست‌کاریِ محتوای وارداتی = تصمیمِ مالک) · تسک‌های ۱۲/۱۵/۹۵/۹۶ شروع نشدند.

## ۱۳) لاگ جریان — ۲۰۲۶-۱۰-۲۳ (بازیابیِ ۲۸۴ مهارتِ ناقص + ۲۵ مهارتِ موشن)

- **مگا اسکیل (پلاگین 1.3.0 → 1.4.0):** از ۲۸۴ مهارتِ ناقص **۲۱۹ کامل شد**. قابل‌مسیریابی‌ها از **۵٬۷۴۵ به ۵٬۹۶۴** رسید و ناقص‌ها از **۲۸۴ به ۶۵**. منبعِ فایل‌ها: نسخهٔ تازهٔ بالادستی، پوشه‌های مشترک همان مخزن و مخزنِ اصلیِ هر مهارت (۲۶ مجوزِ تازه؛ `_licenses/` از ۴۶ به ۷۲). جزئیات و گیت‌ها در `library/PROFESSIONAL_GUIDE.md` (۲۰۲۶-۱۰-۲۳) آمده است.
- **سه مهارتی که تصمیمشان با مالک بود** (`git-guardrails-claude-code`، `qdrant-search-quality`، `wizard`): مالک گفت «همه نصب شوند»، پس فایل‌هایشان آورده شد.
- **نگه‌داشته‌شده:** `polis-protocol/scripts/demo.sh` یک نصب‌کنندهٔ `curl | bash` از مالکِ دیگری را تبلیغ می‌کند.
- **۲۵ مهارتِ موشن در `.claude/skills/`** (همه MIT، پیش از نصب برای الگوهای مخرب اسکن شدند):
  - iart-ai: ۱۷ مهارت از چهار پک tiktok، ad، motion-design و kinetic-typography
  - anymotion: ۶ مهارت
  - `pixel2motion`
  - `after-effects-mcp`

**گیت‌ها:** `discover` ⇒ **۱۷۸ تست** · `sync --check` ⇒ ۰ · `check_skill_links --check` ⇒ `unflagged: []` · `report_skill_quality` و `scan_third_party_skills --check` ⇒ current · `mobile/build-index.py --check` ⇒ ۵٬۹۶۴.

**NOT RUN:** هیچ اسکریپتِ شخص ثالثی اجرا نشد. کیفیتِ مسیریابیِ ۲۱۹ مهارتِ تازه‌فعال با مجموعهٔ طلایی سنجیده نشده است.

## ۱۴) لاگ جریان — ۲۰۲۶-۱۰-۲۳ (حذفِ ۶۵ مهارتِ ناقص + مسیریابِ کم‌مصرف، پلاگین 1.4.0 → 1.5.0)

- **حذف:** ۶۵ مهارتِ ناقص به فایل‌هایی ارجاع می‌دادند که هیچ‌جا منتشر نشده‌اند، پس از همه‌جا حذف شدند: `INDEX.json`، `triggers.json`، پوشهٔ canonical و کپیِ پلاگین. حالا **۵٬۹۶۴ مهارت** داریم که همه قابل‌مسیریابی‌اند، با **۰ ناقص** و **۲۹٬۸۷۸ trigger**. سهمِ GitHub **۲٬۹۴۶ مهارت از ۲۸ مخزن** است. دو مجوزی که مخزنشان از ایندکس رفت هم حذف شدند (`_licenses/` حالا ۷۰ فایل دارد). سیاستِ تازه: مهارتِ ناقص یا تعمیر می‌شود یا حذف، و هرگز پنهان نمی‌ماند.
- **کپیِ یتیمِ `_licenses`** (یافتهٔ §۱۰٫۵) حذف شد. `sync_skill_library.py` حالا پوشهٔ مهارتی را که از ایندکس بیرون رفته و noticeها و دامنه‌هایی را که دیگر نمی‌نویسد prune می‌کند؛ `--check` آن‌ها را drift گزارش می‌کند. فایلِ اضافه داخلِ پوشهٔ مهارتِ زنده دست نمی‌خورد.
- **مسیریابِ کم‌مصرف:** `SKILL.md` هر دو نسخه و قالبِ claude.ai بازنویسی شد:
  - درخواستِ ساده مسیریابی نمی‌شود.
  - ۲ تا ۶ واژهٔ نیت با `--limit 5 --json-lines --fields name,domain,score,path` فرستاده می‌شود.
  - فقط نتیجهٔ اول خوانده می‌شود، و حداکثر دو نتیجهٔ دیگر که امتیازشان دست‌کم ۰٫۸ نتیجهٔ اول باشد.
  - فایلِ بزرگ اول با سرفصل‌ها خوانده می‌شود.
- **باگِ مسیریاب (رفع شد):** نامِ برندی که هیچ مهارتی ندارد بیشترین وزنِ IDF را می‌گرفت و همهٔ نتیجه‌ها را زیرِ آستانه می‌برد. برای همین «تور آفرود وایکینگ» هیچ نتیجه‌ای نمی‌داد. stemmer هم «viking» را «vik» می‌کرد. حالا `BRAND_TOKENS` (viking، hermes، cham، offroad) وقتی در ایندکس نیستند وزنِ صفر می‌گیرند. واژه‌های ناشناختهٔ دیگر وزنشان را نگه می‌دارند، چون معمولاً خودِ نیت‌اند («قبض برق»). نسخهٔ عمومیِ این اصلاح امتحان شد و ۱۷ تستِ رتبه‌بندی را قرمز کرد، پس کنار گذاشته شد.
- **فاز:** ۱۷ ورودیِ مرزی شامل خالی، ۲۰ هزار کاراکتر، ایموجی، `\x00`، `../../etc/passwd`، HTML و SQL، روی هر دو نسخه ⇒ همه با کدِ خروجِ ۰. zipِ کاملِ claude.ai هر **۵٬۹۶۴** مسیر را دارد.

**گیت‌ها:** `discover` ⇒ **۱۸۰ تست** (تنها خطای محلی `test_commit_identity` است، تا وقتی HEAD هنوز commitِ squashِ GitHub باشد) · `sync --check` ⇒ ۰ · `check_skill_links` ⇒ `unflagged: []` با ۰ لینکِ مرده · `scan_third_party_skills --check` ⇒ ۲٬۹۴۹ فایل، ۱۶۷ یافته · `mobile/build-index.py --check` ⇒ ۵٬۹۶۴.

**NOT RUN:** مجموعهٔ طلایی برای ۲۱۹ مهارتِ تازه‌فعال · zipِ claude.ai فقط `SKILL.md`ها را دارد، پس اسکریپت‌ها و مراجعِ همراه در claude.ai در دسترس نیستند.

## ۱۵) لاگ جریان — ۲۰۲۶-۱۰-۲۹ (بازبینیِ عمیقِ مخزن + رفعِ driftِ شمارنده‌های هرمس)

**گزارشِ کامل:** [`docs/REPO_REVIEW_2026-10-29.md`](docs/REPO_REVIEW_2026-10-29.md) — همهٔ عددها در همین checkout اندازه‌گیری شده‌اند.

- **رفعِ drift (کارِ همین دور):** `docs/PORTFOLIO.md`، `docs/directives/02-hermes.md`، `hermes/PROGRESS.md` (بخشِ دستورهای امروز)، `hermes/README.md` و برچسبِ گامِ `tests` در `scripts/doctor.mjs` عددهای کهنهٔ **۲۶۳ تست واحد / ۷۹ worker / ۹ integration / ۱۵ ماژول** را داشتند. مقدارِ اندازه‌گیری‌شده: **۲۶۹ واحد / ۸۲ worker / ۱۰ integration / ۳۸ ماژول**. نگهبانِ `tests/test_status_counters.py` (تسک ۳۶ و ۹۷) همین را قرمز کرده بود: **۴ خطا → ۱۸۰/۱۸۰ OK** و `node scripts/doctor.mjs` از `failures: 2` → **۰**. بخش‌های تاریخ‌دار (snapshot) دست‌نخورده ماندند.
- **چرا کسی ندید:** `CI` روی `main` از **۲۰۲۶-۱۰-۲۲** سبز نشده است. سه pushِ آخرِ `main` با پیامِ بودجهٔ Actions («recent account payments have failed or your spending limit needs to be increased») در ۲ ثانیه و **پیش از شروعِ هیچ جابی** شکست خورده‌اند و دو pushِ پیش‌تر با `commit-identity`، `router` و `repo-health` قرمز بوده‌اند. PR #128 در ۲۴ اکتبر با **۱۴ چکِ قرمز** مرج شده است.
- **گیتِ `commit-identity` روی `main` ساختاری قرمز است:** commitهای مرج‌شده تریلرِ `Co-authored-by: Claude` دارند (`8bd5ae3b`، `d5aa4e15`، `67cbb1e1`، `527dbc59`) و اسکریپت روی push به `main` همین را می‌گیرد.
- **اثرِ آبشاری بر Dependabot:** هر ۷ PRِ باز دقیقاً در `repo-health` و `router` (همان drift) قرمزند، نه به‌خاطر تغییرِ خودشان؛ ۴ تای آن‌ها major (`vite 8`, `typescript 7`) و بی‌گروهِ عدمِ‌پذیرش‌اند.
- **یافته‌های P1 که هنوز بازند:** `lithos/api/buffer-sync.js` بخشِ «بازسازی‌شده» با کوئریِ تأییدنشدهٔ Buffer و URL/کلیدِ hard-code؛ هشِ رمزِ اعضای تیم و هشِ شمارهٔ تلفنِ مالک در Git؛ `fjcod` بدونِ Auth سروری؛ دوگانگیِ ۳۳۸ مگابایتیِ `library/`↔`plugins/`؛ نبودِ تولیدکنندهٔ `triggers.json` (منشأ ۶ تسکِ `BLOCKED/INDEX`).
- **گیت‌های این دور:** `discover` ⇒ **۱۸۰ تست OK** · `sync --check` ⇒ ۰ · `scan_third_party_skills --check` ⇒ current (۲٬۹۴۹ فایل، ۱۶۷ یافته) · `check_skill_links` ⇒ `unflagged: []` · `report_skill_quality --check` ⇒ current · `scan_secrets.py` ⇒ ۰ یافته · `repo_health_check.sh` ⇒ exit 0 · `doctor.mjs --json` ⇒ **۰ خطا** (دو skipِ محیطی: Deno و Chromium).
- **NOT RUN:** Deno، Chromium/Playwright (پس `fjcod e2e` صرفاً skip)، هیچ تماسِ زنده با Cloudflare/Supabase/Vercel/Gemini، و هیچ انتشار یا migration. `orchestrator` با pytest در venv موقت: ۲۱ pass + ۳ skipِ مستند.

## ۱۶) لاگ جریان — ۲۰۲۶-۱۰-۲۹ (دورِ دوم: راهنمای سه‌پروژه‌ای + گیتِ آن + بک‌لاگِ سخت‌سازی)

- **راهنمای بازبینی‌شدهٔ `docs/guides/ai-projects-3/`** ساخته و اجرا شد: نسخهٔ کدِ هر سه پروژه،
  `README.md` فارسی، و `index.html` خودبسنده/RTL. جمعِ تست‌ها **۴۷** (۱۱ + ۱۵ + ۲۱)، همه آفلاین.
- **دروازهٔ `scripts/verify_ai_projects.py`** (۱۲ بررسی: سینتکس نود، تست‌های نود، `py_compile`،
  importِ تنبل، تست‌های پایتون، سطحِ import، JSONِ n8n، هم‌خوانیِ متن با کد، مجوزِ n8n، APIهای
  حذف‌شده) در سه جا سیم‌کشی شد: `repo_health_check.sh`، گامِ تازهٔ `ai-guides` در `doctor`، و
  jobِ `repo-health` در CI. `tests/test_ai_projects.py` خودِ این سیم‌کشی را قفل می‌کند.
- **شمارنده‌ها به‌روز شد:** `doctor` ۴۲ → **۴۳ گام** (۱۳ دامنه)، تست‌های ریشه ۱۸۰ → **۱۹۳** → **۲۰۰**.
  نگهبانِ `tests/test_status_counters.py` خودش اختلاف را گرفت و همین دلیلِ به‌روزرسانی بود.
- **دو سندِ تازه:** `docs/REVIEW_3_PROJECTS_AI_GUIDE_2026-10-29.md` (۱۹ ادعا، ۱۲ کهنه/نادرست،
  ۳ کدِ خراب، ۴ APIِ حذف‌شده، و بخشِ «اصلاحِ خود») و `docs/HARDENING_BACKLOG_2026-10-29.md`
  (۹ یافتهٔ هرمس/fjcod با شاهدِ `فایل:خط`).
- **قفلِ ضدِ rot:** `tests/test_review_documents.py` هر شاهدِ `فایل:خط` + قطعهٔ کد را دوباره
  می‌خواند؛ اگر کد جابه‌جا شود یا تست‌ها کم/زیاد شوند، سند نمی‌تواند بی‌صدا کهنه بماند.
- **اصلاحِ خود در همین دور:** ادعای «`OllamaEmbeddings` حذف شده» غلط بود (import می‌شود، منسوخ
  است) → به فهرستِ `DEPRECATED` رفت؛ و ادعای «±۱ تومان اختلافِ مرجوعی» به کرانِ درستِ
  «۰٫۵×تعداد در هر قلم + سقفِ بی‌صدای باقی‌مانده» اصلاح شد.
- **گیت‌ها:** `python3 -m unittest discover -s tests` ⇒ **۲۰۰ تست OK** · `repo_health_check.sh` ⇒
  exit 0 · `node scripts/doctor.mjs repo` ⇒ همه سبز (شاملِ `ai-guides`).
