# 10 — قالب و رندر محتوای وایکینگ (`brand/viking/`)

## مأموریت و مرزها
قالب‌های تأییدشدهٔ محتوای پست و استوری وایکینگ آفرود را از HTML/CSS محلی به PNG تبدیل می‌کند. این ابزار به `/team/`، Supabase یا انتشار Viking Team وصل نیست. تغییر در این قالب‌ها نباید به‌اشتباه به‌عنوان تغییر محصول تیم منتشر شود.

## وضعیت و قرارداد بصری
- `post.html`: سه اسلاید ۱۰۸۰×۱۳۵۰ (۴:۵).
- `story.html`: یک قاب ۱۰۸۰×۱۹۲۰ (۹:۱۶).
- `render.mjs`: رندر Playwright؛ خروجی پیش‌فرض در `brand/viking/out/`.
- فونت‌ها و عکس/لوگو در `brand/viking/assets/` و باید محلی resolve شوند.
- پالت این قالب طبق `brand/viking/README.md`: نارنجی `#F39A2B`، مشکی `#141414`، کرم `#FFD9A8` و قرمز هشدار `#FF4D3D`. این رنگ را با `#F28A1E` پک استیکرها یکی نکن، مگر تصمیم برند ثبت شود.
- ادعای ظرفیت، ددلاین، جایزه و قیمت باید واقعی باشد؛ FOMO ساختگی ممنوع.

## دستورهای دقیق توسعه و رندر
از ریشهٔ مخزن:

```bash
node --check brand/viking/render.mjs
node --test brand/viking/tests/render.test.mjs
python3 scripts/check_brand_assets.py --templates
node brand/viking/render.mjs post
node brand/viking/render.mjs story
```

Playwright و Chromium پیش‌نیاز رندر تصویری‌اند. مسیرها قابل پیکربندی‌اند:

```bash
PLAYWRIGHT_PATH=/path/to/playwright CHROMIUM_PATH=/path/to/chromium \
  node brand/viking/render.mjs post brand/viking/out/review
```

اگر Playwright در مسیر محلی یا `/opt/node-tools/node_modules/playwright` پیدا نشود، پیام خطای اجرایی مسیر قابل‌عمل می‌دهد؛ نسخهٔ مرورگر hard-code نمی‌شود. خروجی‌ها ویدئویی/تصویری‌اند و نباید بدون تصمیم جداگانه به Git اضافه شوند.

## پروتکل دیباگ حرفه‌ای
- **PNG ناقص/خالی:** ابتدا `python3 scripts/check_brand_assets.py --templates`؛ سپس منبع HTML و مسیر `assets/` را بررسی کن.
- **خطای Playwright:** ابتدا `PLAYWRIGHT_PATH`؛ سپس وجود Chromium و `CHROMIUM_PATH`. رفع خطای محیط نباید با تغییر کورکورانهٔ HTML انجام شود.
- **فایل خروجی تولید نشده:** بررسی کن خروجی پیش‌فرض `brand/viking/out/` است؛ مسیر نسبی آرگومان دوم از `cwd` محاسبه می‌شود.
- **خطای رندر میان‌راهی:** رندرر در `finally` مرورگر را می‌بندد؛ صفحهٔ نیمه‌کاره را تحویل نده و پس از اصلاح، هر دو قالب را جدا رندر کن.
- **محتوای فارسی/چیدمان:** تصویر PNG هر اسلاید را در اندازهٔ واقعی و روی نمایشگر موبایل ببین؛ فونت `document.fonts.ready` پیش از screenshot انتظار کشیده می‌شود، اما بازبینی بصری همچنان لازم است.

## گسترش اولویت‌بندی‌شده
- **P1:** تست smoke مبتنی بر Chromium در محیط CI کنترل‌شده، شامل سه اسلاید پست، استوری و ابعاد دقیق خروجی.
- **P1:** ثبت خروجی رندر در artifact موقت CI (نه commit) و سنجش ابعاد/حجم PNG.
- **P2:** جداسازی محتوا از template فقط وقتی چندین پست واقعی از همین قالب تولید می‌شوند؛ اکنون تغییر کوچک و قابل بازبینی ارجح است.

## Definition of Done
Syntax و بررسی assetها سبز؛ رندر پست و استوری بدون خطای صفحه؛ مرورگر حتی هنگام شکست بسته می‌شود؛ تصاویر در ابعاد و پالت درست بازبینی شده‌اند؛ قیمت/دعوت/محدودیت ظرفیت واقعیت دارد؛ `brand/viking/PROGRESS.md` نتیجه را ثبت کرده است.
