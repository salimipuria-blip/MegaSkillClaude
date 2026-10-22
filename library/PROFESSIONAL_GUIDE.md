# Professional Guide — library (ممیزی فنی)

> دستور کار اصلی: [`CLAUDE.md`](CLAUDE.md). این فایل گزارش تاریخ‌دار ممیزی‌هاست؛ هر نوبت یک بخش تازه بالای قبلی اضافه کن.

## ممیزی 2026-10-22

### بررسی‌های اجراشده (از ریشهٔ مخزن)
| بررسی | نتیجه |
|---|---|
| `python3 scripts/check_skill_links.py --verbose` | ✅ `unflagged: []` · ۳٬۰۱۱ مهارت · ۶٬۰۸۰ لینک نسبی: ۲٬۹۲۵ موجود، ۲٬۸۷۱ بیرونی، ۲۶ placeholder، ۱۹۰ بیرونِ پوشه، ۳۶ داخلِ بلوکِ کدِ بسته، ۲ توجیهِ بررسی‌شده، **۳۰ لینک مرده / ۲۸ فایلِ متمایز** — همه پرچم‌دار یا توجیه‌شده |
| `python3 scripts/sync_skill_library.py --check` | ✅ 0 differing files (پس از پرچم‌گذاریِ ۳ مهارت و بازتولید) |
| `python3 -m unittest tests.test_skill_link_audit` | ✅ ۱۳/۱۳ |
| `python3 -m unittest tests.test_github_skill_provenance` | ✅ ۱۰/۱۰ (نام‌گذاری `mp-*` + `_licenses`) |
| `python3 -m unittest tests.test_plugin_versioning` | ✅ ۷/۷ |
| `python3 -m unittest discover -s tests -p "test_*.py"` | ✅ **Ran 152 tests — OK** |
| `python3 mobile/build-index.py --check` | ✅ ۵٬۷۴۵ مهارت · `mega-mobile-v1-db2702efc8f36526` · ۲٬۲۴۲٬۶۳۵B خام / ۴۰۹٬۶۱۷B gzip |
| `python3 scripts/scan_third_party_skills.py --check` | ✅ report is current (۳٬۰۱۱ فایل، ۱۶۶ یافته) |
| جهش‌ها | ✅ ۵/۵ قرمز روی ممیزیِ لینک (بی‌پرچم‌کردنِ `wizard`، کوتاه‌کردنِ `missing_files`، حذفِ خطِ `INCOMPLETE:`، جابه‌جاییِ سنجاقِ توجیه، بازگشتِ فایلِ مفقود) + ۴/۴ روی نام‌گذاری/مجوز + ۴/۴ روی نسخه/CHANGELOG؛ بازگردانی با تأییدِ SHA-256 |

### یافته‌ها و اصلاح‌ها
1. **۳ مهارتِ بی‌پرچم با فایلِ وعده‌داده‌شدهٔ مفقود** ⇒ `incomplete: true` + `missing_files` در `INDEX.json` و خطِ `INCOMPLETE:` در `SOURCE.md`: `git-guardrails-claude-code` (`scripts/block-dangerous-git.sh`)، `qdrant-search-quality` (`diagnosis/SKILL.md`, `search-strategies/SKILL.md`)، `wizard` (`template.sh`). فایل‌ها از مبدأ **آورده نشدند**: یکی‌شان اسکریپتِ shellِ شخصِ ثالث است و قاعدهٔ همین پوشه اجرای اسکریپت‌های وارداتی را ممنوع کرده؛ آوردنِ فایل تصمیمِ مالک است (در `owner_actions`).
2. **۶۴ لینکِ مردهٔ باقی‌مانده نقص نیستند** و هر دسته با قاعدهٔ مستند جدا شد: ۳۶ مورد داخلِ بلوکِ کدِ **بسته** (قالبِ خروجی؛ مثلِ «Generated SKILL.md» در `microsoft-skill-creator` یا فهرستِ `llms.txt` در `create-llms`)، ۲۶ placeholder (`{slug}`، `<type>`، `src`)، ۱۹۰ ارجاعِ بیرونِ پوشه (`../../DESIGN.md`) که در چیدمانِ تختِ portable نمی‌توانند وجود داشته باشند. بلوکِ کدِ **باز** fail-closed است: امروز صفر مورد، ولی اگر فایلی fence نابسته داشته باشد لینکش پروزا حساب می‌شود و گزارش می‌گیرد.
3. **قراردادِ دادهٔ canonical سالم است**: هر ۲۸۴ پرچم در `INDEX.json` و `SOURCE.md` و ایندکسِ روتر یکی‌اند؛ هیچ `missing_files` ثبت‌شده‌ای امروز روی دیسک وجود ندارد (پرچمِ کهنه صفر)؛ تنها اختلافِ ظاهری، قراردادِ خلاصه‌سازیِ فهرستِ بلند با `…` در `SOURCE.md` بود که در ممیزی به‌صورتِ «پیشوندِ نویسه‌ای» سنجیده می‌شود.
4. **`_licenses/`** ⇒ ۴۶ فایل، هر ۲۹ مخزن پوشش داده شده (۵ مخزن چند LICENSE مسیرمحور دارند: `sickn33/agentic-awesome-skills` ۱۱، `github/awesome-copilot` ۴، `alirezarezvani/claude-skills` ۳، `K-Dense-AI/scientific-agent-skills` ۲، `affaan-m/ECC` ۲)؛ ۴۵ تایِ ۴۶ ارجاع‌شده و تنها فایلِ بی‌ارجاع `sickn33__agentic-awesome-skills__skills_remote-gpu-trainer_LICENSE` است (مسیرِ `skills/remote-gpu-trainer` در فیلترِ انتخاب حذف شد). **حذف نشد**؛ دلیلِ نگه‌داری در README نوشته و با تست قفل شد.
5. **نام‌گذاری `mp-*`** ⇒ هر ۱۰ مهارت از `mattpocock/skills`؛ هر ۱۰ نامِ بدونِ پیشوند از مخزنِ دیگری (`sickn33/agentic-awesome-skills`, `alirezarezvani/claude-skills`, `phuryn/pm-skills`) در ایندکس هست ⇒ پیشوند ضروری است، نه تزیینی. نامِ پوشه canonical ماند و frontmatter بالادستی دست نخورد.

