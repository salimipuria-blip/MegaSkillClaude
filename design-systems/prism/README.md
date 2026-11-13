# Prism Design System

**Prism** — یک سیستم طراحیLETE برای محصولات SaaS، داشبوردهای ارگانیزیشن و اپلیکیشن‌های وب مدرن. تمرکز روی قابلیت readiz، دسترسی (a11y)، سیستم توکن‌محور و اجرا سریع در React/Tailwind.

---

## ویژگی‌های کلیدی

- **токن‌محور:** همه رنگ‌ها، فاصله‌ها، سایه‌ها و تایپوگرافی از طریق CSS custom properties کنترل می‌شوند.
- **Renderer-agnostic:** فایل‌های CSS خالص همراه با توکن‌های JSON برای هر فریم‌ورک (React, Vue, Angular, Svelte).
- **قابل دسترسی:** رنگ‌هاcontrasted، حالت focus قابل دیدن، و respects `prefers-reduced-motion`.
- ** dimensions responsive:** breakpoints برای ۳۷۵px تا ۱۴۴۰px.

---

## دایره‌های طراحی (Design Dials)

| Dial | مقدار | توضیح |
|------|-------|-------|
| Variance | 6/10 | متوازن بین یکنواختی و诺اری |
| Motion | 5/10 | انیمیشن‌های軽 (150–300ms) |
| Density | 5/10 | متوسط — نه خیلی تنگ، نه خیلی فضایی |

---

## ساخت فایل‌ها

| مسیر | توضیح |
|------|-------|
| `tokens/css-variables.css` | توکن‌های رنگ، تایپوگرافی، فاصله و سایه به صورت CSS variables |
| `tokens/design-tokens.json` | توkn‌های طراحی برای استفاده در ابزارها و جاوااسکریپت |
| `components/buttons.css` | استایل دکمه‌های اولیه، ثانویه، مخرب و قفسه‌ای |
| `components/inputs.css` | ورودی‌ها، انتخاب multiple، و Textarea |
| `components/cards.css` | کارت، چیدمان شبکه، و khối محتوا |
| `docs/MASTER.md` | مستندات کامل سیستم طراحی (قوانین، oppose-patterns، چک‌لیست) |
| `preview.html` | صفحه نمایش زنده برای تست سریع کامپوننت‌ها |

---

## شروع سریع

```html
<link rel="stylesheet" href="tokens/css-variables.css">
<link rel="stylesheet" href="components/buttons.css">
<link rel="stylesheet" href="components/inputs.css">
<link rel="stylesheet" href="components/cards.css">

<button class="btn btn-primary">دکمه اصلی</button>
```

## لایسنس

MIT — Free to use in commercial and personal projects.