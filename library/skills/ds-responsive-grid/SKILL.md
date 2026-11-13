---
name: ds-responsive-grid
description: سیستم شبکه (grid) ریسپانسیو با breakpoints، container، flex utilities و فاصله‌های یکپارچه با توکن ds-space.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-responsive-grid

> "شبکه نه برای جابجایی بلوک است، بلکه برای dancers کردن محتوا در هر اندازه-screen."

---

## هدف

ساخت لایه چیدمان که**:
- breakpoints: ۳۷۵px (xs), ۷۶۸px (sm), ۱۰۲۴px (md), ۱۴۴۰px (lg)
- `.container` با max-width و padding(opções)
- `.row` و `.col-1` تا `.col-12` (نظام ۱۲ستونی)
- `.flex` و `.flex-col`، `.items-center`، `.justify-between`
- `.gap-1` تا `.gap-24` (بر_base ds-space)
- `.hidden` / `.block`Conditional در breakpoint‌ها

---

## چه زمانی فعال شود

وقتی]:
- layut صفحات باید در موبایل، تبلت و دسکتاپ responsive باشد.
- системе flex و grid باید یک vener باشد.
- به utility-class سبک نیاز دارید بدون کتابخانه سنگین.

---

## گردش کار

1. **متغیرهای breakpoint را در CSS بسازید** (`--ds-break-sm: 768px` و…).
2. **`.container` بسازید**: max-width ۱۴۴۰px، margin-auto، padding space-4.
3. **نظام ۱۲ستونی**: `.row` (display flex، flex-wrap)، `.col-*` (width درصدی).
4. **فاصله‌ها**: `.gap-1` … `.gap-24` بر اساس ds-space.
5. **flex utilities**: `.flex`, `.flex-col`, `.items-center`, `.justify-between`, `.justify-center`.
6. **Responsive utilities**: `.hidden-sm`, `.block-lg` با @media.
7. **تست**: نمایش ۱، ۲، ۳، ۴ ستونه در ۳۷۵px، ۷۶۸px، ۱۰۲۴px، ۱۴۴۰px.

---

### نمونه کد (components/grid.css)

```css
:root {
  --ds-break-xs: 375px;
  --ds-break-sm: 768px;
  --ds-break-md: 1024px;
  --ds-break-lg: 1440px;
}

.container {
  width: 100%;
  max-width: 1440px;
  margin-left: auto;
  margin-right: auto;
  padding-left: var(--ds-space-4);
  padding-right: var(--ds-space-4);
  box-sizing: border-box;
}

.row {
  display: flex;
  flex-wrap: wrap;
  margin-left: calc(var(--ds-space-4) * -1);
  margin-right: calc(var(--ds-space-4) * -1);
}

.col {
  flex: 1 1 0%;
  padding-left: var(--ds-space-4);
  padding-right: var(--ds-space-4);
  box-sizing: border-box;
}

.col-1 { flex-basis: 8.333333%; max-width: 8.333333%; }
.col-2 { flex-basis: 16.666667%; max-width: 16.666667%; }
.col-3 { flex-basis: 25%; max-width: 25%; }
.col-4 { flex-basis: 33.333333%; max-width: 33.333333%; }
.col-6 { flex-basis: 50%; max-width: 50%; }
.col-8 { flex-basis: 66.666667%; max-width: 66.666667%; }
.col-12 { flex-basis: 100%; max-width: 100%; }

/* Gap utilities */
.gap-1 { gap: var(--ds-space-1); }
.gap-2 { gap: var(--ds-space-2); }
.gap-3 { gap: var(--ds-space-3); }
.gap-4 { gap: var(--ds-space-4); }
.gap-6 { gap: var(--ds-space-6); }
.gap-8 { gap: var(--ds-space-8); }
.gap-12 { gap: var(--ds-space-12); }

/* Flex utilities */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }

/* Responsive hide/show */
.hidden { display: none !important; }
.block { display: block !important; }

@media (max-width: 768px) {
  .hidden-sm { display: none !important; }
  .block-sm { display: block !important; }
  .col-sm-12 { flex-basis: 100%; max-width: 100%; }
}

@media (min-width: 1024px) {
  .hidden-lg { display: none !important; }
}
```

---

## چک‌لیست کیفیت

- [ ] چهار breakpoint تعریف شده و تست شده.
- [ ] `.container` max-width ۱۴۴۰px دارد.
- [ ] سیستم ۱۲ستونی کامل است (col-1 … col-12).
- [ ] gap utilities بر Base ds-space هستند.
- [ ] flex utilities برای چیدمان سریع وجود دارند.
- [ ] در ۳۷۵px شبکه تک‌ستونه و readable است.
- [ ] بدون horizontal scroll در هر اندازه-screen.

---

## خروجی

- `components/grid.css` — سیستم شبکه و flex utilities
- `preview.html` — نمایش responsive grid در ۴ breakpoints
- وابسته به: `ds-design-tokens`