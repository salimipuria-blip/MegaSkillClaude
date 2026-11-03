# VIKING / CINEMATIC MOTION STUDY

این پوشه یک **نمونهٔ حرکتی مستقل** با Remotion است؛ بخشی از وب‌اپ منتشرشده نیست و رندر نهایی هنوز در محصول ادغام نشده است. انیمیشن را فقط پس از تأیید پیش‌نمایش و تصمیم محصول وارد صفحهٔ معرفی کن؛ فرم‌ها، ثبت سفر، آپلود و دانلود نباید پشت انیمیشن طولانی بمانند.

## مشخصات خروجی
- Composition: `VikingCommandIntro`
- نسبت تصویر: ۹:۱۶ · اندازه: ۱۰۸۰×۱۹۲۰ · نرخ فریم: ۳۰ · مدت: ۶ ثانیه / ۱۸۰ فریم
- انیمیشن frame-driven با `useCurrentFrame` و `interpolate`؛ بدون CSS animation
- هویت این مطالعه: نارنجی `#FF713C`، زمینهٔ تیره و کرم. این پالت را با پالت PNG استیکر یا قالب‌های `brand/viking/` خودکار یکی نکن.

## نصب و بررسی
از ریشهٔ مخزن:

```bash
npm ci --prefix viking-team/motion --ignore-scripts --no-audit --no-fund
npm run check --prefix viking-team/motion
```

برای پیش‌نمایش:

```bash
cd viking-team/motion
npm run studio
```

برای رندر MP4 پس از بازبینی پیش‌نمایش:

```bash
npm run render
```

خروجی `out/viking-intro.mp4` محلی/تولیدی است؛ فایل را commit نکن. اگر دانلود Chrome Headless Shell از `remotion.media` به‌علت محدودیت شبکه شکست خورد، به‌جای retry نامحدود از مرورگر موجود استفاده کن:

```bash
npm run render -- --browser-executable=/absolute/path/to/chromium
```

اگر مرورگر به کتابخانه‌های همراه نیاز دارد، مسیر آن‌ها را نیز تنظیم کن:

```bash
LD_LIBRARY_PATH=/path/to/lib npm run render -- --browser-executable=/absolute/path/to/chromium
```

پس از رندر، تعداد فریم/وضوح/کدک را با `ffprobe` بررسی و چند فریم از ابتدا، میانه و انتها را بصری بازبینی کن؛ `npm run check` فقط TypeScript را تأیید می‌کند و موفقیت MP4 را تضمین نمی‌کند.

## نحوهٔ استفادهٔ ایمن
در حالت `prefers-reduced-motion` باید نمای ثابت/بدون حرکت جایگزین شود. هیچ آمار سفر یا تصویر واقعی جعل نشده است. حجم، bitrate، وضوح متن فارسی و سازگاری پخش در آیفون را قبل از تحویل بررسی کن.

## وضعیت و ادامهٔ کار
وضعیت دقیق و کارهای باز در [PROGRESS.md](PROGRESS.md) و دستور توسعه در [`docs/directives/12-viking-motion-study.md`](../../docs/directives/12-viking-motion-study.md) است. این نمونه هویت کاربری، پایگاه‌داده، دسترسی اعضا یا ذخیره‌سازی رسانه را فراهم نمی‌کند.
