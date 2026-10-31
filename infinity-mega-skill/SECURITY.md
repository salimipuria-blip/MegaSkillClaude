# امنیت

## مدل تهدید

| # | تهدید | سطح | کنترل |
|---|---|---|---|
| T1 | کدِ تولیدشده (توسط مدل یا Reflex) به صفحه، شبکه یا حافظهٔ مرورگر دست بزند | بالا | Worker جدا با حذف `fetch`/`XHR`/`WebSocket`/`importScripts`/`indexedDB`/`caches`؛ سقف ۱٫۵ ثانیه و کشتنِ Worker |
| T2 | حلقهٔ بی‌پایان یا مصرف حافظه، تب را قفل کند | متوسط | تایم‌اوتِ میزبان + `node:vm` با `timeout` در هر کیس + پروب استرس |
| T3 | کلید API لو برود | بالا | کلید فقط در `localStorage` همین مرورگر و فقط با تیکِ صریح؛ هرگز در بدنهٔ درخواست، ZIP، صدور JSON یا دفتر جریان نوشته نمی‌شود |
| T4 | پروکسی Netlify به رلهٔ باز تبدیل شود | بالا | `INFINITY_PROXY_TOKEN` اجباری + مقایسهٔ ثابت‌زمان + لیست سفید هاست + سقف بدنهٔ ۵۱۲KB + بدون لاگِ محتوا |
| T5 | XSS از طریق متنِ مدل یا نام فایل | متوسط | همهٔ رشته‌ها با `esc`/`h` اتریبیوت‌شده درج می‌شوند؛ هیچ `innerHTML` با دادهٔ خام نیست؛ CSP بدون `unsafe-eval` |
| T6 | وابستگی مخرب در زنجیرهٔ تأمین | متوسط | صفر وابستگیِ اجرا؛ `jsdom` فقط dev و فقط برای تست |
| T7 | داده‌ی حساس در Git یا چت | متوسط | `.gitignore` برای `release/` و `node_modules/`؛ هیچ کلیدی در مخزن نیست |

## جزئیاتِ اجرای ایزوله

`src/core/sandbox.js`

```js
self.fetch = () => Promise.reject(new Error('network disabled in sandbox'));
self.XMLHttpRequest = undefined;
self.WebSocket = undefined;
self.EventSource = undefined;
self.importScripts = () => { throw new Error('importScripts disabled'); };
self.indexedDB = undefined;
self.caches = undefined;
```

- کد با `new Function` در همان Worker ساخته می‌شود؛ **در صفحهٔ اصلی اجرا نمی‌شود.**
- خروجی فقط از طریق `postMessage` و به‌صورت داده برمی‌گردد (`results`, `logs`, `captured`).
- Worker در حالت تایم‌اوت `terminate` می‌شود و URL آن `revoke` می‌شود؛ اجرای بعدی Worker تازه می‌گیرد.
- در Node (CI) هر کیس داخل `vm.runInContext` با `timeout` اجرا می‌شود تا `while(true)` تست را به حالت تعلیق نبرد.

**محدودیت صادقانه:** Worker یک مرزِ امنیتی در سطحِ مرورگر است، نه یک sandbox سیستمی. برای اجرای کدِ کاملاً غیرقابل‌اعتماد، این طراحی کافی نیست؛ برای «کدِ خودت» و «کدِ مدل با بازبینی» کافی و متناسب است.

## کلیدها

- پیش‌فرض: کلید در حافظهٔ همان تب می‌ماند و با بستن تب می‌رود.
- با تیکِ «ذخیرهٔ کلید»: در `localStorage` با کلید `infinity.metacode.keys.v3`.
- «صدور همه» کلیدها را حذف می‌کند (`buildExport` صریحاً `delete` می‌کند).
- «پاک‌سازی کامل» هر دو کلید `infinity.metacode.*` را پاک می‌کند.
- در `providers.buildRequest` کلید فقط در هدر یا کوئریِ Gemini می‌رود؛ تستِ `prv-1` این را تضمین می‌کند (`key never in body`).

## CSP

`netlify.toml`:

```
default-src 'self';
script-src 'self' blob:;
worker-src 'self' blob:;
style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
font-src 'self' https://cdn.jsdelivr.net data:;
img-src 'self' data: blob:;
connect-src 'self' https: http://localhost:11434 http://127.0.0.1:11434;
base-uri 'none'; form-action 'none'; frame-ancestors 'self'
```

- `blob:` برای Workerِ سندباکس لازم است.
- `connect-src https:` لازم است چون مرورگر مستقیم با ارائه‌دهندهٔ انتخابیِ کاربر حرف می‌زند. اگر می‌خواهی سخت‌گیرتر شود، این را به دامنه‌های همان ارائه‌دهنده محدود کن.
- `'unsafe-inline'` فقط برای استایل است (نوارهای امتیاز با متغیر CSS درون‌خطی)؛ اسکریپت درون‌خطی وجود ندارد و تستِ ایستا آن را می‌گیرد.

## اگر کلید لو رفت

1. کلید را در پنل ارائه‌دهنده باطل کن.
2. در اپ «پاک‌سازی کامل» را بزن (یا `localStorage.removeItem('infinity.metacode.keys.v3')`).
3. اگر از پروکسی استفاده می‌کردی، `INFINITY_PROXY_TOKEN` و `INFINITY_UPSTREAM_KEY` را در Netlify عوض کن.
4. مصرف را در پنل ارائه‌دهنده بررسی کن؛ این اپ لاگِ سمتِ سرور ندارد.

## گزارش

این پروژه مخزن خصوصی است؛ آسیب‌پذیری را در Issue عمومی ننویس. مسیر: پیام مستقیم به مالک مخزن با شدت، مسیر بازتولید و پیشنهاد رفع.
