# آنالیز ممیزی — ۲۰۲۶-۱۱-۱۳

**پایه:** `main` = `170e54e1` (تاریخچه بازنویسی‌شده به یک کامیت توسط مالک، ۲۰۲۶-۱۱-۱۲)
**دامنه:** کل درخت کاری: ۱۴ پروژه + ورک‌فلوها + کتابخانهٔ مهارت‌ها
**قاعدهٔ حاکم:** هیچ ادعایی بدون خروجی اجراشده؛ هر یافته با فایل:خط؛ موارد تأییدنشده صریحاً فهرست شده‌اند.

## نتیجهٔ اجرایی

| لایه | ابزار (نسخه) | نتیجه |
|---|---|---|
| رازها | detect-secrets 1.5.0 + اسکنر سفارشی ۱۴قاعده‌ای | **راز واقعی/زنده: ۰** (۴۴۱ یافته = false-positive رده‌بندی‌شده) |
| SAST | semgrep 1.185.0 (قواعد `.semgrep/`) | **۰ یافته، ۰ خطای اسکن** |
| پایتون | bandit 1.9.4 | ۷ یافتهٔ LOW (assert/subprocess در ابزارهای داخلی) — پذیرفته‌شده |
| ورک‌فلوها | zizmor 1.32.0 (persona=auditor) | **۱ خطای واقعی پیدا و همین‌جا اصلاح شد** ↓ |
| وابستگی‌ها | npm audit روی ۶ lockfile (production) | **۰ آسیب‌پذیری در هر ۶ پروژه** |
| SBOM | make_sbom.mjs | ۳۶۹ پکیج + ۵ اپ؛ بدون drift با نسخهٔ کامیت‌شده |
| پرووننس مهارت‌ها | skill_provenance.py --check | ۲٬۹۴۶/۲٬۹۴۶ هش‌دار، ۰ انحراف |
| همگامی کتابخانه | sync_skill_library.py --check | ۰ فایل متفاوت |
| تست‌ها | unittest | ریشه ۲۰۶/۲۰۶ ✓ · viking ۱۵/۱۵ ✓ · قرارداد ممیزی ✓ |

**وردیقت کلی: سبز.** یک خطای پیکربندی واقعی (F-01) در همین ممیزی پیدا و اصلاح شد.

## یافتهٔ واقعی — اصلاح‌شده در همین شاخه

| کد | شدت | محل | مشکل | اقدام |
|---|---|---|---|---|
| F-01 | Error | `viking-team/.github/workflows/viking-team-static-check.yml` | `actions/checkout@v4` پین‌نشده بود (خلاف قرارداد SHA) + بدون `persist-credentials: false` + بدون `permissions` + بدون `concurrency` | پین به SHA استاندارد ریپو، `persist-credentials: false`، `permissions: contents: read`، `concurrency` و نام جاب — **zizmor auditor روی فایل: «No findings»** |

## رده‌بندی یافته‌های اسکن راز (۴۴۱ مورد = همه FP)

| کلاس | تعداد | نمونه | چرا راز نیست؟ |
|---|---|---|---|
| هش محتوای SHA-256 | ~۴۰۰ | `brands/.../MANIFEST.json`, `BASELINE_ARTIFACTS.json` | هش فایل‌های استیکر/آرتیفکت |
| کلید عمومی-by-design | ۳ | `viking-team/team/app.js:3` (anon JWT)، `lithos/api/buffer-sync.js:2` (`sb_publishable_`) | مستند در README لیتوس/وایکینگ؛ حفاظت با RLS |
| نمک+هش PBKDF2 | ۱۰ | `hermes/users.mjs:7-11` | طراحی مستند؛ گذرواژه ذخیره نمی‌شود (بدهی باز: salt→env) |
| فیکِ تست | ~۲۰ | `sk-typed-in-this-browser`، `xoxb-from-keyring…` | fixture/ثابت تست |
| نقل‌قولِ اسکنر | ۴ | `scripts/scan_secrets.py:21` (الگوی AKIA) | خودِ رگکس قاعده است |
| اسناد وندورشده | ۷ | `BEGIN RSA PRIVATE KEY` در INSTRUCTIONS یک مهارت third-party | محتوای مرجع، هش‌شده در PROVENANCE |

## توصیه‌های باز (بدون فوریت)

1. **hardening نظری workflow** — ۴ هشدار template-injection روی `pull_request.number`، `event_name`، `base.sha`، `github.repository` (ci.yml:368، security.yml:53/58/190): همه مقادیر GitHub-controlled (عدد/enum/hex) و از نظر عملی غیرقابل سوءاستفاده‌اند؛ انتقال از env میانجی = بهینه‌سازی اختیاری.
2. **نام جاب‌ها** — ۲۰ info سطح cosmetic در ورک‌فلوهای ریشه.
3. **`hermes/users.mjs` salt→env** — بدهی مستند در `docs/AUDIT_REMEDIATION_2026-11-04.md`، مالک‌محور.
4. bandit ۷ مورد LOW داخلی (assert در نصب‌کنندهٔ orchestrator، import subprocess در اسکریپت‌های ممیزی) — پذیرفته.

## تأییدنشده (صادقانه فهرست می‌شود)

- **gitleaks/actionlint باینری بومی** — دانلود releaseها به‌خاطر egress مسدود بود؛ معادل‌ها اجرا شدند (detect-secrets + اسکنر ۱۴قاعده‌ای سفارشی برای gitleaks؛ zizmor + قرارداد پین برای actionlint). نسخهٔ بومی gitleaks در CI اجرا می‌شود و مرجع نهایی است.
- **بیلد/e2e مرورگری** — سندباکس node_modules ندارد (تست‌های واحد پوشش داده شد؛ بیلدها گیت CIاند).
- **وضعیت زندهٔ Vercel/Supabase RLS** — این گزارش repo-centric است.
- **OSV API** — هاست در allowlist نیست؛ CVEها از npm audit آمدند.

## روش‌شناسی و تولیدمثل

```bash
# رازها
detect-secrets scan --all-files <scopes>     # + مقایسه با .secrets.baseline
# اسکنر سفارشی: ۱۴ الگو (telegram/ghp_/AIza/sk-/xox/sb_secret/…) در متن درخت
# SAST
semgrep scan --config .semgrep --metrics=off --exclude library,plugins/references,brands,docs .
bandit -r scripts orchestrator -x '*/tests/*'
zizmor --offline --persona auditor .github/workflows viking-team/.github/workflows
# وابستگی/تمامیت
npm audit --omit=dev   (در هر ۶ پروژهٔ lockfile‌دار)
node scripts/audit/make_sbom.mjs && git diff --exit-code docs/audit/sbom.cdx.json
python3 scripts/audit/skill_provenance.py --check
python3 -m unittest discover -s tests -p "test_*.py"   # 206
```

— تهیه‌شده توسط Arena Agent · شاخهٔ `arena/f30fa469-megaskillclaude`
