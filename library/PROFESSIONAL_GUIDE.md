# Professional Guide — library (ممیزی فنی)

> دستور کار اصلی: [`CLAUDE.md`](CLAUDE.md). این فایل گزارش تاریخ‌دار ممیزی‌هاست؛ هر نوبت یک بخش تازه بالای قبلی اضافه کن.

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
