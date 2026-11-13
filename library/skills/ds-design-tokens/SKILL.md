---
name: ds-design-tokens
description: ساخت مجموعه 완전한 توکن‌های طراحی (رنگ، فاصله، تایپوگرافی، سایه، گرد covert، زوم) به صورت CSS custom properties و فایل JSON برای استفاده در هر پروژه — پایهٔ هر سیستم طراحی حرفه‌ای.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-design-tokens

> "هر چیزی در UI یک توکن است. توکن‌ها منبعِ حقیقت (single source of truth) هستند؛ کامپوننت‌ها فقط خواننده‌ی توکن‌ها."

---

## هدف

ساخت لایه اصلی یک سیستم طراحی: **Design Tokens** که شامل 팔ت رنگ، )}
فاصله (spacing)، تایپوگرافی (font-size/line-height/font-weight)، سایه (shadow)، )}
گرد Robert (border-radius)، و زوم (z-index) باشد. خروجی دو فرمت:
۱) `css-variables.css` برای استفاده مستقیم در CSS، و
۲) `design-tokens.json` برای وارد کردن در Figma، Style Dictionary، و جاوااسکریپت.

---

## چه زمانی فعال شود

وقتی]):
- شروع یک سیستم طراحی جدید یا ریفاكتور링 یک پروژه existierenden می‌کنید.
- نیاز دارید رنگ‌ها، فاصله‌ها و سایه‌ها در یک جا مدیریت شوند نه تکرار در هر کامپوننت.
- می‌خواهید حالت تیره/روشن (dark/light) را با یک متغیر تغییر دهید.
- تیم طراحی و توسعه باید یک زبان مشترک (color role, spacing scale) داشته باشند.

---

## گردش کار

1. **تنظیم نام فضایی (Namespace)**: هر متغیر را با پیش‌فرض `--ds-` آغاز کنید تا با کتابخانه‌های دیگر تداخل نداشته باشد (مثلاً `--ds-color-primary`).
2. **رंग‌ها (Color roles)**: نمی‌بینید کد HEX خالص در کامپوننت‌ها. فقط role‌های معناییdefinied کنید:
   - `--ds-color-background` / `--ds-color-surface` / `--ds-color-card`
   - `--ds-color-text-primary` / `--ds-color-text-secondary` / `--ds-color-text-muted`
   - `--ds-color-primary` و `--ds-color-primary-hover` / `--ds-color-primary-active`
   - `--ds-color-success`, `--ds-color-warning`, `--ds-color-error`, `--ds-color-info`
   - `--ds-color-border` و `--ds-color-focus-ring`
3. **فاصله (8px grid)**: `--ds-space-1` تا `--ds-space-24` (۴px، ۸px، ۱۲px … ۹۶px).
4. **تایپوگرافی**: `--ds-font-sans`, `--ds-font-mono`, `--ds-text-xs` … `--ds-text-6xl`, `--ds-line-height-tight/normal/relaxed`, `--ds-font-weight-*`.
5. **سایه و گرد Robert**: `--ds-shadow-sm/md/lg/xl` و `--ds-radius-sm/md/lg/xl/full`.
6. **زمان و زوم**: `--ds-transition-fast/base/slow` و `--ds-z-*.
7. **استخراج JSON**: همان مقادیر را در `design-tokens.json` با کلیدها و تایپ (color/dimension/number/duration) ذخیره کنید.
8. **تست**: فایل `preview.html` بسازید و همه متغیرها را روی یک کارت آزمایشی اعمال کنید.

---

### نمونه کد (css-variables.css)

```css
:root {
  /* Color */
  --ds-color-primary: #2563eb;
  --ds-color-primary-hover: #1d4ed8;
  --ds-color-on-primary: #ffffff;
  --ds-color-background: #ffffff;
  --ds-color-surface: #f8fafc;
  --ds-color-card: #ffffff;
  --ds-color-text-primary: #0f172a;
  --ds-color-text-secondary: #475569;
  --ds-color-text-muted: #94a3b8;
  --ds-color-border: #e2e8f0;
  --ds-color-focus-ring: rgba(37, 99, 235, 0.4);

  /* Semantic */
  --ds-color-success: #10b981;
  --ds-color-warning: #f59e0b;
  --ds-color-error: #ef4444;
  --ds-color-info: #3b82f6;

  /* Spacing (8px grid) */
  --ds-space-1: 4px;
  --ds-space-2: 8px;
  --ds-space-3: 12px;
  --ds-space-4: 16px;
  --ds-space-6: 24px;
  --ds-space-8: 32px;
  --ds-space-12: 48px;

  /* Border radius */
  --ds-radius-md: 8px;
  --ds-radius-lg: 12px;
  --ds-radius-full: 9999px;

  /* Shadow */
  --ds-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);

  /* Typography */
  --ds-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --ds-text-base: 1rem;
  --ds-text-lg: 1.125rem;
  --ds-line-height-normal: 1.5;
  --ds-font-weight-medium: 500;

  /* Motion */
  --ds-transition-base: 200ms ease;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --ds-color-background: #0f172a;
    --ds-color-surface: #1e293b;
    --ds-color-card: #1e293b;
    --ds-color-text-primary: #f8fafc;
    --ds-color-text-secondary: #cbd5e1;
    --ds-color-border: #334155;
  }
}
```

---

## چک‌لیست کیفیت

- [ ] هیچ کد رنگ (HEX) خالص داخل کامپوننت نیست؛ همهٔ آن‌ها از `--ds-color-*` استفاده می‌کنند.
- [ ] همه فاصله‌ها از `--ds-space-*` هستند (چرخهٔ ۸px حفظ شده).
- [ ] حالت تیره (`@media prefers-color-scheme: dark`)定义 شده و contrasting است.
- [ ] فایل `design-tokens.json`alongside فایل CSS وجود دارد و ساختاری منظم دارد.
- [ ] تفاوت رنگ متن و پس‌زمینه حداقل ۴٫۵:۱ (WCAG AA) است.
- [ ] `:focus-visible` با `--ds-color-focus-ring` مشخص شده است.

---

## خروجی

دو فایل آماده و یک صفحه آزمایشی:
- `tokens/css-variables.css` — توکن‌های CSS
- `tokens/design-tokens.json` — توکن‌هایJSON برای ابزارهای طراحی
- `preview.html` — نمایش زennes همه توکن‌ها روی یک کارت نمونه

این فایل‌ها پایهٔ تمام مهارت‌های کامپوننتی بعدی (دکمه، ورودی، کارت و …) هستند.