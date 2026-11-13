---
name: ds-component-preview
description: ساخت صفحه preview.html برای تست سریع هر کامپوننت: RTL، dark/light، responsive ۴ breakpoint، نمایش همه variant و حالت‌ها.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-component-preview

> "پیش نمایش قبل از کد، بیش از هر چیز،.time-saving است."

---

## هدف

ساخت یک `preview.html`ONE-PAGE که**:
- همه فایل‌های CSS سیستم (tokens, buttons, inputs, cards, grid, motion, theme) را import کند.
- RTL و فارسی (lang="fa" dir="rtl") داشته باشد.
- dark/light را با دکمه-toggle نمایش دهد.
- هر کامپوننت را در همه variant، سایز و حالت (default/hover/focus/disabled) نشان دهد.
- responsive در ۳۷۵px، ۷۶۸px، ۱۰۲۴px، ۱۴۴۰px تست شود.
- بدون external dependency (فقط فایل‌های محلی) باشد.

---

## چه زمانی فعال شود

وقتی]:
- هر کامپوننت جدید ساخته می‌شود.
- قبل از commit، تست بصری نیاز است.
- به مشتری یا تیم نشان خواهید داد که کامپوننت‌ها چگونه 보이는‌ان.

---

## gondول_Workflow (ساخت preview)

1. **ساختار HTML**: `<html lang="fa" dir="rtl">`، `<meta charset="UTF-8">`، viewport.
2. **Import CSSها**: `<link rel="stylesheet" href="../tokens/css-variables.css">` و ...
3. **دکمه-toggle تم**: با کلاس/id برای تست dark-light.
4. **بخش‌ها**: دکمه‌ها، ورودی‌ها، کارت‌ها، grid، badge، آواتار، انیمیشن‌ها.
5. **استایل preview**: `max-width: 960px`, `margin: 0 auto`, padding space-10.
6. **تست**: باز کردن در مرورگر، تغییر اندازه، تویगल تم، focused elements.

---

### نمونه preview.html (ساختار اصلی)

```html
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><SYSTEM-NAME> — Preview</title>
<link rel="stylesheet" href="tokens/css-variables.css">
<link rel="stylesheet" href="components/buttons.css">
<link rel="stylesheet" href="components/inputs.css">
<link rel="stylesheet" href="components/cards.css">
<link rel="stylesheet" href="components/grid.css">
<link rel="stylesheet" href="components/motion.css">
<style>
  body { font-family: var(--ds-font-sans); background: var(--ds-color-background); color: var(--ds-color-text-primary); margin: 0; padding: var(--ds-space-10); line-height: var(--ds-line-height-normal); }
  .preview-section { max-width: 960px; margin: 0 auto; }
  h1 { font-size: var(--ds-text-3xl); margin-bottom: var(--ds-space-4); }
  .btn-group-demo { display: flex; gap: var(--ds-space-3); flex-wrap: wrap; margin-bottom: var(--ds-space-6); }
  .field-demo { max-width: 360px; margin-bottom: var(--ds-space-6); }
  .card-demo { display: grid; gap: var(--ds-space-6); grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-bottom: var(--ds-space-8); }
  .badge { margin-left: var(--ds-space-2); }
  .theme-toggle { position: fixed; top: var(--ds-space-4); left: var(--ds-space-4); z-index: var(--ds-z-tooltip); }
</style>
</head>
<body>
  <button class="theme-toggle btn btn-sm btn-ghost" onclick="toggleTheme()">تغییر تم</button>

  <div class="preview-section">
    <h1><SYSTEM-NAME> Design System</h1>
    <p style="color: var(--ds-color-text-muted);">پیش نمایش زنده کامپوننت‌ها</p>

    <!-- دکمه‌ها -->
    <h2>دکمه‌ها</h2>
    <div class="btn-group-demo">
      <button class="btn btn-primary">Primary</button>
      <button class="btn btn-secondary">Secondary</button>
      <button class="btn btn-outline">Outline</button>
      <button class="btn btn-ghost">Ghost</button>
      <button class="btn btn-destructive">Destructive</button>
      <button class="btn btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg></button>
    </div>

    <!-- ورودی‌ها -->
    <h2>ورودی‌ها</h2>
    <div class="field-demo">
      <label for="email">ایمیل</label>
      <input type="email" id="email" class="input" placeholder="name@example.com">
    </div>
    <div class="field-demo">
      <label for="pass">رمز عبور</label>
      <input type="password" id="pass" class="input error">
      <p class="error-text">خطای نمونه</p>
    </div>

    <!-- کارت‌ها -->
    <h2>کارت‌ها</h2>
    <div class="card-demo">
      <article class="card card-interactive">
        <div class="card-body">
          <h3 style="font-size: var(--ds-text-lg); margin: 0 0 var(--ds-space-3) 0;">عنوان کارت</h3>
          <p style="font-size: var(--ds-text-sm); color: var(--ds-color-text-muted); margin: 0;">متن توضیحی کارت.</p>
        </div>
        <div class="card-footer">
          <span class="badge badge-primary">فعال</span>
          <button class="btn btn-sm btn-outline">بیشتر</button>
        </div>
      </article>
    </div>
  </div>

  <script src="../js/toggle-theme.js"></script>
</body>
</html>
```

---

## چک‌لیست کیفیت

- [ ] import تمام فایل‌های CSS سیستم.
- [ ] RTL و lang="fa" وجود دارد.
- [ ] دکمه-toggle تم کار می‌کند.
- [ ] هر کامپوننت در همه variant نمایش داده می‌شود.
- [ ] responsive در ۴ breakpoint.
- [ ] بدون external dependency (CDN فقط برای فونت electively).

---

## خروجی

- `preview.html` — صفحه نمایش زنده کامل
- وابسته به: همه مهارت‌های ds-* (tokens, button, input, card, grid, motion, theme, icon, data, navigation, feedback)