### NOT RUN
· آوردنِ فایلِ همراه از مخزنِ مبدأ (نیازمندِ تصمیمِ مالک و دسترسی به `raw.githubusercontent.com` که در allowlist این محیط نیست) · حذفِ noticeِ بی‌ارجاع یا کپیِ یتیمِ `_licenses` در درختِ پلاگین · اسکنِ audit با دامنهٔ `all` در CI (۳۱ ثانیه؛ فقط لوکال).

## ممیزی 2026-10-18

### بررسی‌های اجراشده (از ریشهٔ مخزن)
| بررسی | نتیجه |
|---|---|
| `bash -n library/install.sh` | ✅ |
| نصب آزمایشی در پوشهٔ موقت (با و بدون مهارت قبلی، از cwd دیگر) | ✅ ۱۸ مهارت؛ پیام شمارش درست |
| `python3 scripts/sync_skill_library.py --check` | ✅ 0 differing files |
| `python3 -m unittest tests.test_skill_library_sync tests.test_project_documentation` | ✅ 9/9 |
| `python3 scripts/verify_skills.py` | ✅ 3020 SKILL.md hashed |
| frontmatter ‏`library/skills` (۱۸) | ✅ همه `name`/`description` دارند؛ نام = پوشه؛ لینک مرده: ۰ |
| frontmatter ‏`library/github-skills` (۳٬۰۱۱) | ✅ همه معتبر؛ ۱۰ مورد `mp-*` نام بدون پیشوند (عمدی) |
| لینک‌های محلی در github skills | ⚠️ ۱۱۴ مهارت لینک مرده دارند؛ ۴۷ پرچم `incomplete` دارند، **۶۷ ندارند** |
| `prompt-master` (روال عکس) | ✅ موجود؛ بخش «Image AI — Generation/Reference Editing» در خط ~۳۰۰ |

### اصلاحات اعمال‌شده
1. **`install.sh`**: پیام «تعداد» کل پوشهٔ مقصد را می‌شمرد (با مهارت‌های قبلی کاربر)، نه مهارت‌های نصب‌شده؛ مسیر منبع نسبی بود. اکنون `set -euo pipefail`، مسیر مطلق منبع، و شمارش جدای «این بسته» و «کل مقصد».
2. **`README.md`**: بخش فارسی شمارش کهنه داشت (۶٬۰۱۹ / ۵٬۷۳۸ / ۸) → ۶٬۰۲۹ / ۵٬۷۴۸ / ۱۸ طبق `triggers.json`؛ فهرست مهارت‌ها ۸ تا از ۱۸ را نشان می‌داد → ۱۰ مهارت `pro-*` اضافه شد.
3. **ادعای «۵۰ مخزن»** در `README.md` و `github-skills/README.md` با `INDEX.json` نمی‌خواند (۲۹ `repo` یکتا) → اصلاح شد، با توضیح ۴۶ فایل مجوز.

### باز (جزئیات و معیار پذیرش در `CLAUDE.md` › صف کار)
- P1: ۶۷ مهارت بدون پرچم ناقص با لینک مرده.
- P2: سیاست نام `mp-*`؛ فایل‌های مجوز اضافه.

## ممیزی 2026-10-15
- راهنمای اولیه؛ گیت‌ها: `tests/test_skill_library_sync.py`، `bash library/install.sh`.
