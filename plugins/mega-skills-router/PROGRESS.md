# مسیریاب و کتابخانهٔ مهارت‌ها — دفتر جریان پروژه

> توضیح زندهٔ پروژه؛ هر دور کاری همین‌جا اضافه می‌شود. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴**.

## ۱) پروژه در یک نگاه
- **سه نمای یک چیز:** `.claude/skills/mega-skills-router/` (منبع canonical برای Claude Code)،
  `plugins/mega-skills-router/` (پلاگین قابل‌نصب)، `library/` (کتابخانهٔ مهارت‌های گیت‌هابی)
- **ابزارها:** `scripts/sync_skill_library.py` (هم‌گام‌سازی + `--check`)،
  `scripts/verify_skills.py` (هش SHA-256)، `scripts/repo_health_check.sh`
- **مصرف‌کنندهٔ دیگر:** `mobile/build-index.py` از `triggers.json` همین مسیریاب ایندکس می‌سازد

## ۲) دستور دقیق این پروژه
```bash
python3 scripts/sync_skill_library.py --check   # از ریشه: صفر فایل متفاوت؟
python3 -m unittest discover -s tests -p "test_*.py"
python3 scripts/verify_skills.py --strict       # گزارشی
node scripts/doctor.mjs router                  # هر سه با هم
```

## ۳) وضعیت تأییدشده (۲۰۲۶-۱۰-۱۴)
| بررسی | نتیجه |
|---|---|
| `sync_skill_library.py --check` | ✅ «۰ فایل متفاوت» — سه نما هم‌گام‌اند |
| تست‌های ریشه (شامل مسیریاب) | ✅ **۴۹/۴۹** (یکی از آن‌ها: idempotent بودن تولید و دست‌نخورده‌ماندن فایل‌های ناشناخته) |
| `verify_skills.py` | ✅ اجرا شد (گزارشی) |
| ارجاع‌های شکسته در پلاگین | ✅ هیچ (اسکریپت audit مسیرها را بررسی کرد؛ تک‌موردهای `library/github-skills/archify/package.json`
  به `library/github-skills/scripts/*.mjs` ارجاع می‌دهند که در این چک‌اوت نیست — پایین را ببینید) |

## ۴) این دور چه دیده شد
- **یافتهٔ نیازمند پیگیری (نه خطای فعلی):** `library/github-skills/archify/package.json` هشت اسکریپت
  (`test`، `build:*`، `generate:viewer`، `check:release-identity`…) را به
  `library/github-skills/scripts/*.mjs` وصل می‌کند که در این مخزن وجود ندارند. اگر آن پکیج
  هیچ‌وقت اجرا نشود مشکلی نیست، ولی `npm test` داخلش قطعاً شکست می‌خورد. دو راه:
  (الف) اضافه‌کردن آن اسکریپت‌ها، (ب) تبدیل `archify` به «منبع فقط». تا تصمیم، در CI اجرا نمی‌شود.
- هم‌گامی سه‌نمای مهارت‌ها تأیید شد؛ هیچ drift نیست.

## ۵) کارهای باز / پیشنهاد بعدی
- [ ] تعیین تکلیف `archify` (بند ۴) و افزودن یک تست سبک که «هر اسکریپت package.json به فایل موجود اشاره کند»
      برای همهٔ پکیج‌های `library/` و `plugins/` — همان چیزی که این دور دستی پیدا شد.
- [ ] افزودن `verify_skills.py --strict` به‌عنوان گیت (نه گزارش) اگر نرخ drift صفر بماند.
- [ ] مستندکردن این قاعده: تغییر مهارت‌ها فقط از منبع canonical و بعد
      `python3 scripts/sync_skill_library.py` (هرگز ویرایش دستی پلاگین).

## ۶) لاگ جریان (فقط اضافه می‌شود)
- **۲۰۲۶-۱۰-۱۴** — تأیید هم‌گامی (۰ فایل متفاوت)، ۴۹ تست ریشه سبز، شناسایی ارجاع‌های ناقص
  `archify` به‌عنوان بند باز.
