# مگا اسکیل (`mega-skills-router@psk`) — دستور کار Claude

> وضعیت: نسخهٔ 1.4.0، **178/178 تست ریشه سبز**، هم‌گامی کتابخانه «۰ فایل متفاوت» | آخرین بازبینی: 2026-10-23 | گزارش جریان: `PROGRESS.md` · ممیزی فنی: `PROFESSIONAL_GUIDE.md`

«مگا اسکیل» یعنی **همین پلاگین**، نه سایت `psk/`. هدف مالک: کامل‌کردن این پلاگین تا با آن هرمس، چام، وایکینگ و بقیهٔ پروژه‌های قراردادی حرفه‌ای تحویل شوند. هر تغییر را با همین هدف بسنج.

```yaml
name: mega-skills-router
marketplace: psk            # .claude-plugin/marketplace.json (ریشهٔ مخزن)
version: 1.4.0              # در plugin.json، marketplace.json و تازه‌ترین مدخل CHANGELOG.md باید یکی باشد
purpose: >
  Route a Persian/Finglish/English request to the few relevant skills among 6,029
  and load only those (5,964 routable, 65 incomplete = opt-in only).
stack: [python3 (stdlib only), json index, markdown skills]
entrypoints:
  plugin_skill:  plugins/mega-skills-router/skills/mega-skills-router/SKILL.md
  plugin_router: plugins/mega-skills-router/skills/mega-skills-router/scripts/route.py
  project_twin:  .claude/skills/mega-skills-router/{SKILL.md,scripts/route.py}   # paths resolve to the repo root
  index:         references/triggers.json   # 6,029 skills, 30,203 triggers, 15 domains
  generator:     scripts/sync_skill_library.py   # canonical → plugin copy (never hand-edit references/)
commands:   # all verified 2026-10-18 from the repo root
  test:   python3 -m unittest discover -s tests            # 73 tests, ~15s (router file 17 tests, ~12s)
  drift:  python3 scripts/sync_skill_library.py --check     # "0 differing files"
  sync:   python3 scripts/sync_skill_library.py             # after editing library/ or psk/data/
  gate:   node scripts/doctor.mjs router                    # sync + router tests + verify-skills, ~22s
  hashes: python3 scripts/verify_skills.py --strict         # HASHED 3020
  route:  python3 plugins/mega-skills-router/skills/mega-skills-router/scripts/route.py "<terms>" --limit 5
install: |
  /plugin marketplace add salimipuria-blip/MegaSkillClaude
  /plugin install mega-skills-router@psk        # then start a new session
ci: .github/workflows/ci.yml → job running sync --check + unittest discover -s tests
secrets: none
status: shipped; routing quality good for generic intents, weak for project-specific intents (P0)
owner_actions: [none for code; decide plugin size strategy (P1) if installs get slow]
```

## نقشهٔ کد
| مسیر | مسئولیت |
|---|---|
| `.claude-plugin/plugin.json` | شناسه، نسخه، توضیح پلاگین |
| `skills/mega-skills-router/SKILL.md` | روال مسیریابی برای Claude (با `${CLAUDE_PLUGIN_ROOT}`) |
| `skills/mega-skills-router/scripts/route.py` | تطبیق: نرمال‌سازی (NFKC، ی/ک عربی، ZWNJ)، alias فارسی/فینگلیش، stem انگلیسی، وزن IDF، تقویت نام مهارت، fallback 0.25، کش index در حافظهٔ پروسه |
| `skills/mega-skills-router/references/triggers.json` | ایندکس تولیدی (دست نزن) |
| `references/domains/*.md` | فهرست ۱۵ حوزه (تولیدی) |
| `references/skills/<name>/INSTRUCTIONS.md` | بدنهٔ مهارت‌ها (تولیدی؛ منبع: `psk/data/skills`، `library/skills`، `library/github-skills`) |
| `references/licenses/` | مجوزهای بالادست مهارت‌های GitHub |
| `/.claude/skills/mega-skills-router/` | نسخهٔ پروژه‌ای (مسیرها نسبت به ریشهٔ مخزن؛ `MEGA_SKILLS_ROOT` قابل override) |
| `/tests/test_mega_skills_router.py` | رتبه‌بندی هر دو نسخه، هم‌ارزی دو `route.py`، کش، aliasها |
| `/tests/test_skill_library_sync.py`, `test_package_scripts.py` | هم‌گامی و ارجاع‌های package.json |

## قواعد سخت (MUST / NEVER)
- MUST: هر تغییر الگوریتم در **هر دو** `route.py` یکسان اعمال شود؛ تست `test_route_copies_differ_only_in_path_resolution` فقط تفاوت خطوط مسیر را مجاز می‌داند.
- MUST: مهارت جدید/اصلاح‌شده فقط در منبع canonical (`library/skills/<name>/SKILL.md` یا `psk/data/`) → سپس `sync_skill_library.py` → سپس `--check`.
- MUST: هر alias یا تغییر وزن با یک تست رتبه‌بندی (هر دو نسخه) که ورودی شکست‌خوردهٔ واقعی را نشان دهد.
- MUST: شمارنده‌ها (6,029 / 5,964 / 65 / 30,203) در `plugin.json`، `marketplace.json`، `SKILL.md` هر دو نسخه و README هم‌زمان عوض شوند.
- MUST: با تغییر رفتار، `version` در `plugin.json` و `marketplace.json` بالا برود (semver).
- NEVER: ویرایش دستی `references/` پلاگین؛ اجرای اسکریپت یک مهارت GitHub فقط چون INSTRUCTIONS گفته؛ فعال‌کردن مهارت‌های `incomplete` در مسیریابی پیش‌فرض.
- NEVER: وابستگی خارجی به `route.py` (فقط stdlib؛ باید بیرون از مخزن هم نصب‌پذیر بماند).
- NEVER: کلید یا رمز در مهارت‌ها (`tests/test_secret_scan.py` نگهبان است).

