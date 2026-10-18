# Omni LLM Orchestrator (تاریخی) — دفتر جریان پروژه

> توضیح زندهٔ پروژه؛ هر دور کاری همین‌جا اضافه می‌شود. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۸**.

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
| `deno check` | ✅ `github-admin-gateway/index.ts` با Deno 2.9.6 و `--no-remote` بررسی شد |
| `deno test` | ✅ **۷/۷** روی `handler.test.mjs` با `--no-remote --no-prompt`؛ تست‌ها mock هستند و اثبات دسترسی live Supabase/GitHub نیستند |

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
- **۲۰۲۶-۱۰-۱۴ (گیت کامل monorepo)** — `node scripts/doctor.mjs orchestrator` با pytest نصب‌شده در venv موقت: قرارداد OK، **۱۶ pass/۳ skip**؛ `deno-gateway` به‌دلیل نبودن Deno محلی skip شد، نه fail. در CI، Deno نصب و گیت‌های gateway اجرا می‌شوند.
- **۲۰۲۶-۱۰-۱۴ (تأیید Deno)** — Deno 2.9.6 به‌طور موقت از بستهٔ npm در `/tmp` در دسترس شد؛ `deno check --no-remote` سبز و `deno test --no-remote --no-prompt .../handler.test.mjs` **۷/۷**. full doctor نیز پس از فراهم‌شدن `pytest` و Deno، contract/pytest/Deno check را بدون شکست اجرا کرد؛ ۳ skip مربوط به artifact تاریخی مهارت‌ها همچنان intentional است.

- **۲۰۲۶-۱۰-۱۴ (دور سراسری — رفع ناسازگاریِ «سبز کاذب/قرمز کاذب» در doctor)** — گامِ `pytest` این پروژه در هر محیطی که pytest نصب نباشد با `ModuleNotFoundError` **fail** می‌شد، در حالی که گامِ `deno-gateway` در نبودِ Deno به‌درستی skip می‌شد؛ یک ناسازگاری که باعث می‌شد «وضعیت مخزن» را با «نبود ابزار محلی» اشتباه بگیریم.
  - `scripts/doctor.mjs` گزینهٔ `needsModule` گرفت: اگر ماژولِ پایتون در دسترس نباشد، گام با وضعیت **skip** و پیامِ نصبِ دقیق (`python3 -m pip install --user pytest`) گزارش می‌شود. skip هرگز pass نیست و در خروجیِ نهاییِ doctor به‌طور جداگانه فهرست می‌شود.
  - اجرای شاهد در همین محیط: `node scripts/doctor.mjs orchestrator` → قرارداد مخزن **سبز**؛ pytest و deno-gateway به‌دلیل نبود ابزار **skip** (نه fail)، و در خروجی زیرِ «skipped (missing tool/deps)» فهرست شدند. در CI هر دو ابزار نصب‌اند (`setup-deno` و `pip install pytest`) و هر دو گام واقعاً اجرا می‌شوند.
  - **بند بازِ قدیمی همچنان باز است:** materialize کردنِ اسنپ‌شاتِ تاریخیِ مهارت‌ها (یا حذفِ مستندِ آن تست‌ها) تا ۳ اسکیپِ درونِ pytest به صفر برسد. این اسکیپ‌ها آگاهانه‌اند و نباید به تستِ جعلی تبدیل شوند.

- **۲۰۲۶-۱۰-۱۸ (ممیزی عمیق + دستور کار)** — `CLAUDE.md` پروژه (دستور کار دقیق با مشخصات yaml) نوشته و `PROFESSIONAL_GUIDE.md` به ممیزی تاریخ‌دار تبدیل شد. رفع‌ها: (۱) **SSRF** در `github-llm-verifier`: `https://[::ffff:127.0.0.1]/…` و metadata/NAT64/multicast به‌عنوان عمومی پذیرفته می‌شدند → گارد به `net.mjs` منتقل و بازنویسی شد + `net.test.mjs` (۴/۴) و اجرای آن از pytest؛ (۲) pytest از ریشهٔ monorepo `ImportError` می‌داد → `pythonpath = .` و مسیرهای مبتنی بر `__file__`؛ (۳) `skills/route.py` بدون registry traceback می‌داد → پیام روشن + تست؛ (۴) installer مسیرهای `/mnt/data` و کپی خراب `route.py` داشت → ورودی CLI. نتیجه: قرارداد OK، pytest **۲۱ pass / ۳ skip** (قبلاً ۱۶/۳)، node ۱۱/۱۱، deno check ۱۰/۱۰، deno test ۷/۷. باز (مالک): تصمیم دربارهٔ پروژهٔ زنده و redeploy؛ احراز نقش در ۹ تابع دیگر.

## Professional guide
دستور کار: `CLAUDE.md` · ممیزی فنی تاریخ‌دار: `PROFESSIONAL_GUIDE.md`. هر تغییر رفتار = به‌روزرسانی هر دو + یک خط در لاگ بالا.
