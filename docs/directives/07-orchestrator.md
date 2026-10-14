# 07 — Omni LLM Orchestrator (`orchestrator/`)

## مأموریت و مرزها
مخزن **تاریخی/مهاجرتی** موتورهای قدیمی Supabase (۱۰ تابع Edge) و مرجع audit. محصول زندهٔ فعلی نیست و نباید قابلیت محصولی جدید روی آن ساخته شود؛ مقصد نهایی: بازنشستگی توابع تکراری به نفع موتور `psk/` و ماندن این پوشه به‌عنوان مستند و مهاجرت. آن را «ایجنت خودکار کامل» معرفی نکن.

## وضعیت فعلی (شواهد: `orchestrator/README.md`, `docs/SECURITY_NOTES.md`)
- ✅ گارد Gateway سخت شده: اعتبارسنجی نشست واقعی از Supabase Auth و تطبیق UUID با `GITHUB_ADMIN_USER_IDS`؛ anon/metadata نقش نمی‌سازد؛ تنظیم ناقص → 503 fail-closed؛ تست مشترک Node+Deno سبز.
- ✅ قرارداد مخزن (`scripts/audit/check_repository_contract.py`) سبز؛ pytest: موفق + ۳ skip مستند فقط برای artifactهای تاریخی materialize‌نشده.
- ⚠️ تا وقتی allowlist و secretها روی محیط زنده تنظیم و تابع دوباره منتشر نشود، اصلاحات گیت از نسخهٔ زنده محافظت نمی‌کند.

## اجرا و تست
```bash
cd orchestrator
python scripts/audit/check_repository_contract.py
python -m pytest -q -ra tests                                   # skip تاریخیِ مستند پذیرفتنی است
python -m pytest -q --require-materialized-skills tests         # گیت سخت: بعد از materialize معتبر باید سبز باشد؛ الان عمداً قرمز است
node --test supabase/functions/github-admin-gateway/*.test.mjs   # + deno check/test در CI
```

## پروتکل دیباگ حرفه‌ای
- **401/403/503 در Gateway:** 503 یعنی پیکربندی ناقص (رفتار درست)؛ 401 نشست نامعتبر؛ 403 کاربر غیرمالک. ترتیب را با تست‌های mocked مشخص کن؛ هرگز برای رفع خطا allowlist را باز یا `verify_jwt` را خاموش نکن.
- **تست skip‌شده:** skip فقط وقتی کل checkout فاقد artifact تاریخی است مجاز است؛ نصب ناقص/خراب باید fail شود — skip را به «موفقیت نصب ۳۰۰۰ مهارت» ترجمه نکن.
- **تغییر SQL/اسکیما:** snapshot موجود مرجع تاریخی است نه migration قابل‌اعمال؛ migration جدید بدون بازبینی و بک‌آپ ممنوع.
- توکن GitHub و کلیدها فقط در Secret محیط اجرا؛ پاسخ‌های خطا نباید توکن یا بدنهٔ خصوصی upstream را برگردانند.

## گسترش (اولویت‌بندی)
- **P0:** تنظیم `GITHUB_ADMIN_USER_IDS` و secretها روی محیط زنده و redeploy تابع `github-admin-gateway`؛ تأیید با یک درخواست مالک/غیرمالک.
- **P1:** نقشهٔ بازنشستگی `skill-router`/`free-llm-router`/`skill-orchestrator` پس از اثبات پوشش معادل در `psk/` با تست قرارداد؛ انتقال مستندات مفید به `docs/`.
- **P2:** بایگانی نهایی پوشه به حالت فقط‌خواندنی (مستند + migration) و حذف مسیرهای deploy مرده از CI.

## Definition of Done
قرارداد مخزن + pytest سبز (skipها مستند)، Gateway در هر دو runtime سبز، هیچ قابلیت محصولی جدیدی اینجا اضافه نشده، وضعیت بازنشستگی در README به‌روز.

## پروندهٔ این دور (۲۰۲۶-۱۰-۱۴) — نبودِ ابزار ≠ شکستِ پروژه

تا این دور، گامِ `pytest` در هر محیط بدون pytest با `No module named pytest` و وضعیتِ **fail** بیرون می‌زد، در حالی که `deno-gateway` در نبودِ Deno به‌درستی **skip** می‌شد. پیامدِ عملی: «full doctor» در هر ماشینِ تازه قرمز می‌شد و این قرمزی با یک رگرسیونِ واقعی اشتباه گرفته می‌شد — همان خطای تشخیصی که در پزشکی به آن مثبتِ کاذب می‌گویند.

**رفع:** `scripts/doctor.mjs` گزینهٔ `needsModule` گرفت. نبودِ ماژولِ پایتون حالا skip با دستورِ نصب است:
```
– pytest   python module 'pytest' is missing; install: python3 -m pip install --user pytest
```
و در خروجیِ نهایی زیرِ `skipped (missing tool/deps)` فهرست می‌شود. **skip هرگز pass نیست** و خروجیِ کلِ doctor را سبز نمی‌کند؛ فقط از «شکست» جدا می‌شود.

**پروتکلِ دیباگِ این پروژه (تاریخی):**
1. اول `python3 scripts/audit/check_repository_contract.py` — سبزشدنِ قرارداد ارزان است و خیلی چیزها را جدا می‌کند.
2. برای pytest: `python3 -m pip install --user pytest` و بعد `python3 -m pytest -q -ra tests`. انتظار: **۱۶ pass + ۳ skip**.
3. آن ۳ اسکیپ **آگاهانه**اند: artifactِ تاریخیِ مهارت‌ها در این checkout materialize نشده. پیامِ skip دقیقاً می‌گوید کدام artifact لازم است و فلگِ سخت‌گیرانه (`--require-materialized-skills`) چیست. آن‌ها را با تستِ جعلی سبز نکن — این تنها موردی است که «skip» در این مخزن از روی عمد informational است.
4. Deno: `deno check --no-remote` و `deno test --no-remote --no-prompt`. `--no-remote` برای تعیین‌ناپذیریِ شبکه الزامی است.
5. در CI هر دو ابزار نصب‌اند، پس هیچ‌کدام از این گام‌ها آنجا skip نمی‌شوند؛ اگر در CI skip دیدی، تنظیمِ runner را بررسی کن، نه کد را.
