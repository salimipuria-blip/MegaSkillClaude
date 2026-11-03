# جعبه‌ابزار ممیزی حرفه‌ای — MegaSkillClaude

**تاریخ:** ۲۰۲۶-۱۱-۰۴ · **دامنه:** ممیزی کد، وابستگی، راز، مجوز، مهارت‌های شخص ثالث، CI و زیرساخت
**مبنا:** یافته‌های `docs/REPO_DEEP_ANALYSIS_2026-11-03.md` و `docs/STARRED_REPOS_AUDIT_2026-11.md`.

> اصل حاکم: **هر ابزار باید یا «دروازه» (گیت) باشد یا «گزارش دوره‌ای».** ابزاری که خروجی‌اش خوانده نشود، ممیزی نیست، هزینه است.

---

## ۱) سه لایهٔ اجرا

| لایه | زمان اجرا | ابزارهای مناسب | معیار موفقیت |
|---|---|---|---|
| **L۱ — پیش از commit** | < ۵ ثانیه | gitleaks، actionlint، ruff، shellcheck، اسکن نام فایل | commit آلوده هرگز ساخته نشود |
| **L۲ — روی PR** | ۲–۵ دقیقه | OSV-Scanner، Semgrep، SkillSpector (skills)، ESLint/tsc، coverage، licensee، zizmor | شکست = PR قابل merge نیست |
| **L۳ — زمان‌بندی‌شده** | روزانه/هفتگی | Trivy/Grype روی SBOM، OSSF Scorecard، بازبینی drift مهارت‌ها، npm audit | گزارش به issue/چت، نه silence |

---

## ۲) فهرست ابزارها (با دستور دقیق برای همین ریپو)

### ۲.۱ رازها و اعتبارنامه‌ها
| ابزار | چه می‌گیرد | دستور | هزینه |
|---|---|---|---|
| **gitleaks** | توکن/کلید در تاریخ گیت و فایل‌ها + قواعد سفارشی (توکن تلگرام، Supabase، Vercel) | `gitleaks detect --source . --redact -v` و برای CI: `gitleaks detect --source . --redact --exit-code 1` | رایگان |
| **TruffleHog v3** | رازهای زنده با verification (کمتر false positive) | `trufflehog filesystem . --only-verified --no-update` | رایگان |
| **detect-secrets** | baseline قابل‌قبول برای تیم‌های کوچک | `detect-secrets scan > .secrets.baseline` | رایگان |
| **GitHub Secret Scanning + Push Protection** | رازهای شناخته‌شده در سطح پلتفرم | Settings → Code security (برای مخزن عمومی رایگان) | رایگان |
| **GitGuardian ggshield** | اسکن pre-commit/repo با قواعد تجاری | `ggshield secret scan repo .` | رایگان محدود |

**یافتهٔ مرتبط:** در ۲۱ ریپوی بررسی‌شده هیچ راز واقعی پیدا نشد؛ ۹ «الگوی راز» در ECC و ۱ در SkillSpector همه در **fixture تست** بودند. پس قاعدهٔ لازم: گیت با `baseline`/`--only-verified`، نه مسدودسازی کورکورانه.

### ۲.۲ وابستگی‌ها، SBOM و CVE
| ابزار | چه می‌گیرد | دستور | هزینه |
|---|---|---|---|
| **OSV-Scanner** | CVE در lockfileها (npm/pip/cargo/go) بدون نصب وابستگی | `osv-scanner scan source -r .` | رایگان |
| **npm audit** | CVE پکیج‌های Node (همین امروز: bison با `vite ≤6.4.3` یک high دارد) | `npm audit --audit-level=high --omit=dev` در هر پوشه | رایگان |
| **pip-audit** | CVE وابستگی‌های پایتون | `pip-audit -r requirements.txt` (فعلاً فایل requirements وجود ندارد) | رایگان |
| **Syft** | ساخت SBOM (CycloneDX/SPDX) برای هر انتشار | `syft dir:. -o cyclonedx-json=sbom.cdx.json` | رایگان |
| **Grype** | اسکن SBOM و فایل‌سیستم | `grype sbom:./sbom.cdx.json --fail-on high` | رایگان |
| **Trivy** | CVE + راز + misconfig در یک اجرا | `trivy fs --scanners vuln,secret,misconfig --skip-dirs node_modules .` | رایگان |
| **Renovate** (جای Dependabot یا کنارش) | به‌روزرسانی گروهی با cooldown و automerge کنترل‌شده | `renovate.json` با `groupName` و `minimumReleaseAge` | رایگان |
| **Socket.dev** | رفتار مشکوک پکیج (نصب اسکریپت، شبکه) نه فقط CVE | `npx @socketsecurity/cli scan` | رایگان محدود |

