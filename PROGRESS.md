# MegaSkillClaude Monorepo — دفتر جریان مشترک

> این دفتر فقط تغییرات cross-project (CI، doctor، نقشهٔ پروژه‌ها و قراردادهای مشترک) را نگه می‌دارد. هر محصول دفتر جداگانهٔ خودش را دارد. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۲۰**.

## ۱) وضعیت مشترک
- ۱۲ پروژه/زیرپروژهٔ مدیریت‌شده (به‌علاوهٔ خود مخزن)؛ دفتر هرکدام در جدول `README.md` و دستور توسعهٔ هرکدام در [`docs/directives/`](docs/directives/README.md) است.
- `node scripts/doctor.mjs <id>` مرجع فرمان‌های دقیق هر پروژه است؛ `--list` فهرست کامل را نشان می‌دهد. اکنون **۴۲ گام در ۱۳ دامنه** (۳۸ تا پیش از ۲۰۲۶-۱۰-۱۴).
- Router canonical: **۶٬۰۲۹** مهارت = ۳٬۰۰۰ core + ۱۸ پروژه + ۳٬۰۱۱ GitHub؛ **۵٬۷۴۸ routable**، **۲۸۱ incomplete** و **۳۰٬۲۰۳ trigger**.
- تست‌های ریشه: **۸۳ تست ریشه** (پایتون) با `python3 -m unittest discover -s tests -p "test_*.py"`. نگهبانِ همین اعداد `tests/test_status_counters.py` است: شمارنده‌های بخش «وضعیت مشترک» را به `triggers.json`، `library/github-skills/INDEX.json`، `scripts/doctor.mjs` و `mobile/skills-index.json` قفل می‌کند، ارجاع‌های `doctor.mjs <id>` و لینک/پوشه‌های `docs/directives/README.md` را resolve می‌کند، و اعداد داخل بخش‌های تاریخ‌دار را به‌عنوان snapshot دست نمی‌زند. قاعدهٔ انسانی‌اش بند ۷ «قواعد مشترک» در [`docs/directives/README.md`](docs/directives/README.md) است.
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
