---
name: ds-theme-dark-light
description: سیستم تم تیره/روشن (dark/light theme) باtransition نرم، دعم prefers-color-scheme و class-based toggle (data-theme) برای هر پروژه وب.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-theme-dark-light

> "تم تغییر màu نیست؛ تغییر Junct (معنای رنگ) است."

---

## هدف

ساخت لایه تم‌پذیر که**:
- متغیرهای `--ds-color-*` در حالت light (پیش‌فرض) تعریف شده باشند.
- حالت dark با `@media (prefers-color-scheme: dark)` و `[data-theme="dark"]` قابلة فعال‌سازی باشد.
- transition رنگ‌ها ۲۰۰ms Ease برای Prevention flashed.
- unterstützung high-contrast و reduced-media.
- راهنمای toggle با جاوااسکریپت (cls-toggle data-theme).

---

## چه زمانی فعال شود

وقتی]:
- پروژه باید حالت تیره و روشن داشته باشد.
- کاربر می‌خواهد تم خود را ذخیره و به یاد بسپارد (localStorage).
- دسترسی و Kontrast در هر دو حالت مهم است.

---

## گردش کار

1. **متغیرهای light در `:root` و dark در `@media (prefers-color-scheme: dark)` تعریف کنید.**
2. **همین مقادیر را تکرار کنید با `[data-theme="dark"]` برای toggle دستی.**
3. **رنگ‌های background، surface، card، text، border، focus-ring را در هر دو حالت معین کنید.**
4. ** transition را روی `background-color` و `color` و `border-color` اعمال کنید.**
5. **کد جاوااسکریپت برای toggle تم و ذخیره در localStorage بنویسید.**
6. **ページ را در هر دو حالت و در prefers-reduced-motion تست کنید.**

---

### نمونه کد (css-variables.css بخش تم)

```css
:root,
[data-theme="light"] {
  --ds-color-background: #ffffff;
  --ds-color-surface: #f8fafc;
  --ds-color-card: #ffffff;
  --ds-color-text-primary: #0f172a;
  --ds-color-text-secondary: #475569;
  --ds-color-text-muted: #94a3b8;
  --ds-color-border: #e2e8f0;
  --ds-color-focus-ring: rgba(37, 99, 235, 0.4);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ds-color-background: #0f172a;
    --ds-color-surface: #1e293b;
    --ds-color-card: #1e293b;
    --ds-color-text-primary: #f8fafc;
    --ds-color-text-secondary: #cbd5e1;
    --ds-color-text-muted: #94a3b8;
    --ds-color-border: #334155;
    --ds-color-focus-ring: rgba(161, 98, 7, 0.5);
  }
}

[data-theme="dark"] {
  --ds-color-background: #0f172a;
  --ds-color-surface: #1e293b;
  --ds-color-card: #1e293b;
  --ds-color-text-primary: #f8fafc;
  --ds-color-text-secondary: #cbd5e1;
  --ds-color-text-muted: #94a3b8;
  --ds-color-border: #334155;
  --ds-color-focus-ring: rgba(161, 98, 7, 0.5);
}

/* Transition for theme switch */
* {
  transition:
    background-color 200ms ease,
    color 200ms ease,
    border-color 200ms ease;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

### نمونه کد (toggle-theme.js)

```js
const STORAGE_KEY = 'ds-theme';
const THEME_ATTR = 'data-theme';

function getSavedTheme() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function applyTheme(theme) {
  document.documentElement.setAttribute(THEME_ATTR, theme);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
}

function initTheme() {
  const saved = getSavedTheme();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute(THEME_ATTR) || 'light';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

initTheme();
export { toggleTheme, initTheme, applyTheme };
```

---

## چک‌لیست کیفیت

- [ ] light و dark تمام متغیرهای رنگی را پوشش می‌دهند.
- [ ] prefers-color-scheme به کار گرفته می‌شود.
- [ ] data-theme برای toggle دستی کار می‌کند.
- [ ] تم در localStorage ذخیره و بازیابی می‌شود.
- [ ] transition ۲۰۰ms و reduced-mode respected است.
- [ ] Kontrast در هر دو حالت حداقل ۴٫۵:۱ است.
- [ ] فوکوس رینگ در dark هم قابل دیدن است.

---

## خروجی

- بخش تم در `tokens/css-variables.css`
- `js/toggle-theme.js` — اسکریپت تغییر تم
- `preview.html` — دکمه-toggle تم و نمایش components در هر دو حالت
- وابسته به: `ds-design-tokens`