**یافتهٔ مرتبط:** ۲۵ PR باز که ۱۱ تای آن Dependabot است یعنی چرخهٔ به‌روزرسانی **به گلوگاه تبدیل شده**؛ Renovate با گروه‌بندی و بازبینی هفتگی بهتر از ۱۱ PR تک‌تک است.

### ۲.۳ SAST و کیفیت کد
| ابزار | چه می‌گیرد | دستور | هزینه |
|---|---|---|---|
| **Semgrep** | الگوهای ناامن JS/TS/Python + قواعد سفارشی برای «دستور داخل SKILL.md» و `eval`/`child_process` | `semgrep scan --config .semgrep --error --metrics=off` | رایگان (Community) |
| **CodeQL** | تحلیل عمیق dataflow (مناسب fjcod/viking) | GitHub → Code security → Default setup (بدون CLI) | رایگان برای مخزن عمومی |
| **ESLint + typescript-eslint + eslint-plugin-security** | ۴٬۶۰۰ خط TS بدون لینتر | `npx eslint src --max-warnings=0` | رایگان |
| **Ruff** | پایتون: باگ، import، سبک، قواعد bandit (`S`) | `ruff check . --select E,F,B,S` | رایگان |
| **Bandit** | الگوهای امنیتی پایتون (subprocess/eval/pickle) | `bandit -q -r orchestrator scripts -x '*/tests/*'` | رایگان |
| **ShellCheck** | اسکریپت‌های bash (قبلاً فقط برای hermes فعال است) | `shellcheck -x hermes/*.sh scripts/*.sh` | رایگان |
| **actionlint** | خطای واقعی در workflowها (متغیر، shell، matrix) | `actionlint -color` | رایگان |
| **zizmor** | ممیزی امنیتی workflowها: pin نشدن action، `pull_request_target`، مجوز بیش‌ازحد | `zizmor --format plain .github/workflows` | رایگان |
| **Hadolint** | Dockerfile (فعلاً نداریم) | `hadolint Dockerfile` | رایگان |

**یافتهٔ مرتبط:** ۲۹ ارجاع `uses:` در workflowها (۲۵ فعال) همه با tag شناور (`@v4`) pin شده‌اند؛ `zizmor` همین را به‌عنوان ریسک supply-chain گزارش می‌کند.

### ۲.۴ کیفیت ساختار، تکرار و مجوز
| ابزار | چه می‌گیرد | دستور | هزینه |
|---|---|---|---|
| **jscpd** | کد تکراری (پلاگین ↔ library ↔ `.claude`) | `npx jscpd --min-tokens 120 --ignore "library/**,plugins/**" .` | رایگان |
| **knip** | فایل/وابستگی/export بی‌استفاده (fjcod) | `npx knip` | رایگان |
| **dependency-cruiser** | وابستگی چرخه‌ای و لایه‌شکنی | `npx depcruise src` | رایگان |
| **Lizard** | پیچیدگی و طول تابع (app.mjs با ۱٬۰۰۰ خط) | `lizard -l js -l ts -l python -w .` | رایگان |
| **licensee / license-checker** | انطباق مجوز وابستگی‌ها | `npx licensee --production .` · `npx license-checker --summary` | رایگان |
| **REUSE (FSFE)** | هدر SPDX برای هر فایل (الزام وندور کردن ۳٬۰۰۰+ مهارت) | `reuse lint` | رایگان |
| **OSSF Scorecard** | امتیاز ۰–۱۰ برای سلامت مخزن (branch protection، pin، token permissions) | `scorecard --repo=github.com/salimipuria-blip/MegaSkillClaude --show-details` | رایگان |
| **Allstar / Rulesets** | اجبار CODEOWNERS، امضای commit، بررسی‌های لازم | GitHub Settings → Rulesets | رایگان |

