# ۱۳ — مِتاکد / APEX-01 (`apex-agent/`)

**مأموریت:** ایجنت کدنویسِ فارسی و خودتکامل که بدون سرور، بدون وابستگی و بدون build اجرا می‌شود و «تأیید» را به اجرای واقعی در سندباکس مرورگر گره می‌زند: سه نامزد، سه فرضیهٔ شکستِ اجراشدنی، انتخابِ وزنی، تأیید پس از اعمال، و ژنومی که فقط با بهبودِ اندازه‌گیری‌شده ارتقا می‌یابد.

**مرزها:** کل محصول در `apex-agent/` است و خودکفاست. تنها وابستگیِ اختیاری، تابع `netlify/functions/llm.mjs` برای پروکسی مدل است (توکن‌محور، پیش‌فرض خاموش). هیچ داده‌ای از کاربر به سرور نمی‌رود مگر خودِ کاربر مدل را وصل کند.

**منبع حقیقت:** `apex-agent/src/core/` (۱۷ ماژول خالص) و `apex-agent/src/app/` (۵ ماژول نمایش). مستندات: `README.md` (محصول)، `ARCHITECTURE.md`، `SECURITY.md`، `CLAUDE.md` (دستور کار)، `PROFESSIONAL_GUIDE.md` (ممیزی)، `REVIEW.md` (بازبینی سه‌پاسه)، `PROGRESS.md` (دفتر جریان).

## وضعیتِ جاری

| سنجه | مقدار | منبع |
|---|---|---|
| هسته | ۱۷ ماژول خالص بدون DOM در `apex-agent/src/core/` | شمارش فایل |
| نما | ۵ ماژول در `apex-agent/src/app/` | شمارش فایل |

## وضعیت تأییدشده (2026-10-30، پاس سوم)

| سطح بررسی | دستور | نتیجه |
|---|---|---|
| قرارداد ایستا | `node tools/check.mjs` | ✅ پاک — ۶۰ فایل، ۷۰۸ KB، ۹ قرارداد |
| تست هستهٔ خالص | `node --test src/tests/core.test.mjs` | ✅ ۳۰/۳۰ |
| تست مسیرِ مدل | `node --test src/tests/model.test.mjs` | ✅ ۵/۵ (سرور HTTP محلی: قرارداد درخواست، SSE، ۴۰۱، ۴۲۹، پاسخِ بی‌معنی) |
| تست سرتاسری DOM | `node --test src/tests/dom.test.mjs` | ✅ ۶/۶ (jsdom: boot، شورا، بنچمارک، تست اتصال، خودکاوی، ویرایش/زیپ) |
| سخت‌سازی | `node --test src/tests/hardening.test.mjs` | ✅ ۱۰/۱۰ (ورودِ خصمانه، آلودگیِ prototype، دیالوگ با کیبورد، عدد فارسی، جبرگرایی، اسکریپتِ سندباکس بدون eval) |
| کلِ مجموعه | `node --test src/tests/*.test.mjs` | ✅ ۹۷/۹۷ · ده موجِ پیاپی هر بار ۹۷/۹۷ |
| پروکسی و استقرار | `node --test src/tests/proxy.test.mjs src/tests/deploy.test.mjs` | ✅ ۶/۶ (ردِ رلهٔ باز، هدرهای یکسانِ Netlify/Vercel) |
| زیپ استقرار | `node tools/make_zip.mjs` | ✅ ۶۰ فایل، ۷۱۷.۵ KB، تأیید با `python3 -m zipfile` (sha256 را ابزار در هر ساخت چاپ می‌کند) |
| **رندر مرورگر واقعی** | `npm run render` (Chromium 153، CSPِ واقعیِ استقرار) | ✅ **۳۲/۳۲** — بوت ۰٫۸ ثانیه، فونت وزیرمتن، Reflex واقعی، Worker واقعی، ۳۰/۳۰ سنجهٔ درون‌اپ در مرورگر، موبایل ۳۹۰×۸۴۴ |
| فراخوانی زندهٔ مدل | `npm run live` | ⏳ ابزار آماده و با `--mock` اثبات‌شده (verify ۲/۲، SSE واقعی)؛ اجرای زندهٔ واقعی نیاز به کلید + ماشینِ مالک دارد (شبکهٔ ساخت به هاستِ ارائه‌دهنده بسته است) |
| استقرار Vercel | `create_deployment` از همین برنچ | ✅ ساخته شد؛ لینک پشتِ Deployment Protection حساب |
| استقرار Netlify | — | ❌ اجرا نشده (بدون توکن حساب) |

شاهدِ چشمی: `docs/screenshots/` (۹ تصویر + `render-report.json`)، بیرون از بستهٔ استقرار.

## دستورها

```bash
cd apex-agent
node tools/check.mjs                 # قرارداد ایستا
node --test src/tests/*.test.mjs     # ۹۷ تست (۳۱ تستِ jsdom در نبودِ آن skip می‌شوند)
node tools/make_zip.mjs              # release/apex-metacode-netlify.zip
python3 -m http.server 8080          # پیش‌نمایش محلی
npm run render                       # ۳۲ سنجه در کرومیومِ واقعی (نیاز به puppeteer-core)
npm run live                         # فراخوانیِ زندهٔ مدل (کلید)؛ بدون کلید: NOT RUN با کد ۲
npm run live -- --mock               # اثباتِ مسیر بدون شبکه
node tools/serve.mjs --port 8080     # پیش‌نمایش با هدرهای واقعیِ استقرار
node tools/render.mjs --base http://127.0.0.1:8080   # ۳۲ سنجه روی همان پیش‌نمایش
node ../scripts/doctor.mjs apex      # همان گیت‌ها از ریشهٔ مخزن
```

## اولویت‌ها

- **P0** تأیید بصری در مرورگر واقعی و موبایل؛ ثبت اسکرین‌شات در `docs/`.
- **P0** یک اجرای زنده با ارائه‌دهنده (OpenRouter یا Gemini) و ثبت خروجی در `PROGRESS.md`.
- **P1** استقرار روی Netlify Drop و ثبت URL عمومی در `README.md`.
- **P1** پشتیبانی استریم برای Anthropic/Gemini با همان قرارداد `onDelta`.
- **P2** Service Worker برای اجرای کامل آفلاین.
- **P2** چرخهٔ ترمیم چندفایلی روی `self/`.

## Definition of Done

1. `check` و ۳۵ تست سبز، بدون skip در مسیر DOM.
2. پیش‌نمایش در مرورگر واقعی تأیید شده (سه تب + موبایل).
3. یک اجرای زندهٔ مدل و یک انتشار Netlify با URL ثبت‌شده.
4. `PROGRESS.md` با تاریخ، دستور و خروجی واقعی به‌روز شده و موارد اجرانشده صریحاً «اجرا نشده» مانده‌اند.
