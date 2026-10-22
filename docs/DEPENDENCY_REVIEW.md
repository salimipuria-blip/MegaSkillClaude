# بازبینیِ وابستگی‌ها — تریاژِ PRهای Dependabot

> تاریخِ اندازه‌گیری: ۲۰۲۶-۱۰-۲۰ · پایه: `main` در `1dbceebb` (پیش از merge شدنِ PR #96)
> منبعِ حقیقت: `.github/dependabot.yml` (۸ هدفِ هفتگی — از دورِ تسکِ ۵۹، `/brands/viking-offroad/stickers/src` هم به پوشش اضافه شد چون lockfile گرفت) + `gh pr list --state open` + نتیجهٔ واقعیِ check-runها + بازتولیدِ محلی.
> **merge فقط با مالک.** هیچ PR ای در این دور merge، rebase یا close نشد و هیچ دستورِ `@dependabot` ای داده نشد.
> نگهبانِ همین سند: `tests/test_repo_normalization.py::test_dependency_review_verdicts_every_dependabot_target`.

## ۱) خلاصهٔ وضعیت

در لحظهٔ اندازه‌گیری **۱۸ PR باز** وجود داشت: ۱۶ PR از Dependabot، به‌علاوهٔ دو PR انسانی (`#12` و `#95`) که موضوعِ وابستگی نیستند ولی در جدولِ بخش ۵ آمده‌اند تا هیچ PR بازی بی‌تکلیف نماند.

| گروه | PRها | CI | جمع‌بندی |
|---|---|---|---|
| `github-actions` (`/`) | `#53`, `#54`, `#55`, `#71` | هر چهار سبز | **امن** — فقط بامپِ `uses:` |
| `/fjcod` | `#56`, `#59`, `#60`, `#61`, `#62` | چهار سبز، `#60` شکست | چهارتا **امن**؛ `#60` **بلاک**ِ peer |
| `/bison-brand-book` | `#57` | سبز | **امن** با دو ماژورِ پشتِ سر |
| `/lithos` | `#58` | سبز | **امن** به‌شرطِ commit شدنِ lockfile بازتولیدشده |
| `/viking-team/motion` | `#72`, `#73`, `#74`, `#75`, `#76` | `#74` سبز، چهارتا شکست | `#74` **امن**؛ چهارتا **بلاک** در دو جفتِ اتمیک |
| `/hermes` | — | — | **امن** — هیچ PR بازی ندارد؛ دو pinِ دقیق (`wrangler`, `miniflare` alpha) و یک نکتهٔ دانگریدِ `latest` |
| `/psk` | — | — | **امن** — هیچ PR بازی ندارد (هیچ وابستگی اعلام نکرده) |
| `/brands/viking-offroad/stickers/src` | — | — | **امن** — هیچ PR بازی ندارد؛ lockfile در همین دور ساخته و با `npm ci` واقعی آزموده شد (`playwright-core@1.56.0`) |
| انسانی | `#12`, `#95` | `#12` بدون check | بیرونِ حوزهٔ Dependabot (سطرشان در بخش ۵) |

واژهٔ «وضعیت» در جدول‌ها دقیقاً سه مقدار دارد: **امن** (اجرا و راستی‌آزمایی شد)، **شکست** (علتِ واقعی بازتولید شد) و **بلاک** (مانعِ بیرونی دارد و به‌تنهایی جلو نمی‌رود).

چرا علتِ شکست‌ها بازتولیدِ محلی شد و نه خواندنِ لاگِ CI: لاگِ jobها در این محیط خوانده نمی‌شود — `gh api repos/<repo>/actions/jobs/<id>/logs` فایلِ **۰ بایتی** می‌دهد و `gh run view --log-failed` با `EOF` از `results-receiver.actions.githubusercontent.com` شکست می‌خورد (بیرونِ allowlist). پس هر PR قرمز در یک worktree موقت (`git worktree add --detach /tmp/wt HEAD`) دقیقاً با همان گام‌های CI اجرا شد و درختِ کاریِ اصلی دست‌نخورده ماند (`git worktree remove --force` + `git status` تمیز).

## ۲) اکشن‌ها — هدفِ `/` (`github-actions`)

| PR | تغییر | تعدادِ `uses:` | CI | وضعیت | ریسک |
|---|---|---|---|---|---|
| `#53` | `actions/setup-python` 5 → 7 | ۴ (در `ci.yml` و `hermes-automation.yml`) | ۱۱ check سبز | **امن** | کم |
| `#54` | `actions/checkout` 4 → 7 | ۱۶ (در `ci.yml`, `ci-hermes.yml`, `hermes-automation.yml`) | ۱۵ check سبز | **امن** | کم |
| `#55` | `actions/setup-node` 4 → 7 | ۱۲ (در `ci.yml`, `ci-hermes.yml`) | ۱۵ check سبز | **امن** | کم |
| `#71` | `actions/upload-artifact` 4 → 7 | ۱ (در `ci-hermes.yml`) | ۱۳ check سبز | **امن** | کم |

شاهد: نسخهٔ فعلیِ pin‌شده در `.github/workflows` با `grep -rhoE "uses: (actions/[a-z-]+)@v[0-9.]+"` شمارش شد ⇒ `checkout@v4` ×۱۶، `setup-node@v4` ×۱۲، `setup-python@v5` ×۶، `upload-artifact@v4` ×۱. آخرین releaseهای پایدار هم دقیقاً همان ماژورِ هدف‌اند: `actions/checkout v7.0.1`، `actions/setup-node v7.1.0`، `actions/setup-python v7.0.0`، `actions/upload-artifact v7.0.2` (از `gh api repos/<action>/releases/latest`).

نکتهٔ نگهبانی: هیچ تستی در ریپو نسخهٔ اکشن‌ها را pin نکرده (`grep` برای `checkout|setup-node|setup-python|upload-artifact` روی `tests/*.py` ⇒ خالی) و `.github/dependabot.yml` همان ۷ ورودیِ موردِ انتظارِ `test_dependabot_targets_real_manifests_and_actions` را دارد ⇒ این چهار PR هیچ نگهبانی را نمی‌شکنند. تنها حساسیتِ واقعی: `test_token_guard_is_main_push_only_and_step_scoped` و `test_health_job_and_existing_project_jobs_remain` فایلِ `ci.yml` را با **نامِ jobها** می‌شکافند، پس اگر روزی ساختارِ jobها عوض شود این تست‌ها باید با آن به‌روز شوند (بامپِ `uses:` ساختار را عوض نمی‌کند).

## ۳) جدولِ بسته‌های npm

### `/fjcod`

| PR | تغییر | CI | راستی‌آزماییِ محلی (همان گام‌های CI: `npm ci` + `npm run check`) | وضعیت |
|---|---|---|---|---|
| `#56` | `playwright-core` 1.63.0 → 1.64.0 | سبز (۱۰) | `npm ci` exit 0؛ ۴۵/۴۵ vitest؛ `vite build` exit 0 | **امن** |
| `#59` | `typescript` 5.9.3 → 7.0.2 | سبز (۱۰) | `tsc --version` ⇒ ۷٫۰٫۲؛ ۴۵/۴۵؛ build exit 0 | **امن** (دو ماژور؛ تست‌ها سبز) |
| `#61` | `vite` 7.3.6 → 8.3.4 | سبز (۱۰) | به‌تنهایی merge شدنی است، اما `#60` را بلاک کرده | **امن** |
| `#62` | `lucide-react` 0.540.0 → 1.55.0 | سبز (۱۰) | `npm ci` exit 0؛ ۴۵/۴۵؛ build exit 0 (بدون خطای export) | **امن** |
| `#60` | `@vitejs/plugin-react` 5.2.0 → 6.1.2 | **شکست** در `npm ci` | علت: peer اجباری `vite: "^8.0.0"` در برابرِ vite قفل‌شدهٔ `7.3.6` | **بلاک** روی `#61` |

شاهدِ `#60` از registry (نه از حدس): `npm view @vitejs/plugin-react@6.1.2 peerDependencies` ⇒ `{ vite: "^8.0.0", oxc-transform-react, @rolldown/plugin-babel, babel-plugin-react-compiler }` و `npm view @vitejs/plugin-react@6.1.2 peerDependenciesMeta` ⇒ هر سه peerِ دوم تا چهارم `{ optional: true }` ⇒ **تنها** مانعِ واقعی همان vite است. نسخهٔ فعلیِ قفل‌شده در `fjcod/package-lock.json`: `@vitejs/plugin-react 5.2.0` (که peerش `^4.2.0||^5||^6||^7||^8` است) و `vite 7.3.6`، `lockfileVersion 3`.

ترکیبِ راستی‌آزمایی‌شدهٔ `#61` + `#60` (با lockfile بازتولیدشده): `npm ci` exit 0 و `npm run check` exit 0 شاملِ `tsc -b`، **۴۵/۴۵** تست و `vite build` (خروجیِ `dist/assets/index-*.js` ≈ ۳۷۶٫۶۴ kB / gzip ۱۱۲٫۸۳ kB).

**ترکیبِ کلِ خوشهٔ fjcod** هم محک خورد — `vite 8.3.4` + `@vitejs/plugin-react 6.1.2` + `typescript 7.0.2` + `playwright-core 1.64.0` + `lucide-react 1.55.0` با lock بازتولیدشده ⇒ `npm ci` exit 0، ۴۵/۴۵ تست، build exit 0.

### `/bison-brand-book`

| PR | تغییر | CI | راستی‌آزماییِ محلی | وضعیت |
|---|---|---|---|---|
| `#57` | `vite` 6.4.3 → 8.3.4 | سبز (۱۳ + ۱ skipped) | `npm ci` exit 0 (۱۹ بسته)؛ `npm test` ⇒ **۲۴/۲۴**؛ `npm run build` exit 0 (`dist/assets/index-*.js` ۱۳۶٫۴۴ kB) | **امن** |

### `/lithos`

| PR | تغییر | CI | راستی‌آزماییِ محلی | وضعیت |
|---|---|---|---|---|
| `#58` | `vite` 6.4.4 → 8.3.4 | سبز (۱۰) | `npm install` exit 0 ⇒ vite نصب‌شده ۸٫۳٫۴؛ `node --check api/buffer-sync.js` OK؛ `npm test` ⇒ **۱۶/۱۶**؛ `npm run build` exit 0 | **امن** به‌شرطِ lockfile |

چرا شرط دارد: diffِ `#58` **فقط** `lithos/package.json` را تغییر می‌دهد و `lithos/package-lock.json` روی `6.4.4` می‌ماند. اجرای محلیِ `npm install` قفل را بازنویسی کرد: `974 ++++----` (۳۲۵ افزایش / ۶۴۹ کاه). چون jobِ lithos در `ci.yml` با `npm install --no-audit --no-fund` اجرا می‌شود (نه `npm ci`)، CI سبز می‌شود ولی قفلِ commit‌شده ناسازگار می‌ماند ⇒ **پیشنهاد: lockfile بازتولیدشده هم commit شود** (نگهبانِ `test_npm_lockfiles_resolve_every_manifest_range` دقیقاً همین کلاس را می‌گیرد؛ نمونهٔ زنده‌اش همین PR است).

### `/hermes`

| PR | تغییر | CI | راستی‌آزماییِ محلی | وضعیت |
|---|---|---|---|---|
| — | هیچ PR بازِ Dependabot ندارد | — | `npm ls --all` exit 0 ⇒ قفل با manifest سازگار است؛ `npm ci --ignore-scripts` ⇒ ۴۰ بسته؛ تست‌ها در doctor **۲۵۵ + ۱۰** پاس | **امن** (بی‌اقدام) |

`hermes` فقط دو devDependency دارد و هر دو **pinِ دقیق** هستند: `wrangler 4.149.0` و `miniflare 5.20261006.1-alpha`. دو نکتهٔ اندازه‌گیری‌شده با `npm outdated --json` (فقط registry، بدون نصب):

- `wrangler`: `current 4.149.0` / `wanted 4.149.0` / `latest 4.151.2` ⇒ یک patchِ موجود است ولی PR ای برایش باز نشده (چرخهٔ هفتگیِ Dependabot برای `/hermes` در `1dbceebb` چیزی تولید نکرده).
- `miniflare`: `current 5.20261006.1-alpha` / `latest 4.20260730.0` ⇒ «latest» پیشنهادی یک **دانگریدِ ماژور** است، چون pinِ فعلی یک نسخهٔ alpha از خطِ ۵ است که از latestِ پایدار جلوتر است. این یعنی هر ابزارِ خودکاری که `latest` را مبنا بگیرد اینجا پیشنهادِ اشتباه می‌دهد ⇒ دست‌زدن به `miniflare` تصمیمِ دستی می‌خواهد، نه بامپِ خودکار.

### `/viking-team/motion`

| PR | تغییر | CI | علتِ واقعیِ شکست (بازتولیدِ محلی) | وضعیت |
|---|---|---|---|---|
| `#72` | `remotion` 4.0.506 → 4.0.534 | **شکست** در گامِ «Composition spec lock (geometry, fps, palette, no CSS animation)» | `tests/composition.test.mjs:57` ⇒ `assert.equal(pkg.dependencies.remotion, pkg.dependencies['@remotion/cli'], 'cli and runtime must match')` با `actual '4.0.534'` ≠ `expected '4.0.506'`. نصب سالم بود (۲۶۴ بسته، exit 0) ⇒ تست ۵/۶ پاس و ۱ فیل | **بلاک** — باید با `#76` اتمیک برود |
| `#76` | `@remotion/cli` 4.0.506 → 4.0.534 | **شکست** | همان assert، تصویرِ آینه‌ای: `actual '4.0.506'` ≠ `expected '4.0.534'`؛ نصب سالم (۲۷۳ بسته، exit 0) | **بلاک** — باید با `#72` اتمیک برود |
| `#73` | `react-dom` 18.3.1 → 19.3.0 + `@types/react-dom` ^18.3.7 → ^19.3.0 | **شکست** در گامِ «Install the isolated motion-study dependencies» | `npm ci` ⇒ `ERESOLVE`: «While resolving: `@types/react-dom@19.3.0` / Found: `@types/react@18.3.31` / peer `@types/react@"^19.3.0"` from `@types/react-dom@19.3.0`» | **بلاک** — باید با `#75` اتمیک برود |
| `#75` | `react` 18.3.1 → 19.3.0 + `@types/react` ^18.3.31 → ^19.3.0 | **شکست** در همان گامِ نصب | `npm ci` ⇒ `ERESOLVE`: «While resolving: `@types/react-dom@18.3.7` / Found: `@types/react@19.3.0` / peer `@types/react@"^18.0.0"` from `@types/react-dom@18.3.7`» | **بلاک** — باید با `#73` اتمیک برود |
| `#74` | `typescript` 5.6.3 → 7.0.2 | سبز (۱۰) | `npm ci` exit 0 (۲۵۴ بسته)؛ `tsc --version` ⇒ ۷٫۰٫۲؛ `npm run check` exit 0؛ `npm test` ⇒ **۶/۶** | **امن** |

چرا peerِ remotion مانع نیست: `npm view remotion@4.0.534 peerDependencies` و `npm view @remotion/cli@4.0.534 peerDependencies` ⇒ هر دو `react: ">=16.8.0"` و `react-dom: ">=16.8.0"` ⇒ با react 18 و 19 هر دو سازگار است. مانعِ `#73`/`#75` فقط peerِ متقابلِ خودِ react/react-dom و `@types`هاست (`npm view react-dom@19.2.3 peerDependencies` ⇒ `react: "^19.2.3"`).

**مسیرِ سبزِ اندازه‌گیری‌شده برای motion** (به‌جای چهار PR جدا): `remotion` = `@remotion/cli` = `4.0.534`، `react` = `react-dom` = `19.3.0`، `@types/react` = `@types/react-dom` = `^19.3.0` با lockfile بازتولیدشده (`npm install --package-lock-only`) ⇒

- `npm ci --ignore-scripts` exit 0 (۲۶۱ بسته)
- `npm test` ⇒ **۶/۶ پاس** (شاملِ «the toolchain stays pinned so a render is reproducible»)
- `npm run check` (`tsc --noEmit`) exit 0

### `/psk`

| PR | تغییر | CI | راستی‌آزماییِ محلی | وضعیت |
|---|---|---|---|---|
| — | هیچ PR بازِ Dependabot ندارد | — | `psk/package.json` هیچ `dependencies`/`devDependencies` ای ندارد (`deps 0 / dev 0`) و jobِ `psk` در `ci.yml` هرگز `npm install` یا `npm ci` نمی‌زند؛ فقط `npm run check` و `npm test` ⇒ در doctor **۵۷/۵۷** تست و top-1/top-3/safety **۱۰۰٫۰٪** | **امن** (بی‌اقدام) |

نبودِ `psk/package-lock.json` اینجا **موجه** است، نه نقص؛ نگهبانِ `test_npm_lockfiles_resolve_every_manifest_range` هم دقیقاً همین استثنا را می‌سنجد (پروژهٔ بی‌وابستگی از lock معاف است، ولی از پوششِ تست خارج نیست).

### `/brands/viking-offroad/stickers/src`

| PR | تغییر | CI | راستی‌آزماییِ محلی | وضعیت |
|---|---|---|---|---|
| — | تا لحظهٔ این بازبینی هیچ PR بازِ Dependabot ندارد (پوشش از همین دور اضافه شد) | — | `npm install --package-lock-only` ⇒ `package-lock.json` با `lockfileVersion 3` و `playwright-core@1.56.0` دقیق از `registry.npmjs.org`؛ `npm ci` واقعی در همان پوشه ⇒ «added 1 package, audited 2 packages» و **found 0 vulnerabilities**؛ نگهبانِ تازهٔ `test_sticker_manifest_hashes_match_the_committed_pngs` هر ۳۷۳ PNG را با `MANIFEST.json` (sha256 + بایت + IHDR) مقایسه می‌کند — جهشِ یک بایت قرمز شد و بازگردانی با SHA تأیید | **امن** (بی‌اقدام) |

`playwright-core` روی `1.56.0` pin است در حالی که آخرین نسخهٔ پایدارِ registry `1.64.1` است (`npm view playwright-core version`). چون این پوشه تازه زیرِ پوشش رفته، انتظار می‌رود Dependabot به‌زودی PR این فاصله را باز کند. ریسکِ واقعیِ آن بامپ: رندرِ استیکر به Chromiumِ بیرونی (`CHROMIUM_PATH`) وصل است و خروجی‌اش بایت‌به‌بایت در `MANIFEST.json` ثبت شده، پس bump باید با **ساختِ دوباره و مقایسهٔ SHAها** سنجیده شود، نه فقط با سبز شدنِ CI. تا آن موقع `npm ci` بازتولیدپذیر است؛ merge فقط با تأییدِ مالک.

## ۴) جفت‌های بلاک‌کننده و مسیرِ اتمیک

| خوشه | PRها | چرا جدا merge نمی‌شوند | مسیرِ درست |
|---|---|---|---|
| fjcod: vite ↔ plugin-react | `#61` → `#60` | peerِ `@vitejs/plugin-react@6.1.2` به `vite ^8.0.0` نیاز دارد و lockِ خودِ `#60` در برابرِ vite 7 ساخته شده | اول `#61`، سپس lockِ `#60` **بازتولید** شود؛ یا یک PR ترکیبی با lockِ تازه |
| motion: remotion ↔ cli | `#72` ↔ `#76` | تستِ خودِ ریپو برابرِ نسخهٔ این دو را الزام می‌کند (`cli and runtime must match`) و pinِ دقیق می‌خواهد | یک PR ترکیبی (هر دو `4.0.534`) |
| motion: react ↔ react-dom ↔ @types | `#73` ↔ `#75` | peerِ `@types/react-dom@19.3.0` ⇒ `@types/react@^19.3.0` و peerِ `@types/react-dom@18.3.7` ⇒ `@types/react@^18.0.0`؛ یعنی هر دو PR همدیگر را می‌شکنند | یک PR ترکیبی (react 19.3.0 + react-dom 19.3.0 + هر دو `@types` ^19.3.0) |
| lithos: manifest ↔ lock | `#58` | قفلِ commit‌شده کهنه می‌ماند و CI با `npm install` این را نمی‌بیند | commit شدنِ lockfile بازتولیدشده همراهِ بامپ |

قاعدهٔ کلیِ هر دو خوشه: همهٔ PRهای یک پروژه روی **یک جفت فایل** (`package.json` + `package-lock.json`) می‌نشینند ⇒ **هر merge، lockِ PR بعدی را باطل می‌کند.** پس ترتیبِ زیر یک‌به‌یک و بعد از هر merge با `npm ci` + تستِ همان پروژه.

## ۵) PRهای انسانیِ باز (Dependabot نیستند)

| PR | شاخه | باز از | CI | وضعیت |
|---|---|---|---|---|
| `#12` «Make the PSK site an installable PWA» | `claude/psk-pwa` | ۲۰۲۶-۱۰-۰۴ | **هیچ check ای ندارد** و `mergeable_state: null` | نیاز به rebase + بازبینیِ دستی؛ قدیمی‌ترین PR بازِ ریپو |
| `#95` «docs: 100-task backlog for delivery agents» | `claude/optimistic-ritchie-eggjwe` | ۲۰۲۶-۱۰-۲۰ | ۲۰ check | یک فایلِ تازهٔ `docs/AGENT_TASKS_100.md` (+۱۶۰ خط، بدون تغییرِ کد)؛ تسک ۹۹ همان «جدول در `docs/DEPENDENCY_REVIEW.md`» است که این سند پاسخِ آن است |

## ۶) ترتیبِ پیشنهادیِ merge (تصمیم با مالک)

1. `#71` → `#53` → `#55` → `#54` : اکشن‌ها، یکی‌یکی؛ بعد از هر merge فقط `repo-health` و دو تستِ نگهبانِ `ci.yml` دیده شود.
2. `#56` (minor) → سپس **یک PR ترکیبیِ fjcod** به‌جای `#61` + `#60` + `#59` + `#62` با lock بازتولیدشده (مسیرش در بخش ۳ اندازه‌گیری شد). اگر ترجیح بر PRهای جدا است: اول `#61`، بعد lockِ `#60` حتماً بازتولید شود وگرنه `npm ci` دوباره می‌شکند.
3. `#58` (lithos) فقط همراهِ lockfile بازتولیدشده؛ `#57` (bison) مستقل و سبز.
4. **یک PR ترکیبیِ motion** برای remotion + cli + react + react-dom + `@types`ها (جایگزینِ `#72`/`#73`/`#75`/`#76`)؛ `#74` (typescript 7.0.2) مستقل و سبز.
5. `#12` و `#95` جداگانه و با بازبینیِ انسانی.

پس از هر merge: `cd <project> && npm ci --ignore-scripts && <تستِ همان پروژه>` و در پایان `python3 -m unittest discover -s tests -p "test_*.py"` + `python3 scripts/scan_secrets.py`.

## ۷) NOT RUN (صریحاً اجرا نشد)

- **هیچ merge/rebase/close ای** روی هیچ PR ای انجام نشد و هیچ comment یا دستورِ `@dependabot` ای داده نشد ⇒ merge فقط با مالک.
- لاگِ jobهای CI خوانده نشد (۰ بایت / `EOF` از دامنهٔ بیرونِ allowlist)؛ علتِ شکست‌ها فقط از **بازتولیدِ محلی** و **registry** گرفته شده است.
- رندرِ واقعیِ MP4 با `remotion 4.0.534` اجرا نشد (`npm run render`): فقط `tsc --noEmit` و تستِ specِ ۶ مورد.
- fjcod E2E زیرِ **خودِ بامپ‌ها** جدا اجرا نشد؛ روی `main` اجرا شد و `E2E PASSED` (با Chromium 131.0.6778.0) و CI هم برای هر پنج PR سبزِ fjcod گامِ `fjcod-e2e` را پاس کرده است.
- تستِ سازگاریِ مرورگرِ واقعی برای `vite 8` / `lucide-react 1.x` (رفتارِ رندر در Safari/iPhone) انجام نشد.
- `/psk`: هیچ PR Dependabot ندارد چون هیچ `dependencies`/`devDependencies` ای اعلام نکرده و jobش هرگز `npm install` نمی‌زند ⇒ نبودِ `psk/package-lock.json` **موجه** است، نه نقص (نگهبانِ lockfile هم همین را می‌سنجد).
- Supabase / Vercel / Cloudflare Workers / Buffer API / `POINT/fjcod` / `cham-store-os.vercel.app`: بیرونِ allowlist و نیازمندِ تأییدِ مالک.

## ۸) معیارِ تکرارِ این بازبینی

همین جدول‌ها با سه فرمانِ زیر قابلِ بازتولید است (بدون secret، بدون سرویسِ پولی):

```bash
gh pr list --state open --limit 40 --json number,title,author,createdAt,headRefName
gh api "repos/<owner>/<repo>/commits/<head-sha>/check-runs" --jq '.check_runs[] | [.name,.conclusion] | @tsv'
# برای هر PR: diff را در worktree موقت ببر و همان گام‌های CI را اجرا کن
git worktree add --detach /tmp/wt HEAD && cd /tmp/wt && gh pr diff <n> | git apply - && \
  (cd <project> && npm ci --ignore-scripts --no-audit --no-fund && <تستِ پروژه>)
```

و دادهٔ peer با `npm view <pkg>@<version> peerDependencies peerDependenciesMeta` (فقط registry، بدون نصب).

## ۹) به‌روزرسانی ۲۰۲۶-۱۰-۲۲ — mergeها با دستورِ صریحِ مالک

> تاریخِ اندازه‌گیری: ۲۰۲۶-۱۰-۲۲ · پایه: `main` در `d22b832a` → پس از این دور `e9637116`
> بخش‌های ۱ تا ۸ دست‌نخورده‌اند: آن‌ها snapshotِ دورِ ۲۰۲۶-۱۰-۲۰ هستند و بازنویسیِ تاریخِ اندازه‌گیری‌شده ممنوع. این بخش وضعیتِ امروز است.
> قاعدهٔ «merge فقط با مالک» پابرجاست؛ تفاوتِ این دور آن است که مالک برای همین PRها دستورِ صریحِ merge داد (`squash` + حذفِ شاخهٔ Dependabot).

### merge شدند

| PR | تغییر | CI پیش از merge (اندازه‌گیری‌شده) | merge commit | وضعیت |
|---|---|---|---|---|
| `#54` | `actions/checkout` 4 → 7 | ۲۳ pass / ۱ skipping · `MERGEABLE/CLEAN` | `9dd40fb5` | **امن** |
| `#102` | `playwright-core` 1.56.0 → 1.64.1 در stickers | ۲۰ pass · `CLEAN` | `7e0e2325` | **امن** |
| `#103` | `wrangler` 4.149.0 → 4.151.2 در hermes | ۲۳ pass · `CLEAN` | `9f672ebc` | **امن** |
| `#106` | `playwright-core` 1.63.0 → 1.64.1 در fjcod | ۲۰ pass · `CLEAN` | `ed72d0e3` | **امن** |
| `#104` | `lucide-react` 0.540.0 → 1.59.0 در fjcod (ماژور) | ۲۰ pass شاملِ `fjcod` و `fjcod-e2e` · `CLEAN` | `e9637116` | **امن** با دو تبصرهٔ زیر |

**راستی‌آزماییِ `#104`** — ماژور بود، پس «CI سبز» تنها کافی نبود: tarballِ `lucide-react@1.59.0` از `registry.npmjs.org` گرفته شد و فهرستِ exportهایش از `dist/lucide-react.d.ts` استخراج شد. **هر ۵۲ نامی** که `fjcod/src` وارد می‌کند در نسخهٔ هدف هست (۰ مفقود از ۱۴٬۰۱۷ symbol) و `peerDependencies` نسخهٔ هدف `react ^16.5.1 || ^17 || ^18 || ^19` است. بر این راستی‌آزمایی، jobِ `fjcod` (build/تایپ) و jobِ `fjcod-e2e` (smokeِ مرورگری روی desktop و viewportِ ۳۹۰×۸۴۴) هم روی خودِ بامپ سبز بودند.

- **NOT RUN:** بازبینیِ چشمیِ فروشگاه. این محیط مرورگر ندارد، پس «آیکن‌ها سرِ جایشان‌اند» از build + smoke + بررسیِ export نتیجه گرفته شد، نه از دیدنِ صفحهٔ واقعی.
- **یافتهٔ پیگیری:** ۵ تایِ آن ۵۲ نام در نسخهٔ ۱ **aliasِ نامِ قدیمی‌اند**: `AlertCircle→CircleAlert`، `AlertTriangle→TriangleAlert`، `CheckCircle2→CircleCheck`، `FileBarChart→FileChartColumnIncreasing`، `Trash2→Trash`. امروز کار می‌کنند و build را نمی‌شکنند، ولی اگر ماژورِ بعدی aliasها را بردارد `fjcod` می‌شکند ⇒ پیشنهاد: همین ۵ نام در `fjcod/src` به نامِ canonical تغییر کنند (تغییرِ مکانیکی، با تستِ build). بقیهٔ ۴۷ نام canonical‌اند (نگاشت‌های `index_*` در `.d.ts` نامِ داخلیِ bundle است، نه تغییرِ نام).

### merge نشدند (با علتِ اندازه‌گیری‌شده)

| PR | علتِ اندازه‌گیری‌شده | وضعیت |
|---|---|---|
| `#101` (`setup-python` 5 → 6) | پیش از این دور `CLEAN` بود؛ **پس از mergeِ `#54`** به `CONFLICTING/DIRTY` رفت چون هر دو همان سه workflow را touched کرده‌اند. دستورِ `@dependabot rebase` داده شد (نخستین دستورِ dependabot در این مخزن؛ بخشِ ۷ می‌گوید در آن دور هیچ داده نشده بود) | **بلاک** تا rebaseِ خودِ Dependabot |
| `#55` (`setup-node` 4 → 7) | در لحظهٔ سنجه **همهٔ** چک‌ها `pending` بودند (پس از جلو رفتنِ `main` دوباره اجرا شده بود) و وضعیت `UNKNOWN` ⇒ سبزِ کامل احراز نشد | **بلاک** تا پایانِ سبزِ چک‌ها |
| `#71` (`upload-artifact` 4 → 7) | ۱۴ چکِ مخزن pass ولی **۵ چکِ دیپلوی Vercel** fail: `cham-store-os`، `psk-3000`، `bison.brandbook.site.2026`، `lithos-live-intelligence-vercel-fixed`، `viking-experience-command` ⇒ مانع بیرونی است، نه کدِ این PR | **بلاک** |
| `#105` و `#107` (`remotion` و `@remotion/cli` 4.0.506 → 4.0.536) | هر دو `MERGEABLE/UNSTABLE`. علت در کدِ خودِ پروژه است: `viking-team/motion/tests/composition.test.mjs` خط ۵۷ برابریِ `dependencies.remotion` با `dependencies['@remotion/cli']` و خط ۵۸ pinِ دقیقِ سه‌جزئی را assert می‌کند ⇒ هر PRِ جداگانه فقط یک سمت را جابه‌جا می‌کند و همان تست می‌شکند. راه‌حل در `dependabot.yml` گروه `remotion` است (PR `#109`)؛ پس از mergeِ آن، این دو PR بسته می‌شوند تا Dependabot یک PRِ گروهی بسازد | **بلاک** |

### NOT RUN (این دور)

- اجرای محلیِ `npm ci`/`npm test` برای `#102`/`#104`/`#106`: `node_modules` آن پروژه‌ها در این محیط نصب نیست؛ استناد به check-runهای واقعیِ خودِ PRها + registry.
- mergeِ `#55`، `#71`، `#101` و بستنِ `#105`/`#107` (موکول به سبز شدنِ `#109`).
- هر تغییر در تنظیماتِ Vercel یا در branch protection (چک‌های دیپلویِ قرمزِ `#71` و «الزامِ status check» روی `main` هر دو تصمیمِ مالک‌اند؛ روی مخزنِ خصوصی، الزامِ status check به پلنِ پولیِ GitHub نیاز دارد).
- رندرِ واقعیِ MP4 با `remotion` (همان NOT RUNِ دورِ قبل پابرجاست).
