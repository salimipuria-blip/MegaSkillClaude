# قالب ثابت محتوای وایکینگ آفرود

این قالب محلیِ تأییدشده برای پست/استوری وایکینگ است. متن و عکس هر محتوا تغییر می‌کند؛ سبک، ابعاد، پالت و محدودیت ادعا ثابت می‌ماند. این رندرر به وب‌اپ Viking Team یا Supabase وصل نیست.

| فایل | خروجی |
|---|---|
| `post.html` | ۳ اسلاید PNG، هرکدام ۱۰۸۰×۱۳۵۰ (۴:۵) |
| `story.html` | یک PNG، ۱۰۸۰×۱۹۲۰ (۹:۱۶) |
| `render.mjs` | Playwright render؛ خروجی پیش‌فرض `brand/viking/out/` |

## سبک ثابت
- **عکس:** سینمایی و زنده؛ طلوع/غروب، مه، نور گرم، آب یا جنگل؛ سوژهٔ کوچک و قابل‌تشخیص در مرکز. اشباع/کنتراست کنترل‌شده و هالهٔ نارنجی.
- **رنگ‌ها:** نارنجی `#F39A2B`، مشکی `#141414`، کرم `#FFD9A8`، قرمز هشدار `#FF4D3D` فقط برای خط‌خوردگی/جایزه، سفید.
- **فونت:** Lalezar برای تیتر، Vazirmatn برای متن.
- **نوار/لوگو:** tape کج با پیام اصلی و CTA؛ لوگوی دایره‌ای گوشهٔ بالا راست.
- **ادعا:** ددلاین، ظرفیت، قیمت و جایزه باید واقعی و قابل تأیید باشند؛ FOMO یا scarcity ساختگی ممنوع.
- **CTA:** یک اقدام روشن؛ طبق قالب «رزرو از لینک بیو» و پرداخت بعد از تأیید رزرو.

## بررسی و رندر
از ریشهٔ مخزن:

```bash
python3 scripts/check_brand_assets.py --templates
node --check brand/viking/render.mjs
node --test brand/viking/tests/render.test.mjs
```

برای خروجی تصویری، Playwright و Chromium باید روی دستگاه حاضر باشند. رندرر Playwright را در محل‌های متداول/نصب محلی جست‌وجو می‌کند؛ در محیط خاص:

```bash
PLAYWRIGHT_PATH=/path/to/playwright CHROMIUM_PATH=/path/to/chromium \
  node brand/viking/render.mjs post brand/viking/out/review
node brand/viking/render.mjs story
```

`render.mjs` مسیر مرورگر ثابت/نسخه‌دار ندارد و در همهٔ مسیرهای موفق/ناموفق Chromium را می‌بندد. تست‌های Node از Playwright fake برای کنترل سه اسلاید، خروجی story، خطای screenshot و cleanup استفاده می‌کنند؛ آن تست‌ها جای رندر واقعی را نمی‌گیرند.

## ساخت محتوای جدید

1. از `post.html` یا `story.html` شروع کن و فقط متن، تاریخ، قیمت و عکس را با brief واقعی عوض کن.
2. بررسی assetها و تست‌های Node را اجرا کن.
3. هر دو قالب را در محیط Chromium رندر و PNGهای خروجی را چشمی در موبایل و desktop بازبینی کن.
4. خروجی PNG را فقط پس از تأیید مالک تحویل بده؛ فایل‌های `out/` تولیدی‌اند و در Git نگهداری نمی‌شوند.

## جریان پروژه
وضعیت فنی/باگ‌ها و کار بعدی در [PROGRESS.md](PROGRESS.md) است؛ دستور کامل در [راهنمای توسعه](../../docs/directives/10-viking-content-renderer.md).
