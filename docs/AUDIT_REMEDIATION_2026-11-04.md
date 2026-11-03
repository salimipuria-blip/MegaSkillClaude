# گزارش اصلاحات ممیزی — ۲۰۲۶-۱۱-۰۴

این سند **فقط چیزهایی را می‌گوید که اجرا و تأیید شده‌اند**. هر ردیف، ابزاری دارد که
همان لحظه اجرا شد و خروجی‌اش کنارش آمده است. چیزهایی که نشد اجرا شود، در بخش
«تأیید نشده» آمده‌اند.

نقطهٔ شروع: `979dac8f` (شاخهٔ کار) — نقطهٔ پایان: کامیت همین سند.
هدف نهایی: پروداکشنِ Vercel پروژهٔ `psk-3000` (دامنهٔ `psk-3000.vercel.app`).

---

## ۱) خلاصهٔ اجرایی

| # | یافتهٔ ممیزی | اقدام انجام‌شده | تأیید با |
| --- | --- | --- | --- |
| ۱ | هیچ مجوز ریشه‌ای نبود | `LICENSE` (MIT) + یادداشت دامنه: مطالب وندورشده مجوز خودشان را دارند | `tests.test_audit_contract.RequiredFiles` |
| ۲ | ۲۹ اکشن با تگ شناور (`@v4`) | همه به SHA کامل پین شدند + کامنت نسخه | `zizmor` → ۰ یافته |
| ۳ | توکن ورک‌فلو در `.git/config` باقی می‌ماند | `persist-credentials: false` روی هر ۱۲ `checkout` | `WorkflowPinning.test_checkout_never_persists_credentials` |
| ۴ | بدون timeout و concurrency | `timeout-minutes` روی همهٔ jobها، `concurrency` روی `ci.yml` و `security.yml` | `test_every_job_has_a_timeout` |
| ۵ | حداقل‌سطح دسترسی نامشخص | `permissions: contents: read` در هر سه فایل + ممنوعیت `write-all` | `test_workflows_declare_least_privilege_permissions` |
| ۶ | ورک‌فلوی امنیتی وجود نداشت | `.github/workflows/security.yml` با ۷ job (secrets, semgrep, zizmor, contract, deps, sbom, dependency-review) | `zizmor` روی همان فایل: ۰ یافته |
| ۷ | API بدون محدودیت نرخ | `psk/api/_limits.mjs` + ۳۰/دقیقه برای `tasks`، ۱۲۰ برای `health`/`skills`، پاسخ `429` با `Retry-After` | `psk/tests/limits.test.mjs` (۸ تست) |
| ۸ | هدرهای امنیتی ناقص | HSTS، `X-Frame-Options: DENY`، `Permissions-Policy`، `COOP`، CSP صفحه‌ها، `no-store` روی API | `ProductionHeaders` (۳ تست) |
| ۹ | فونت از `fonts.googleapis.com` | هر ۱۱ فایل woff2 محلی شد (Fontsource، OFL) و `@import` گوگل حذف شد | `test_fonts_are_self_hosted` + CSP بدون دامنهٔ گوگل |
| ۱۰ | ۴ آسیب‌پذیری npm (۳×high، ۱×moderate) | `vite` در fjcod/bison/lithos به‌روز شد؛ `undici` در hermes با `overrides` به 7.30.1 | `npm audit` در چهار پوشه: `found 0 vulnerabilities` |
| ۱۱ | `lithos` بدون lockfile | `package-lock.json` تولید و `npm ci` شد | `npm audit` روی lockfile |
| ۱۲ | INDEX.json فقط `/tree/HEAD/` داشت | `library/github-skills/PROVENANCE.json`: ۳۰۱۱ مهارت با SHA-256 + ۲۹ مخزن پین‌شده به کامیت upstream | `python3 scripts/audit/skill_provenance.py --check` → ۰ drift |
| ۱۳ | SBOM نبود | `scripts/audit/make_sbom.mjs` → CycloneDX 1.5، ۳۶۳ پکیج + ۵ اپ، بازتولیدپذیر | `test_sbom_is_current` (دوبار تولید و مقایسه شد) |
| ۱۴ | `curl | bash` در `hermes/setup.sh` | دانلود به فایل موقت + بررسی اختیاری `HERMES_INSTALLER_SHA256` + اجرا از دیسک | `bash -n` + `shellcheck` در CI + `test_no_shell_download_pipe` |
| ۱۵ | glob غلط در هلث‌چک (`.env.dev.example` را رد می‌کرد) | الگو به `*.example` اصلاح شد و فایل‌های جدید به چک‌لیست اضافه شد | `bash scripts/repo_health_check.sh` → سبز |
| ۱۶ | Dependabot بدون cooldown | cooldown هفت‌روزه + گروه‌بندی PRها برای npm و actions | `zizmor` → بدون `dependabot-cooldown` |

**نتیجهٔ نهایی ابزارها:** Semgrep روی ۲۳۳ فایل دست‌اول: **۰ یافته، ۰ خطا** ·
Bandit: **۰** · zizmor (auditor): **۰** · npm audit ×۴: **۰** ·
`detect-secrets`: ۲۹ مورد بازبینی‌شده در `.secrets.baseline` (همه فیک/هش/کلید عمومی).

---

## ۲) آنچه در پروداکشن تغییر کرد