**یافتهٔ مرتبط:** مخزن **LICENSE ریشه ندارد** ولی در `plugin.json` مجوز MIT اعلام شده و ۳٬۰۱۱ اثر شخص ثالث وندور شده؛ `licensee` و `reuse` این تناقض را به گیت تبدیل می‌کنند.

### ۲.۵ تست، پوشش و رگرسیون
| ابزار | چه می‌گیرد | دستور | هزینه |
|---|---|---|---|
| **پوشش داخلی Node** (بدون نصب) | پوشش خط/شاخه/تابع برای psk/hermes/lithos/viking | `node --test --experimental-test-coverage tests/*.test.mjs` | رایگان |
| **Vitest coverage** | پوشش fjcod | `npx vitest run --coverage` | رایگان |
| **pytest-cov** | پوشش پایتون (root/orchestrator) | `pytest --cov --cov-report=term-missing` | رایگان |
| **Stryker** | تست mutation: آیا تست‌ها واقعاً باگ را می‌گیرند؟ | `npx stryker run` | رایگان |
| **Playwright + @axe-core/playwright** | E۲E و دسترس‌پذیری (fjcod e۲e، viking) | `npx playwright test` | رایگان |
| **Lighthouse CI** | LCP/CLS/وزن صفحه (هدف: LCP < ۲.۵s) | `npx @lhci/cli autorun --collect.staticDistDir=dist` | رایگان |
| **size-limit** | جلوگیری از رشد باندل (fjcod: ۱۱۴KB gzip) | `npx size-limit` | رایگان |

**دادهٔ واقعی همین امروز:** اجرای پوشش داخلی Node روی psk → **۹۷.۹٪ خط، ۸۸.۳٪ شاخه**. برای fjcod (۴٬۶۰۰ خط، ۳۳ تست) این عدد قطعاً پایین است و همین دستور آن را افشا می‌کند.

### ۲.۶ دیتابیس، RLS و زیرساخت
| ابزار | چه می‌گیرد | دستور | هزینه |
|---|---|---|---|
| **Supabase CLI — db lint** | خطای SQL، سیاست‌های ناامن، عملکرد | `supabase db lint --linked` (یا `--local`) | رایگان |
| **pgTAP + `supabase test db`** | تست واقعی RLS: «کاربر غیرعضو باید ۰ ردیف ببیند» | `supabase test db` | رایگان |
| **sqlfluff** | سبک/خطای SQL در `fjcod/supabase` و `viking-team/sql` | `sqlfluff lint fjcod/supabase viking-team/sql --dialect postgres` | رایگان |
| **pglast** | پارس بدون اجرا (قبلاً برای migration CHAM استفاده شده) | `python -c "import pglast,sys; pglast.parse_sql(open(sys.argv[1]).read())" file.sql` | رایگان |
| **Checkov** | misconfig در IaC/GitHub Actions/secrets | `checkov -d . --framework secrets,github_actions` | رایگان |
| **Trivy config** | misconfig کانتینر/IaC | `trivy config .` | رایگان |

**یافتهٔ مرتبط:** RLS و migration آماده‌اند ولی **اعمال نشده‌اند**؛ فقط `supabase test db` می‌تواند ثابت کند که کاربر غیرمجاز صفر ردیف می‌بیند. SQL خواندن، اثبات RLS نیست.