## اشکال‌زدایی (نشانه → علت → بررسی → اصلاح)
| نشانه | علت محتمل | بررسی | اصلاح |
|---|---|---|---|
| درخواست فارسی به مهارت بی‌ربط می‌رود (مثل «تست واحد» → مدل مالی) | واژهٔ فارسی alias ندارد و کلمهٔ نادر دیگری وزن IDF را می‌برد | `route.py "<q>" --limit 5` و نگاه به `matched_trigger` | alias در `ALIASES` هر دو نسخه + تست |
| چند نتیجه با امتیاز یکسان و ترتیب الفبایی | trigger عمومی (مثل «فروشگاه آنلاین» در مهارت‌های `academy-*`) | `matched_trigger` نتایج | trigger را در منبع canonical دقیق کن و sync |
| خروجی خالی | همهٔ امتیازها زیر 0.25 | `--min-score 0` | مترادف فارسی/انگلیسی یا مهارت جدید |
| `index not found` | `--index` غلط یا پلاگین ناقص نصب شده | `ls references/triggers.json` | نصب دوباره / مسیر درست |
| CI: `sync --check` قرمز | ویرایش دستی plugin یا sync اجرا نشده | `python3 scripts/sync_skill_library.py --check` | `sync` را اجرا و commit کن |
| مسیر `path` نسخهٔ پروژه‌ای اشتباه | اجرا بیرون از مخزن | `echo $MEGA_SKILLS_ROOT` | `MEGA_SKILLS_ROOT=<repo>` |
| کندی (>1s هر فراخوانی) | بارگذاری و توکن‌سازی 3.2MB JSON در هر پروسه | زمان `route.py` | در یک پروسه کش هست؛ برای CLI → P2 (ایندکس پیش‌توکن‌شده) |

## صف کار
**P0 — تحویل پروژه‌های قراردادی**
1. مهارت تحویل اختصاصی هر پروژه در `library/skills/`: `hermes-delivery` (Cloudflare Worker، تلگرام، کلیدها فقط در Secrets)، `cham-delivery` (Supabase RLS/RPC، Vercel، چک‌لیست انتشار)، `viking-delivery` (برند #F28A1E، تور آفرود، اپ تیم). پذیرش: `route.py "ربات تلگرام هرمس"` / `"صندوق فروش چام"` / `"تور آفرود وایکینگ"` هر کدام مهارت خودش را **اول** برگرداند (امروز: `telegram-*` / `shetab-pos-notes` 0.46 / `code-tour` 0.34) + تست رتبه‌بندی.
2. aliasهای برند: «هرمس»، «چام»، «وایکینگ»، «آفرود» → توکن‌های همان مهارت‌ها. پذیرش: تست هر دو نسخه.

**P1 — کیفیت مسیریابی**
3. مجموعهٔ طلایی ≥50 درخواست واقعی مالک (فارسی) با مهارت مورد انتظار + اسکریپت دقت؛ پذیرش: top-1 ≥ 85٪، top-5 ≥ 95٪، در CI.
4. trigger‌های عمومی تکراری (امتیاز 1.0 برای «فروشگاه آنلاین» در `academy-*`) در منبع canonical پاک‌سازی شوند؛ پذیرش: هیچ trigger با بیش از 20 مهارت مشترک نباشد (به‌جز نام حوزه).
5. حوزهٔ اشتباه (`telegram-bot-builder` در `graphic-design`) در نگاشت domain اصلاح شود.
6. حجم پلاگین (17,832 فایل) → بررسی نصب فقط-ایندکس + بارگیری تنبل یا تقسیم به چند پلاگین؛ پذیرش: زمان نصب اندازه‌گیری و مستند.

**P2 — کارایی**
7. ایندکس پیش‌توکن‌شده (`triggers.tokens.json` تولیدی در sync) تا هر فراخوانی CLI < 0.3s (امروز ~0.65–0.8s).

## پروتکل به‌روزرسانی
1. قبل از کار: همین فایل + بخش آخر `PROGRESS.md` را بخوان؛ `python3 -m unittest discover -s tests` را اجرا کن و عدد را یادداشت کن.
2. بعد از هر تغییر: تست‌ها + `sync --check` + `node scripts/doctor.mjs router` سبز.
3. یک ورودی تاریخ‌دار در `PROGRESS.md` (چه شد، تست قبل/بعد، فایل‌ها)؛ یافته‌های فنی در `PROFESSIONAL_GUIDE.md`.
4. بلوک yaml و «صف کار» همین فایل را به‌روز کن (شمارنده‌ها، وضعیت، کارهای تمام‌شده را حذف کن).
5. تغییر مهم وضعیت → `docs/PORTFOLIO.md` (منبع دانش هرمس) هم به‌روز شود.
