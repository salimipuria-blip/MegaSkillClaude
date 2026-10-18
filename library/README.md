# MEGA SKILLS 3000 Library

Shared assets of the MEGA SKILLS 3000 project, kept in one place. Backend/frontend plan for every project: [`ROADMAP.md`](../ROADMAP.md).

| Part | Path | Status |
|---|---|---|
| MEGA SKILLS 3000 site + engine | `psk/` | live on Vercel (project `psk-3000`, root `psk`) |
| MEGA SKILLS 3000 portfolio (Puria Salimi, Content Director) | `psk/public/puria/` | served at `/puria/`; static port of the original React/Vite source, same copy, photo (SHA-256 identical) and scroll choreography |
| About page with founder section | `psk/public/about.html` | served at `/about` |
| Curated project skills (18) | `library/skills/` | install: `bash library/install.sh [project-path]` |
| Mega Skills Router plugin | `plugins/mega-skills-router/` (marketplace `psk` in `.claude-plugin/`) | installable anywhere: `/plugin marketplace add salimipuria-blip/MegaSkillClaude` then `/plugin install mega-skills-router@psk`; self-contained copy of all 6,029 skills |
| Mega Skills Router | `.claude/skills/mega-skills-router/` | the only auto-loaded skill: routes each request through 15 domain indexes and 30,203 triggers to relevant skills among 6,029 (3,000 core + 18 project + 3,011 GitHub); 5,748 are routable by default and 281 incomplete entries are excluded |
| GitHub skills (3,011, MIT) | `library/github-skills/` | current canonical index spanning 29 public repositories (count from `INDEX.json`); available through the router; see its README |

Original portfolio hosting: https://purias-salimi.salimipuria.chatgpt.site/

## Skills in `library/skills/`
- `brand-voice-builder`
- `business-scaling-playbook`
- `instagram-content-generator`
- `marketing-campaign-planner`
- `sales-copy-writer`
- `visual-design-brief`
- `online-vscode-mobile-coding`
- `hermes-autonomous-self-improvement`
- Pro (کدنویسی و طراحی؛ هرمس در حالت کدنویسی از این‌ها استفاده می‌کند): `pro-backend-api-design`، `pro-brand-identity`، `pro-code-review`، `pro-debugging`، `pro-frontend-engineering`، `pro-git-workflow`، `pro-security-review`، `pro-testing-strategy`، `pro-ui-design-system`، `pro-ux-design`

## Not stored in this public repository
- **Persian font collection (970 files):** the files come from a download site and include commercial typefaces whose licenses do not allow public redistribution. The site uses openly licensed fonts (IBM Plex Sans Arabic, Inter, Bodoni Moda via Google Fonts) instead.
- **Personal system prompt (`system-prompt-structured.json`):** contains private business details; kept out of the public repo.


## همگام‌سازی و مهارت‌های ناقص

۶٬۰۲۹ مهارت نگه‌داری می‌شوند؛ ۲۸۱ مورد ناقص از مسیریابی پیش‌فرض خارج‌اند و ۵٬۷۴۸ مورد فعال‌اند.
عدد فعلی GitHub skills برابر ۳٬۰۱۱ و بستهٔ مهارت‌های پروژه ۱۸ مورد است؛ منبع شمارشِ دقیق `INDEX.json` و نمایهٔ canonical router است.
منابع اصلی در `library/` و `psk/data/` هستند. بعد از تغییرشان، از ریشه
`python3 scripts/sync_skill_library.py` را اجرا کنید. CI با `--check` ناهماهنگی نسخهٔ قابل‌نصب،
نمایه‌ها، فایل‌های همراه و مجوزها را پیدا می‌کند؛ کپی‌های پلاگین را جداگانه ویرایش نکنید.
