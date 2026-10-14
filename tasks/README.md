# اجرای حرفه‌ای ۱۰۰ تسک هرمس

## اصل‌ها (غیرقابل مذاکره)

1. **معماری واقعی اول:** هرمس‌لایت Cloudflare Worker است و هرمس کامل نصب‌کنندهٔ تک‌فایلی Oracle. تسکی که برای این معماری معنا ندارد (Docker runtime، BullMQ، Supabase، SQLite دوم) با دلیل در manifest علامت `rejected-*`/`deferred-*` خورده — برایش PR اسکلتی ساخته نمی‌شود.
2. **Skeleton PR ممنوع است.** PR فقط برای پیاده‌سازی واقعیِ تست‌شده باز می‌شود.
3. **Auto-merge ممنوع است.** مرج = CI سبز + review انسانی.
4. **راز هرگز** در argv، لاگ، manifest یا PR نمی‌آید؛ non-interactive فقط از env می‌خواند.

## فایل‌ها

- `hermes_tasks.json` — manifest نسخهٔ `hermes-tasks/v2`: هر تسک `wave` (W0 تا W3)، `disposition`، فایل‌های واقعی repo، معیار پذیرش و برچسب دارد.
- `apply_tasks.py` — ابزار **برنامه‌ریزی و اعتبارسنجی** (نه تولید انبوه PR). پیش‌فرض dry-run و فقط‌خواندنی است.
- `apply_hermes_tasks.py` — نسخهٔ پاک‌سازی‌شدهٔ همان قرارداد برای snippetهای قدیمی: موجودیت‌های HTML (`&amp;`) و آلودگی Markdown-link در مسیر فایل‌ها (`hermes/[setup.sh](http://setup.sh)`) را sanitize می‌کند، هر دو schema (`legacy/v1` و `hermes-tasks/v2`) را می‌پذیرد و حالت‌های `--apply`/`--auto-merge` را با خطای صریح رد می‌کند. اعتبارسنجی روی manifest کامل (قبل از فیلتر `--only`) انجام می‌شود.
- `hermes_tasks.legacy.sample.json` — نمونهٔ تمیزشدهٔ snippet دوبخشی قدیمی (`legacy/v1`) برای تست sanitize/validate.
- `.github/workflows/hermes-automation.yml` — اجرای دستی (workflow_dispatch) و فقط plan/validate با دسترسی read-only؛ هرگز فایل اسکلت، push یا merge نمی‌سازد.

## استفاده

```bash
python3 tasks/apply_tasks.py --manifest tasks/hermes_tasks.json --validate-only
python3 tasks/apply_tasks.py --manifest tasks/hermes_tasks.json --wave W0
python3 tasks/apply_tasks.py --manifest tasks/hermes_tasks.json --only 23,24

# ساخت PR فقط وقتی روی شاخهٔ همان تسک، پیاده‌سازی واقعی و commit‌شده داری:
python3 tasks/apply_tasks.py --manifest tasks/hermes_tasks.json --only 23 --apply-pr

# نسخهٔ sanitizeکننده (هر دو manifest؛ تست‌ها: tests/test_hermes_task_planner.py):
python3 tasks/apply_hermes_tasks.py --manifest tasks/hermes_tasks.json --validate-only
python3 tasks/apply_hermes_tasks.py --manifest tasks/hermes_tasks.legacy.sample.json --validate-only
python3 tasks/apply_hermes_tasks.py --manifest tasks/hermes_tasks.legacy.sample.json  # dry-run فقط‌خواندنی
```

## وضعیت موج W0 (همین PR)

پیاده‌سازی واقعی: #001–#005، #008، #009، #011–#013 (primitive + endpoint)، #016، #021–#025، #027/#079، #028، #045، #047، #049، #051، #064، #067، #071، #073، #085 (بخش setup)، #087–#089، #095، #098، #099 و موارد `existing-verified` (#007، #030–#032 جزئی، #034، #035، #044، #048).

تست‌ها: `bash hermes/tests/setup_validation.sh` (۱۹ بررسی)، `npm test --prefix hermes` (شامل `health.test.mjs`)، CI اختصاصی path-filtered در `.github/workflows/ci-hermes.yml`.

## ترتیب پیشنهادی ادامه

W1 (تست و تاب‌آوری): #019، #020، #026، #038، #052، #057، #063، #075، #077، #078، #086، #091 → W2 (عملیات): #006، #010، #033، #043، #054، #056، #059 تکمیلی، #062، #069، #070، #072، #081، #083، #093، #096، #097، #100 → W3 فقط با تصمیم محصول جداگانه.
