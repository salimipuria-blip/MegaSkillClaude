---
name: ds-icon-system
description: سیستم آیکون SVG حرفه‌ای: naming convention، دسته‌بندی (UI، Brand، Action، Status)، اندازه (xs→xl)، رنگ از توکن، و sled-import.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-icon-system

> "هیچ‌وقت emoji به عنوان آیکون استفاده نکنید؛ فقط SVG."

---

## هدف

ساخت گروه آیکون که**:
- تمام آیکون‌ها SVG inline یا symbol sprite باشند.
- نام‌گذاری मेंنول: `icon-[category]-[name]` (مثلاً `icon-ui-search`, `icon-action-save`).
- اندازه‌ها: `icon-xs` (۱۶px), `icon-sm` (۲۰px), `icon-md` (۲۴px), `icon-lg` (۳۲px), `icon-xl` (۴۸px).
- رنگ از `currentColor` و `--ds-color-text-*` مشتق شده.
- دسته‌بندی: ui، brand، action، status، alert.
- بدون emoji، بدون فونت آیکون 외부 (اختیاری Lucide/Heroicons sebagai مرجع).

---

## چه زمانی فعال شود

وقتی]:
- دکمه، ورودی، کارت، navigation نیاز به آیکون دارد.
- synchronized icon set در همه صفحات لازم است.
- emoji استفاده شده است و باید جایگزین شود.

---

## gondول_Workflow

1. **پوشه بسازید**: `assets/icons/` و هر SVG را جداگانه ذخیره کنید.
2. **نام‌گذاری**: `icon-ui-menu.svg`, `icon-action-save.svg`, `icon-status-success.svg`.
3. **viewBox**: همه `0 0 24 24` (یا ۱۶×۱۶ برای xs).
4. **stroke/fill**: `stroke="currentColor"` و `fill="none"` برای machine-colorability.
5. **کلاس‌ها**: `.icon-xs` … `.icon-xl` با width/height و vertical-align.
6. **رنگ**: `color: var(--ds-color-text-primary)` برای وراثت currentColor.
7. **تست**: هر آیکون در dark و light و هر اندازه نمایش داده شود.

---

### نمونه کد (components/icons.css)

```css
.icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
  fill: currentColor;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-xs { font-size: 16px; }
.icon-sm { font-size: 20px; }
.icon-md { font-size: 24px; }
.icon-lg { font-size: 32px; }
.icon-xl { font-size: 48px; }

.icon-color-primary { color: var(--ds-color-primary); }
.icon-color-success { color: var(--ds-color-success); }
.icon-color-error { color: var(--ds-color-error); }
.icon-color-warning { color: var(--ds-color-warning); }
.icon-color-muted { color: var(--ds-color-text-muted); }

/* Anti-pattern enforcement: no emoji icons */
[role="img"] emoji, .emoji-icon { display: none !important; }
```

### نمونه SVG (icon-ui-search.svg)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="11" cy="11" r="8"/>
  <path d="m21 21-4.3-4.3"/>
</svg>
```

---

## چک‌لیست کیفیت

- [ ] هیچ emoji به عنوان آیکون نیست.
- [ ] تمام آیکون‌ها SVG و currentColor.
- [ ] نام‌گذاری منسجم (icon-category-name).
- [ ] اندازه‌ها xs-xl تعریف شده.
- [ ] در dark و light خوانایی دارد.
- [ ] فونت آیکون خارجی نیازی نیست.

---

## خروجی

- `assets/icons/*.svg` — فایل‌های آیکون
- `components/icons.css` — استایل آیکون‌ها
- `preview.html` — نمایش همه آیکون‌ها در اندازه‌ها و رنگ‌ها
- وابسته به: `ds-design-tokens`