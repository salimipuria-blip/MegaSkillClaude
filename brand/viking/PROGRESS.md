# قالب محتوای وایکینگ — دفتر جریان پروژه

> دفتر زندهٔ `brand/viking/`؛ وضعیت زیر بر اساس فایل‌های همین checkout است. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴ (تحلیل مرجع و راهنمای جهت هنری)**.

## ۱) پروژه در یک نگاه
- **هدف:** قالب محلی برای خروجی PNG پست اسلایدی و استوری وایکینگ آفرود؛ به اپ تیم یا Supabase وصل نیست.
- **منابع:** `post.html`, `story.html`, `assets/`, `render.mjs`.
- **خروجی:** `post-1.png` تا `post-3.png` با ابعاد هرکدام ۱۰۸۰×۱۳۵۰، یا `story.png` با ابعاد ۱۰۸۰×۱۹۲۰؛ پیش‌فرض مسیر `brand/viking/out/` است.
- **هویت:** نارنجی `#F39A2B`, مشکی `#141414`, کرم `#FFD9A8`, قرمز هشدار `#FF4D3D`. پالت این قالب جدا از PNG استیکرهای `brands/viking-offroad/` است.

## ۲) دستور دقیق این پروژه
```bash
node --check brand/viking/render.mjs
python3 scripts/check_brand_assets.py --templates
node brand/viking/render.mjs post
node brand/viking/render.mjs story
```
برای رندر به Playwright و Chromium نیاز است. اگر auto-discovery موفق نبود:
```bash
PLAYWRIGHT_PATH=/path/to/playwright CHROMIUM_PATH=/path/to/chromium \
  node brand/viking/render.mjs post brand/viking/out/review
```

## ۳) وضعیت تأییدشده در این نوبت
| بررسی | نتیجه |
|---|---|
| `node --check brand/viking/render.mjs` | ✅ نحو ES module معتبر |
| `python3 scripts/check_brand_assets.py --templates` | ✅ هر دو template و ۶ ارجاع محلی تصویر/فونت پیدا شدند |
| `node --test brand/viking/tests/render.test.mjs` | ✅ **۳/۳**؛ رندر post/story با fake، خطای screenshot و `browser.close()` در `finally` |
| رندر واقعی با Chromium | ⚠️ در محیط فعلی Playwright/Chromium نصب یا قابل‌شناسایی نیست؛ خروجی بصری را ادعا نمی‌کنیم |

## ۴) دیباگ و اصلاح اعمال‌شده
**ریسک قبلی:** `render.mjs` به ماژول Playwright در `/opt/node-tools/` و مرورگر با نسخهٔ ثابت `chromium-1194` قفل بود؛ این مسیر روی ماشین دیگر شکست می‌خورد. اگر navigation یا screenshot نیز خطا می‌داد، مرورگر تضمین‌شده بسته نمی‌شد.

**اصلاح این دور:**
- جست‌وجوی Playwright از `PLAYWRIGHT_PATH`، نصب محلی پروژه و مسیرهای رایج انجام می‌شود؛ Chromium مدیریت‌شدهٔ Playwright بدون مسیر hard-codeشده اجرا می‌شود.
- `CHROMIUM_PATH` اختیاری و با بررسی وجود فایل پذیرفته می‌شود؛ خطای نبود Playwright/Chromium راه‌حل دقیق چاپ می‌کند.
- نوع خروجی فقط `post|story` است؛ تعداد اسلایدها/شناسه‌ها/هدف `#st` اعتبارسنجی می‌شود.
- `browser.close()` در `finally` قرار گرفت تا شکست رندر process مرورگر را جا نگذارد.
- اسکن static ثابت کرد `post.html` و `story.html` به فونت/لوگوی داخل پوشه اشاره می‌کنند؛ هیچ رندر تصویری واقعی در این محیط انجام نشده است.
- `brand/viking/tests/render.test.mjs` با Playwright fake سه مسیر را پوشش می‌دهد: سه اسلاید post، یک story و cleanup مرورگر پس از شکست screenshot؛ این تست فقط جریان برنامه را می‌سنجد و کیفیت PNG را نه.

## ۵) کارهای باز / پیشنهاد بعدی
- [ ] نصب Playwright + Chromium در محیط کنترل‌شده و تولید هر دو قالب؛ بررسی بصری روی اندازهٔ موبایل و desktop.
- [ ] افزودن تست smoke با Chromium واقعی در CI و ذخیرهٔ PNG به‌عنوان artifact موقت، نه فایل commitشده.
- [ ] هنگام ویرایش پست، قیمت/تاریخ/ظرفیت را از brief واقعی بگیر؛ هیچ scarcity یا جایزهٔ ساختگی اضافه نشود.

## ۶) لاگ جریان (افزایشی)
- **۲۰۲۶-۱۰-۱۴** — رندرر از مسیر ثابت Playwright/Chromium مستقل شد؛ پاک‌سازی مرورگر در شکست تضمین و اعتبارسنجی خروجی اضافه شد. تست‌های Playwright fake ‏۳/۳، `node --check` و بررسی ۶ ارجاع محلی سبز؛ رندر واقعی به‌دلیل نبود مرورگر در محیط تأیید نشده.
- **۲۰۲۶-۱۰-۱۴ (تحلیل چهار مرجع و جهت هنری)** — یک استوری ۹:۱۶ و سه اسلاید کاروسل ۴:۵ مستقیماً تحلیل شدند؛ `ART_DIRECTION.md` نور/کادر/تایپوگرافی، نوار مورب، لوگوی رسمی، شماره‌گذاری و کارت‌ها را از ادعاهای کمپین جدا می‌کند. Hermes همین mood را با هدف فوتورئالیسمِ سینمایی و جزئیات 8K-like در بالاترین وضوح بومیِ پشتیبانی‌شده به تولید/ویرایش می‌دهد؛ متن، لوگو و گرافیک در لایهٔ واقعی می‌مانند و قیمت/ظرفیت/جایزه بدون brief تأییدشده تکرار نمی‌شود. `scripts/check_brand_assets.py --templates` و تست‌های رندرر fake ‏۳/۳ سبز؛ PNG واقعی هنوز به Chromium نصب‌شده نیاز دارد.