### ۲.۷ وب، فرانت و هدرها
| ابزار | چه می‌گیرد | دستور/سرویس | هزینه |
|---|---|---|---|
| **OWASP ZAP baseline** | هدرهای امنیتی، XSS/نشت نسخه، mixed content | `docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://…` | رایگان |
| **Mozilla Observatory** | نمرهٔ هدرها و CSP | `observatory <url>` یا سایت observatory.mozilla.org | رایگان |
| **CSP Evaluator** | ضعف CSP (psk فقط `default-src 'none'` دارد؛ viking اصلاً ندارد) | csp-evaluator.withgoogle.com | رایگان |
| **Lighthouse** | کارایی/دسترس‌پذیری/SEO | `npx lighthouse <url> --chrome-flags="--headless"` | رایگان |
| **SRI / CSP برای CDN** | `esm.sh` و `jsdelivr` بدون SRI در viking | بررسی دستی + `integrity=` | رایگان |

### ۲.۸ هوش مصنوعی، LLM و مهارت‌ها (مهم‌ترین دسته برای این ریپو)
| ابزار | چه می‌گیرد | دستور | هزینه |
|---|---|---|---|
| **NVIDIA SkillSpector** ⭐ (خودش در ستاره‌های شماست) | ۷۱ الگوی آسیب‌پذیری در مهارت‌های ایجنت: prompt injection، exfiltration، privilege escalation، rogue agent، poisoned MCP؛ خروجی SARIF/Markdown + امتیاز ۰–۱۰۰ | `skillspector scan library/github-skills --no-llm --format markdown --output docs/audit/skills.md` | رایگان (Apache-2.0) |
| **Semgrep + قواعد سفارشی skill** | الگوهای ساده و سریع: `curl … \| bash`، `rm -rf /`، `base64 -d \| sh`، «ignore previous instructions» | `semgrep scan --config .semgrep/skills.yml --error library/github-skills` | رایگان |
| **promptfoo (redteam)** | رفتار مدل در برابر jailbreak و تزریق در همان مسیر پاسخ psk/hermes | `npx promptfoo@latest redteam run -c promptfooconfig.yaml` | رایگان |
| **garak** | آسیب‌پذیری مدل/محافظ (leak، injection، toxicity) | `garak --model_type rest --generations 20` | رایگان |
| **PyRIT** (Microsoft) | اورکستراسیون سناریوهای حمله چندمرحله‌ای | کتابخانهٔ پایتون | رایگان |
| **LLM Guard** | فیلتر ورودی/خروجی (PII، injection) برای مسیر هرمس | `pip install llm-guard` | رایگان |
| **OWASP LLM Top-۱۰ + MITRE ATLAS** | چک‌لیست پوشش تهدید | دستی، در قالب skill | رایگان |

**چرا این دسته اولویت دارد؟** خودِ SkillSpector در ۳۱٬۱۳۲ مهارت بررسی‌شده گزارش می‌کند **۲۶.۱٪ آسیب‌پذیری** و **۵.۲٪ قصد مخرب محتمل** دارند. کتابخانهٔ شما ۶٬۰۱۷ مهارت از ۲۹ ریپوی ثالث دارد؛ بدون اسکن، این ریسک مستقیماً وارد context مدل و مسیر اجرا می‌شود.

> محدودیت این محیط: SkillSpector به Python ۳.۱۲+ نیاز دارد و در این sandbox (Python ۳.۱۱، بدون Docker/uv) قابل نصب نبود؛ دستور بالا را روی ماشین خودتان یا در یک job CI با `python-version: "3.12"` اجرا کنید.

### ۲.۹ نظارت و عملیات
| ابزار | چه می‌گیرد | هزینه |
|---|---|---|
| **Sentry** (JS/Python) | خطای واقعی در fjcod/psk/viking با stack trace | رایگان محدود |
| **OpenTelemetry** | trace/metric یکسان بین Worker و Vercel | رایگان |
| **Cloudflare Analytics + Logpush** | خطای Worker، CPU time، ۵xx هرمس | رایگان |
| **Vercel Log Drains** | لاگ توابع psk/lithos | رایگان محدود |
| **Better Stack / Uptime Kuma** | مانیتورینگ uptime و هشدار سهمیه | رایگان محدود |

---

## ۳) اولویت پیشنهادی (۱۰ ابزار برای ۲ هفتهٔ آینده)

