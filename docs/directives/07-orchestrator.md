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
