# Omni LLM Orchestrator (تاریخی) — دفتر جریان پروژه

> توضیح زندهٔ پروژه؛ هر دور کاری همین‌جا اضافه می‌شود. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴**.

## ۱) پروژه در یک نگاه
- **پوشه:** `orchestrator/` · **وضعیت راهبردی:** تاریخی — هم‌پوشانی با موتور MEGA SKILLS 3000 دارد
  و طبق نقشهٔ راه باید پس از تست قرارداد بازنشسته شود؛ فعلاً مخزن مهاجرت و مستندات می‌ماند.
- **فناوری:** ۱۰ تابع Supabase Edge (Deno) + ابزارهای پایتون + اسنپ‌شات قرارداد

## ۲) دستور دقیق این پروژه
```bash
node scripts/doctor.mjs orchestrator   # قرارداد + pytest (+ بررسی deno اگر نصب باشد)
```
معادل دستی:
```bash
cd orchestrator
python3 scripts/audit/check_repository_contract.py
python3 -m pytest -q -ra tests
# اگر deno نصب است:
deno check --no-remote supabase/functions/github-admin-gateway/index.ts
deno test --no-remote --no-prompt supabase/functions/github-admin-gateway/handler.test.mjs
```

## ۳) وضعیت تأییدشده (۲۰۲۶-۱۰-۱۴)
| بررسی | نتیجه |
|---|---|
| `check_repository_contract.py` | ✅ «repository contract: OK» |
| `pytest -q -ra tests` | ✅ **۱۶ pass، ۳ skip** |
| علت skip | اسنپ‌شات تاریخی مهارت‌های Mega Skills در این checkout materialize نشده
  (`skills/registry/BASELINE_ARTIFACTS.json`)؛ گیت سخت‌گیرانه: `--require-materialized-skills` |
| `deno check/test` | – در این محیط نصب نیست (در CI با `denoland/setup-deno@v2` اجرا می‌شود) |

## ۴) این دور چه دیده شد
- اسکیپ‌ها «مستند» و آگاهانه‌اند، نه پنهان: پیام skip مستقیماً می‌گوید کدام artifact لازم است و
  چه فلگ سخت‌گیرانه‌ای وجود دارد. این رفتار درست است و نباید به تست جعلی تبدیل شود.
- هیچ نقصی در قرارداد/تست‌های پایتون پیدا نشد.

## ۵) کارهای باز / پیشنهاد بعدی
- [ ] تصمیم راهبردی نقشهٔ راه: بازنشستگی توابع تکراری (`skill-router`، `free-llm-router`،
      `skill-orchestrator`) پس از تست قرارداد — موتور مسیریابی حالا در `psk/` است.
- [ ] Materialize کردن اسنپ‌شات مهارت‌ها (یا حذف این تست‌ها با ثبت دلیل) تا «۳ skip» به صفر برسد
      و `--require-materialized-skills` قابل استفاده شود.
- [ ] افزودن `deno` به تصویر توسعه (یا اسکریپت نصب) تا گیت Deno به‌صورت محلی هم اجرا شود.

## ۶) لاگ جریان (فقط اضافه می‌شود)
- **۲۰۲۶-۱۰-۱۴** — اجرای قرارداد و pytest (۱۶ pass/۳ skip مستند)؛ deno در محیط محلی نبود و
  در `scripts/doctor.mjs` به‌درستی skip شد.