پروژهٔ Vercel: `psk-3000` (Root Directory = `psk`) — همان پروژه‌ای که `psk-3000.vercel.app`
را سرو می‌کند.

| تغییر | اثر روی کاربر |
| --- | --- |
| هدرهای امنیتی در `psk/vercel.json` | HSTS، ممنوعیت iframe، CSP سخت‌گیر روی صفحات، `Cache-Control: no-store` روی API |
| محدودیت نرخ پیش از احراز هویت | حدس‌زدن `ENGINE_TOKEN` بی‌سقف نیست؛ ۴۲۹ با `Retry-After` |
| فونت‌های محلی | صفحهٔ `/puria/` بدون گوگل هم درست نمایش داده می‌شود (مهم برای ایران) |
| هدرهای اضافیِ API (`X-Frame-Options`, `Referrer-Policy: no-referrer`, `CORP`) | پاسخ‌های JSON قابل جاسازی در سایت دیگران نیستند |

آنچه عوض **نشد**: طرح ظاهری، منطق مسیریابی، قرارداد API، توکن دسترسی و متغیرهای محیطی.
هیچ کلیدی خوانده، چاپ یا چرخانده نشد؛ فقط وجود `ENGINE_TOKEN` با کد ۴۰۱/۲۰۰ سنجیده شد.

---

## ۳) تصمیم‌های مهندسی و دلیلشان

1. **skill provenance به‌جای ویرایش `INDEX.json`.** فایل اصلی داده است؛ دست‌زدن به آن
   ریسک شکستن رجیستری را داشت. `PROVENANCE.json` جدا نوشته شد و تست، نبودِ drift را
   الزام می‌کند.
2. **SBOM خانگی به‌جای `cyclonedx-npm`.** یک وابستگی کمتر برای اعتماد، خروجی
   بازتولیدپذیر (timestamp ثابت)، و فقط از lockfileهای متعهدشده می‌خواند.
3. **قواعد Semgrep محلی.** رجیستری Semgrep در ایران/سندباکس در دسترس نیست؛ قواعد
   پروژه بدون شبکه اجرا می‌شوند و در CI قواعد رجیستری هم به‌عنوان نظر دوم اجرا می‌شود.
4. **گیت‌لکس در CI، نه در pre-commit.** نصبش به شبکه نیاز دارد؛ محلی با
   `detect-secrets` + baseline پوشش داده شد.
5. **grade محدودیت نرخ در حافظهٔ هر نمونه.** Vercel بی‌حالت است؛ این یک ترمز انفجاری
   است نه سهمیهٔ دقیق. برای سهمیهٔ توزیع‌شده باید KV/Redis اضافه شود (بدهی فنی ثبت‌شده).

---

## ۴) تأیید نشده / نیاز به کار انسانی

| مورد | چرا انجام نشد | کار لازم |
| --- | --- | --- |
| اجرای `gitleaks` روی تاریخ کامل | دانلود باینری از `release-assets.githubusercontent.com` در سندباکس بلاک است | خودش در CI اجرا می‌شود؛ نتیجهٔ اجرای اول را در تب Actions ببین |
| `SkillSpector` روی کتابخانهٔ مهارت‌ها | نیازمند Python 3.12+ / Docker | روی ماشین خودت: `uv tool install "skillspector @ git+https://github.com/NVIDIA/SkillSpector.git"` سپس `skillspector scan library/github-skills --no-llm --format sarif --output docs/audit/skills.sarif` |
| چرخش توکن‌های `IMS_*` پروژهٔ `infinity-mega-skill-room` | مقدارها رمزنگاری‌شده‌اند و چرخش، تصمیم مالک است | اگر دیگر لازم نیستند، از پنل Vercel حذفشان کن |
| حذف ۴۲ مگابایت sticker و zip از تاریخ Git | بازنویسی تاریخ نیاز به `filter-repo` + force-push دارد | فقط با تأیید صریح؛ فعلاً در `.gitignore` آینده مسدود شده |
| هش رمز کاربران در `hermes/users.mjs` | salt+hash داخل سورس است (نه رمز خام) | انتقال به متغیر محیطی؛ خطر = کرک آفلاین در صورت نشت ریپو |
| ۳۱ مهارت `mattpocock` که upstream بازآرایی شده | نیاز به diff انسانی برای هر مهارت | تصمیم: بازخرید از کامیت پین‌شده در `PROVENANCE.json` |

---

## ۵) نحوهٔ بازتولید همه‌چیز

```bash
# ۱) قرارداد (بدون هیچ وابستگی)
python3 -m unittest tests.test_audit_contract -v

# ۲) همهٔ گیت‌ها + نوشتن شواهد در docs/audit/
python3 -m venv .venv && . .venv/bin/activate
pip install semgrep bandit detect-secrets zizmor
bash scripts/audit/run_scans.sh

# ۳) سلامت مخزن
bash scripts/repo_health_check.sh

# ۴) تست‌های اپ‌ها
(cd psk && npm test && npm run test:coverage)
(cd hermes && npm test)
(cd lithos && npm test)
```

شواهد ماشینی در `docs/audit/` است: `semgrep.json`، `bandit.json`، `zizmor.sarif`،
`npm-audit-*.json`، `sbom.cdx.json`، `starred-repos-2026-11.csv`.