| # | ابزار | چرا همین حالا | زمان نصب |
|---|---|---|---|
| ۱ | gitleaks + push protection | قبل از هر commit؛ هزینهٔ صفر | ۳۰ دقیقه |
| ۲ | OSV-Scanner | CVE واقعی در bison/lithos/fjcod | ۳۰ دقیقه |
| ۳ | **SkillSpector** | ۶٬۰۱۷ مهارت ثالث بدون اسکن | ۲ ساعت |
| ۴ | Semgrep با قواعد سفارشی مهارت | سریع‌ترین گیت روی PR | ۲ ساعت |
| ۵ | actionlint + zizmor | ۲۹ action با tag شناور | ۱ ساعت |
| ۶ | ESLint/tsc برای fjcod | ۴٬۶۰۰ خط TS بدون لینتر | ۲ ساعت |
| ۷ | Ruff + Bandit | ۳٬۴۴۵ فایل پایتون (بیشترشان مهارت) | ۱ ساعت |
| ۸ | Node coverage با آستانه | بدون نصب، همین امروز | ۳۰ دقیقه |
| ۹ | licensee + REUSE + LICENSE ریشه | تناقض مجوز | ۱ ساعت |
| ۱۰ | OSSF Scorecard + Rulesets | اجبار CODEOWNERS/signed commit | ۱ ساعت |

---

## ۴) مهارت‌های حرفه‌ای (Skills) که باید داشته باشید

۸ مهارت پیشنهادی؛ هر کدام «ورودی → خروجی» و «ابزار» مشخص دارد و می‌تواند در `library/skills/` (مال خودتان) یا `.claude/skills/` بنشیند.

| # | نام مهارت | مسئله | ورودی | خروجی | ابزارها | معیار پذیرش |
|---|---|---|---|---|---|---|
| ۱ | `skill-supply-chain-audit` | مهارت ثالث می‌تواند دستور اجرا کند/راز بدزدد | یک ریپو یا پوشهٔ مهارت | گزارش SARIF/MD + baseline + verdict | SkillSpector، Semgrep، jscpd | صفر finding بحرانی بدون justification |
| ۲ | `repo-security-baseline` | نبود گیت راز/SAST در مونوریپو | مخزن | workflow امنیتی + گزارش اول | gitleaks، OSV، Semgrep، CodeQL | هر PR شکست‌پذیر |
| ۳ | `dependency-sbom-release` | CVE و نبود SBOM | lockfileها | SBOM + گزارش CVE + برنامهٔ ارتقا | Syft، Grype، npm audit، Renovate | SBOM برای هر tag |
| ۴ | `rls-authz-proof` | RLS «آماده» ولی اثبات‌نشده | migration + نقش‌ها | تست pgTAP سبز + ماتریس دسترسی | Supabase CLI، pgTAP، sqlfluff | کاربر غیرمجاز ۰ ردیف |
| ۵ | `llm-prompt-injection-redteam` | تزریق در context مدل (psk/hermes) | پرامپت + مهارت‌ها | مجموعهٔ حمله + نتیجه | promptfoo، garak، PyRIT | نرخ موفقیت حمله < ۵٪ |
| ۶ | `frontend-quality-gate` | بدون لینتر/پوشش/a۱۱y | fjcod/viking/bison | گیت کیفیت + گزارش | ESLint، Vitest coverage، axe، LHCI | صفر خطای a۱۱y بحرانی |
| ۷ | `release-provenance` | زنجیرهٔ تأمین انتشار | تگ | artifact امضاشده + provenance | cosign/Sigstore، Scorecard، SLSA | verify موفق در مقصد |
| ۸ | `incident-response-runbook` | نبود رویهٔ نشت راز/سرویس | سناریو | runbook اجرایی | Sentry، CF/Vercel logs | تمرین dry-run |

### مهارت‌های موجودِ کتابخانهٔ خودتان که همین کار را می‌کنند
`library/github-skills/` از قبل گزینه‌های مرتبط دارد (۳۹۹ مورد با کلیدواژهٔ security/audit). پیشنهاد استفادهٔ مستقیم:

