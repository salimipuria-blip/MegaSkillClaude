# MegaSkillClaude

همهٔ پروژه‌های پوریا در یک مخزن. هر پروژه یک پوشه است و تاریخچهٔ کامل گیت آن حفظ شده.
CI واحد (`.github/workflows/ci.yml`) روی هر PR تست و بیلد همهٔ پروژه‌ها را اجرا می‌کند.

| پوشه | پروژه | فناوری | بررسی (داخل پوشه) | انتشار |
|---|---|---|---|---|
| `psk/` | MEGA SKILLS 3000: سایت و موتور مهارت‌ها | HTML/JS ایستا + توابع Vercel | `npm run check && npm test` | Vercel `psk-3000` |
| `lithos/` | Lithos: داشبورد خصوصی | Vite + Supabase | `npm install && npm test && npm run build` | Vercel `lithos-live-intelligence-vercel-fixed` |
| `fjcod/` | CHAM Store OS: سامانهٔ فروشگاه چام | React 19 + TypeScript + Vite | `npm ci && npm run check` | Vercel `cham-store-os` |
| `viking-team/` | Viking Experience Command: مرکز فرمان تیم | HTML ایستا + Supabase Auth/RLS | `python3 -m unittest discover -s tests` | Vercel |
| `bison-brand-book/` | BISON Brand Book | Vite + GSAP + Lenis | `npm ci && npm run build` | GitHub Pages + Vercel `bison.brandbook.site.2026` |
| `hermes/` | هرمس: دستیار ۲۴/۷ در تلگرام (لایت روی Cloudflare، کامل روی اوراکل) | Cloudflare Worker + Gemini، اسکریپت bash | `npm test && npm run test:integration` و `bash -n setup.sh` | Cloudflare Workers `hermes` |
| `orchestrator/` | Omni LLM Orchestrator (تاریخی) | توابع Supabase Edge + پایتون | `python scripts/audit/check_repository_contract.py` و `python -m pytest -q -ra tests` | Supabase |
| `.claude/skills/mega-skills-router/`، `plugins/`، `library/` | مسیریاب و کتابخانهٔ مهارت‌ها | پایتون | `python -m unittest discover -s tests` (از ریشه) | — |
| `brands/viking-offroad/` | استیکرها و دارایی‌های برند وایکینگ آفرود | PNG + سورس | — | — |

وضعیت دقیق هر پروژه و کارهای بعدی: [ROADMAP.md](ROADMAP.md).

اصلاحات امنیتی، تفاوت تست محلی با انتشار زنده، و مراحل فعال‌سازی: [گزارش سخت‌سازی](docs/REPO_HARDENING.md). CHAM هنوز بک‌اند امن ندارد؛ محافظت نشست آن موقت است.

ممیزی: [تحلیل عمیق مخزن](docs/REPO_DEEP_ANALYSIS_2026-11-03.md) ·
[جعبه‌ابزار ممیزی حرفه‌ای](docs/AUDIT_TOOLKIT_2026-11.md) ·
[ممیزی ریپوهای ستاره‌دار](docs/STARRED_REPOS_AUDIT_2026-11.md) (خروجی ماشین‌خوان: `docs/audit/starred-repos-2026-11.csv`).

## وصل کردن سایت‌های زنده به این مخزن

`fjcod/`، `viking-team/` و `bison-brand-book/` هنوز از مخزن‌های قدیمی خودشان منتشر می‌شوند. تا وقتی این اتصال عوض نشود، تغییرات اینجا روی آن سایت‌ها نمی‌رود.

1. **Vercel** (`cham-store-os` و پروژهٔ Viking): Settings ← Git ← اتصال به `MegaSkillClaude`، و در Build & Deployment مقدار **Root Directory** را نام پوشه بگذار (`fjcod` یا `viking-team`).
2. **BISON** (Vercel `bison.brandbook.site.2026`): همان کار مرحلهٔ ۱ با Root Directory = `bison-brand-book`. بعد GitHub Pages مخزن قدیمی را خاموش کن تا فقط یک نسخهٔ زنده بماند.
3. وقتی هر سه از اینجا منتشر شدند، مخزن‌های قدیمی (`FJCod`، `viking-experience-command`، `bison-brand-book`، `porya-omni-llm-orchestrator`، `Viking`) را **Archive** کن. حذفشان نکن.

## بررسی سلامت و روال مشارکت

`bash scripts/repo_health_check.sh` بررسی سبک و بدون نصب وابستگی است؛ شکست‌ها را
با خروجی غیرصفر گزارش می‌دهد و جایگزین تست‌ها و بیلدهای کامل CI نیست.
تنظیمات نمونه در [`.env.example`](.env.example) است؛ مقادیر واقعی را وارد Git نکنید.
[روال مدیریت پروژه و تست‌ها](.github/PROJECT_MANAGEMENT.md)،
[چک‌لیست انتشار](.github/RELEASE_CHECKLIST.md) و
[پیشنهاد نقشهٔ راه ۹۰روزه](docs/ROADMAP_90D.md) را ببینید.

## امنیت و ممیزی (نسخهٔ ۲۰۲۶.۱۱.۰)

هر یافتهٔ ممیزی به یک گیتِ اجراشدنی تبدیل شده است، نه یک ادعا در سند:

| گیت | ابزار | کجا اجرا می‌شود |
| --- | --- | --- |
| قرارداد ممیزی (پین اکشن‌ها، هدرها، پرووننس، ممنوعیت `curl` به شل) | `python3 -m unittest tests.test_audit_contract` | pre-commit، `repo_health_check.sh`، CI |
| اسکن راز | gitleaks (تاریخ کامل) + `detect-secrets` با `.secrets.baseline` | `security.yml`، pre-commit |
| تحلیل ایستا | Semgrep با قواعد پروژه در `.semgrep/rules.yml` + قواعد رجیستری | `security.yml` |
| سخت‌سازی ورک‌فلوها | `zizmor` (persona: auditor) | `security.yml`، محلی |
| آسیب‌پذیری وابستگی‌ها | `npm audit` روی lockfileهای متعهدشده | `security.yml` |
| SBOM + پرووننس مهارت‌ها | `scripts/audit/make_sbom.mjs`، `scripts/audit/skill_provenance.py` | CI + هلث‌چک |

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install semgrep bandit detect-secrets zizmor
bash scripts/audit/run_scans.sh          # همهٔ گیت‌ها + خروجی در docs/audit/
```

* گزارش کامل اصلاحات: [`docs/AUDIT_REMEDIATION_2026-11-04.md`](docs/AUDIT_REMEDIATION_2026-11-04.md)
* سیاست گزارش آسیب‌پذیری: [`SECURITY.md`](SECURITY.md)
* مجوز و متون شخص ثالث: [`LICENSE`](LICENSE)، [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)
