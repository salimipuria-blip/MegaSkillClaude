# گزارش پیشرفت

> آخرین به‌روزرسانی: 2026-10-30 · لاگ جریان: جدیدترین پاس در بالا، تاریخ‌دار و با دستور و خروجی واقعی.

## 2026-10-30 — ساخت و تثبیت نسخهٔ ۳٫۰٫۰

**هدف:** ایجنت کدنویسِ فارسی، مستقل و قابل‌استقرار روی Netlify که «تأیید» را به اجرای واقعی گره بزند، با شورای سه‌گانه، رمزشکن، سندباکس، ژنومِ خودتکامل، کارگاه توکن و خروجی ZIP — و طراحی بر پایهٔ زبان بصریِ APEX.

### آنچه ساخته شد

| بخش | فایل | وضعیت |
|---|---|---|
| هستهٔ اجرا | `src/core/agent.js` | ✅ سه حالت (شورا/تک‌نامزد/ابزار)، لغو با `AbortSignal` |
| شورا + رمزشکن | `src/core/triad.js`, `evaluate.js` | ✅ ۳ نامزد × ۳ فرضیه × ۵ محور روبریک |
| سندباکس | `src/core/sandbox.js` | ✅ Worker بدون شبکه + `node:vm` در CI |
| دیف/فایل‌سیستم | `src/core/diff.js`, `vfs.js` | ✅ دیف یکپارچه، اعمال سخت‌گیر، نسخه‌بندی |
| مغز بدون کلید | `src/core/reflex.js` | ✅ ۱۰ خانواده + اسکلتِ صادقانه |
| مدل‌ها | `src/core/providers.js` | ✅ ۱۳ ارائه‌دهنده، ۴ پروتکل سیم |
| تکامل | `genome.js`, `evolution.js`, `evals.js` | ✅ ۹ ژن، ۳ جهش/نسل، ۱۰ تسک با تست پنهان |
| کارگاه توکن | `compress.js`, `tokens.js` | ✅ بسته‌بندی زیر بودجه + عصاره |
| خودکاوی | `src/app/self.js` | ✅ بارگیری ۲۲ فایل خودِ اپ + ممیزی ساختاری |
| رابط | `index.html`, `assets/apex.css`, `src/app/*` | ✅ ۵ نما، پالت، توست، میدان ذره‌ای، موبایل |
| استقرار | `netlify.toml`, `netlify/functions/llm.mjs`, `manifest.webmanifest`, `assets/icon.svg` | ✅ پروکسیِ توکن‌محور با لیست سفید |
| ابزار | `tools/check.mjs`, `tools/make_zip.mjs`, `package.json` | ✅ ۹ قرارداد ایستا، زیپِ قطعی |

### سه پاس بازبینی (جزئیات در `REVIEW.md`)

| پاس | تمرکز | باگ‌های واقعیِ پیداشده | نتیجه |
|---|---|---|---|
| ۱ | بالا آمدن برنامه | ایمپورتِ دوگانهٔ `chat`؛ `verdadeiro`؛ `location` بی‌گارد؛ رویدادِ `verify` غایب | boot سالم |
| ۲ | درستیِ جریان | `memory.journal()` نام متد با کلیدِ وضعیت یکی بود؛ کشِ ماژول در تست؛ پیش‌فرض `.md` کارگاه | ۴/۵ تست DOM |
| ۳ | پاک‌سازی و بستن | `lastRun` از کلیدِ اشتباه (`selection.scored`) خوانده می‌شد؛ نشتِ تایمر/انیمیشن؛ بازگشتِ بازگشتی در `closeApp` | ۳۵/۳۵، خروج در ۶٬۴ ثانیه |

### دستورها و خروجیِ خام

```bash
$ node tools/check.mjs
· 32 files, 362.2 KB
· self-test cases: 30, benchmark tasks: 10
✓ static contract is clean

$ node --test src/tests/*.test.mjs
# tests 35
# pass 35
# fail 0
# duration_ms 6937.8

$ node tools/make_zip.mjs
zip: release/apex-metacode-netlify.zip
files: 39
size: 419.8 KB
sha256: 2c8085d8…cdb1
verified: python zipfile listed 40 entries
```

### اضافه‌شده در همین پاس (پس از تست اولیه)

- **حالت ابزار واقعی:** اگر `mode === 'tools'` و مدل وصل باشد، `agent.toolLoop` اجرا می‌شود؛ بدون کلید، پیام صریح و بازگشت به شورا.
- **توقف واقعی:** `AbortController` به `createAgent` می‌رسد، `assertLive()` بین نامزدها چک می‌کند و درخواست مدل لغو می‌شود.
- **متر کانتکست:** تعداد توکنِ پس از فشرده‌سازی از رویداد `compression` به وضعیت می‌رود.
- **خودکاوی:** دکمه در تب تکامل + اکشن پالت؛ ۲۲ فایل زیر `self/` و گزارشِ یافته‌ها در چت.
- **پیشنهاد مدل:** `datalist` از مدل‌های همان ارائه‌دهنده پر می‌شود.
- **آزادسازی منابع:** `app.dispose()` تایمرها، انیمیشن‌ها و Worker را می‌بندد.

### اجرا نشده (باید صریح بماند)

- رندر در مرورگر واقعی — در این محیط Chromium نبود؛ jsdom فقط رفتار را می‌سنجد.
- فراخوانی زندهٔ هر ارائه‌دهنده با کلید واقعی.
- استقرار روی Netlify و آزمون تابع پروکسی.
- Safari iOS و اندروید واقعی.

### گیت‌های ریشه (همان پاس)

```bash
$ node scripts/doctor.mjs repo apex
✓ repo  health / common-tests / skill-library-sync
✓ apex  contract / tests
all required checks passed in 44.5s

$ python3 -m unittest discover -s tests -p "test_*.py"
Ran 180 tests — OK
```

در همین پاس دو drift کهنه هم بسته شد: شمارندهٔ دامنه/گام در `docs/directives/00-monorepo.md` (۱۳/۴۲ → ۱۴/۴۴) و شمارندهٔ هرمس در `docs/directives/02-hermes.md` + `docs/PORTFOLIO.md` (۲۶۳/۷۹ → ۲۶۹/۸۲؛ پیش از این تغییر هم قرمز بود و از کار این پوشه نبود).

### گام بعدی

1. بازکردن پیش‌نمایش و تأیید بصری سه تب (چت، کارگاه، تکامل) در دسکتاپ و موبایل.
2. یک اجرای زنده با OpenRouter و ثبت نتیجه در همین فایل.
3. `netlify deploy --prod` و ثبت URL در `README.md`.