- `agent-architecture-audit` (affaan-m/ECC) — ممیزی معماری ایجنت
- `api-security` و `api-security-best-practices` — چک‌لیست API
- `audit-logging` / `audit-log` — طراحی لاگ ممیزی
- `ai-prompt-engineering-safety-review` (github/awesome-copilot) — بازبینی ایمنی پرامپت
- `a11y-audit` (alirezarezvani/claude-skills) — دسترس‌پذیری
- `security-review`/`threat-modeling` در صورت وجود در ۳٬۰۱۱ مهارت (با `python3 .claude/skills/mega-skills-router/scripts/route.py "security audit"`)

⚠️ همین مهارت‌ها هم **باید** با SkillSpector غربال شوند؛ عضویت در کتابخانه دلیل اعتماد نیست.

---

## ۵) نمونهٔ گیت CI (`workflows` پیشنهادی، اجرا نشده)

```yaml
name: Audit
on:
  pull_request:
  schedule: [{cron: "0 3 * * 1"}]
permissions: {contents: read}
jobs:
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: {fetch-depth: 0, persist-credentials: false}
      - uses: gitleaks/gitleaks-action@v2
  deps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google/osv-scanner-action@v1
  skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.12"}
      - run: pipx install "git+https://github.com/NVIDIA/SkillSpector.git"
      - run: skillspector scan library/github-skills --no-llm --format sarif --output skills.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with: {sarif_file: skills.sarif}
  workflows-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: raven-actions/actionlint@v2
      - run: pipx run zizmor .github/workflows
  licenses:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx --yes licensee --production .
```

**نکتهٔ سخت‌سازی:** actionها باید با **SHA کامل** پین شوند (نه `@v4`)؛ `zizmor` همین را گزارش می‌کند و Renovate/Dependabot می‌تواند pin را به‌روز نگه دارد.

---

## ۶) نمونهٔ افزودن به `.pre-commit-config.yaml`

```yaml
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.28.0
    hooks: [{id: gitleaks}]
  - repo: https://github.com/rhysd/actionlint
    rev: v1.7.7
    hooks: [{id: actionlint}]
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.9.0
    hooks: [{id: ruff, args: [--select, E,F,B,S]}]
```

(pre-commit موجود مخزن فقط local hook دارد و هیچ اسکن راز واقعی انجام نمی‌دهد.)

---

## ۷) معیار «ممیزی تمام‌شده» (Definition of Done)

- [ ] `gitleaks` با baseline صفر finding جدید؛ Secret Scanning روشن
- [ ] `OSV-Scanner`/`npm audit` صفر high/critical بدون استثنای مستند
- [ ] SkillSpector روی ۶٬۰۱۷ مهارت اجرا و baseline ثبت شده؛ هر finding جدید گیت است
- [ ] `actionlint` + `zizmor` سبز؛ همهٔ actionها SHA-pin
- [ ] `LICENSE` ریشه + `reuse lint` سبز
- [ ] پوشش تست: psk ≥ ۹۰٪ (هست)، fjcod ≥ ۵۰٪ (نیست)، hermes ≥ ۸۰٪ (نزدیک)
- [ ] SBOM هر انتشار + Grype صفر high
- [ ] RLS با pgTAP اثبات‌شده (نه فقط SQL موجود)
- [ ] Scorecard ≥ ۷ و Rulesets فعال
- [ ] گزارش ممیزی در `docs/audit/` با تاریخ و owner

---

## ۸) هزینه و زمان (تخمین)

| فاز | محتوا | زمان | هزینه |
|---|---|---|---|
| فاز ۱ | ۵ ابزار L۱/L۲ + LICENSE + Rulesets | ۱ روز | ۰ |
| فاز ۲ | SkillSpector + Semgrep سفارشی + baseline | ۲ روز | ۰ |
| فاز ۳ | pgTAP/RLS + coverage threshold + SBOM | ۳ روز | ۰ |
| فاز ۴ | promptfoo/garak + runbook حادثه | ۳ روز | ۰–۵۰$ (بسته به provider) |

همهٔ ابزارهای بالا نسخهٔ رایگان/متن‌باز دارند و با سیاست «هزینهٔ صفر» مخزن سازگارند.
