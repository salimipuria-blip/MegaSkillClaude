# Professional Guide — lithos (ممیزی فنی)

> ممیزی تاریخ‌دار هر دور. دستور کار ثابت در `CLAUDE.md`؛ لاگ جریان در `PROGRESS.md`.
> آخرین ممیزی: **2026-10-18**.

## خط پایه و نتیجه
| بررسی | قبل | بعد |
|---|---|---|
| `npm test` | 9/9 | **16/16** (+۴ API، +۳ داشبورد) |
| `npm run build` | `dist/index.html` 10.07 kB (gzip 4.09) | 10.30 kB (gzip 4.23) |
| قرارداد SQL (`supabase/tests/run.sh`) | وجود نداشت | سبز؛ تست جهش: باز کردن RLS insights → شکست `non-owner read insights` |
| smoke مرورگر (Chromium، `dist/` سرو محلی) | — | `window.supabase.createClient` = function با SRI؛ صفحهٔ ورود نمایش داده شد |
| Supabase زنده | — | `aupkeramhsufnmhkbihl.supabase.co` رکورد DNS ندارد (دسترسی ناممکن) |
| Buffer API | — | `POST https://api.buffer.com` بدون توکن → 401 `UNAUTHENTICATED` (endpoint زنده؛ شکل داده تأییدنشده) |

## یافته‌ها (هر کدام با ورودی شکست‌دهنده)
1. **🔴 دروازهٔ مالک فقط در RLS بود، نه در API.** `validate()` هر نشست معتبر پروژهٔ Supabase را می‌پذیرفت. ورودی: حساب غیرمالک با `Authorization: Bearer <session>` → تماس Buffer با `BUFFER_API_KEY` مالک (مصرف سهمیه/نشت متادیتای خطا) و صدا زدن RPCها. **رفع:** `assertOwner()` با allowlist سمت سرور `LITHOS_OWNER_EMAILS` (حساس‌نبودن به حروف، fail closed) قبل از هر تماس؛ تست: غیرمالک → 403 و فقط `/auth/v1/user` صدا زده می‌شود.
2. **🟠 fetchهای بدون مهلت.** Buffer یا Supabase آویزان → تابع در ۳۰ ثانیه کشته می‌شد و `markError` هرگز اجرا نمی‌شد (منبع روی «connected» قدیمی می‌ماند). **رفع:** `AbortSignal.timeout(10000)` روی هر سه fetch؛ تست بررسی signal.
3. **🟠 قطعی Supabase به‌صورت «دوباره وارد شو» گزارش می‌شد.** ورودی: `fetch` پرتاب کند → 401. **رفع:** `HttpError(503, 'Supabase auth unreachable')`.
4. **🟠 supabase-js شناور (`@2`) بدون SRI** روی داشبورد خصوصی = هر انتشار CDN کد تازه اجرا می‌کرد. **رفع:** `@2.58.0/dist/umd/supabase.js` + `integrity=sha384-KX6Y…` (هش فایل با tarball رسمی npm بایت‌به‌بایت `cmp` شد) + `crossorigin`.
5. **🟡 شمارش لید با دانلود همهٔ idها.** `select('id')` → O(n) ردیف به مرورگر. **رفع:** `select('id',{count:'exact',head:true})` و `l.count`.
6. **🟡 `sync()` خطای شبکه را رها می‌کرد** (unhandled rejection، بی‌پیام برای مالک). **رفع:** try/catch و toast `Sync network error`.
7. **🔴 (مالک) اسکیما هرگز در git نبود** و پروژهٔ زنده در دسترس نیست → بدون این فایل بازسازی ممکن نبود. **رفع:** `supabase/schema.sql` بازسازی‌شده از قرارداد کد + تست owner-only. باید با پروژهٔ زنده diff شود.

## باز مانده (نیاز به مالک یا داده واقعی)
- Restore/بازسازی پروژهٔ Supabase؛ تنظیم `LITHOS_OWNER_EMAILS` در Vercel (تا آن موقع sync عمداً 403 می‌دهد).
- تأیید شکل پاسخ Buffer GraphQL با توکن واقعی.
- CSP و job Postgres در CI (پیشنهاد در `CLAUDE.md` → صف کار).

## پیشنهاد کارایی/معماری
- اسکریپت inline یک‌خطی است؛ تا وقتی تغییرات کوچک‌اند جداکردن ماژول توجیه ندارد. اگر نمودار روند اضافه شد، به `src/main.js` + Vite منتقل شود تا تست واحد واقعی ممکن شود.
