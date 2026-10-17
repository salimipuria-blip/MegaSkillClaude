---
name: pro-frontend-engineering
description: مهندسی فرانت‌اند حرفه‌ای با React و TypeScript (معماری کامپوننت، state، کارایی، دسترس‌پذیری، RTL و فونت فارسی) — وقتی کاربر رابط کاربری وب می‌سازد، بازطراحی یا بهینه می‌کند.
---

# pro-frontend-engineering

## هدف
رابطی که سریع، قابل‌نگهداری، دسترس‌پذیر و درست راست‌چین است — روی موبایل ضعیف هم.

## چه زمانی فعال شود
ساخت صفحه/کامپوننت React، Next.js یا Vite، کندی رابط، state آشفته، مشکل RTL، یا آماده‌سازی برای production.

## گردش کار
1. **ساختار**: بر اساس feature پوشه‌بندی کن (`features/cart/`) نه نوع فایل. کامپوننت‌های نمایشی (props in، JSX out) را از کامپوننت‌های داده‌دار جدا کن.
2. **TypeScript سخت‌گیر**: `strict: true`، بدون `any`؛ نوع داده‌های API را یک‌جا تعریف و در مرز با zod اعتبارسنجی کن.
3. **State درست**:
   - داده‌ی سرور → TanStack Query (cache، retry، invalidation)، نه useState + useEffect.
   - state فرم → react-hook-form + zod.
   - state سراسری واقعی (تم، کاربر) → Context کوچک یا Zustand. state محلی را بالا نبر.
   - هر چیزی که از state دیگر محاسبه می‌شود، state نیست (derive کن).
4. **کارایی**: اول اندازه بگیر (React Profiler، Lighthouse روی موبایل). سپس: code-splitting با `lazy`، تصویر با ابعاد مشخص و `loading="lazy"`، لیست بلند با virtualization، memo فقط جایی که profiler نشان داد.
5. **دسترس‌پذیری**: عنصر معنایی (`button` نه `div` کلیک‌پذیر)، label برای هر input، فوکوس قابل‌دیدن، کنتراست ≥ 4.5:1، کار با کیبورد.
6. **RTL و فارسی**: `dir="rtl"` و `lang="fa"` روی `html`؛ CSS منطقی (`margin-inline-start`، `padding-inline`) به‌جای left/right؛ فونت Vazirmatn با `font-display: swap`؛ ارقام با `Intl.NumberFormat('fa-IR')`؛ تاریخ جلالی با `Intl.DateTimeFormat('fa-IR-u-ca-persian')`؛ آیکون‌های جهت‌دار را mirror کن.
7. **حالت‌های رابط**: برای هر داده چهار حالت بساز: loading، خالی، خطا (با دکمهٔ تلاش مجدد)، موفق.
8. **تست**: منطق با Vitest، کامپوننت با Testing Library (بر اساس role و متن، نه class)، مسیر اصلی با Playwright.

## چک‌لیست کیفیت
- [ ] `tsc --noEmit` و lint بدون خطا
- [ ] Lighthouse موبایل: Performance و Accessibility ≥ 90
- [ ] هر داده‌ی async حالت loading/خالی/خطا دارد
- [ ] RTL واقعاً روی موبایل تست شده (نه فقط چشمی در دسکتاپ)
- [ ] هیچ راز/کلید API در bundle کلاینت نیست

## خروجی
کد کامپوننت‌ها و ساختار پوشه + تصمیم‌های state + گزارش کارایی/دسترس‌پذیری + تست‌ها.
