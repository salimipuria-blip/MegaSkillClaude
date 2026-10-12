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
| `hermes/` | ایجنت هرمس ۲۴/۷ روی اوراکل رایگان + تلگرام | اسکریپت bash | `bash -n setup.sh` | سرور اوراکل (Always Free) |
| `orchestrator/` | Omni LLM Orchestrator (تاریخی) | توابع Supabase Edge + پایتون | `python scripts/audit/check_repository_contract.py` و pytest | Supabase |
| `.claude/skills/mega-skills-router/`، `plugins/`، `library/` | مسیریاب و کتابخانهٔ مهارت‌ها | پایتون | `python -m unittest discover -s tests` (از ریشه) | — |
| `brands/viking-offroad/` | استیکرها و دارایی‌های برند وایکینگ آفرود | PNG + سورس | — | — |

وضعیت دقیق هر پروژه و کارهای بعدی: [ROADMAP.md](ROADMAP.md).

## وصل کردن سایت‌های زنده به این مخزن

`fjcod/`، `viking-team/` و `bison-brand-book/` هنوز از مخزن‌های قدیمی خودشان منتشر می‌شوند. تا وقتی این اتصال عوض نشود، تغییرات اینجا روی آن سایت‌ها نمی‌رود.

1. **Vercel** (`cham-store-os` و پروژهٔ Viking): Settings ← Git ← اتصال به `MegaSkillClaude`، و در Build & Deployment مقدار **Root Directory** را نام پوشه بگذار (`fjcod` یا `viking-team`).
2. **BISON** (Vercel `bison.brandbook.site.2026`): همان کار مرحلهٔ ۱ با Root Directory = `bison-brand-book`. بعد GitHub Pages مخزن قدیمی را خاموش کن تا فقط یک نسخهٔ زنده بماند.
3. وقتی هر سه از اینجا منتشر شدند، مخزن‌های قدیمی (`FJCod`، `viking-experience-command`، `bison-brand-book`، `porya-omni-llm-orchestrator`، `Viking`) را **Archive** کن. حذفشان نکن.
