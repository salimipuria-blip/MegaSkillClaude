---
name: ds-card-layout-system
description: سیستم کارت و چیدمان (layout) حرفه‌ای شامل کارت، کدر، شبکه (grid)، badge، آواتار و بنر بر پایهٔ توکن‌های ds-design-tokens.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-card-layout-system

> "کارت واحدِ زیرساختی UI است؛ چیدمانnetwork است؛ هر دو باید با توکن واحد رفتار کنند."

---

## هدف

ساخت گروه کامپوننت چیدمان و نمایش محتوا که**:
- `.card` با border، سایه، گرد Robert و حالت hover لایفت
- `.card-header`، `.card-body`، `.card-footer` برایتقسیم منطقی محتوا
- `.card-interactive` با cursor-pointer و transición منسجم
- شبکه (grid) ریسپانسیو با breakpoints ۳۷۵px تا ۱۴۴۰px
- `.badge` برای وضعیت (success, warning, error, info, primary)
- `.avatar` با سایز xs→xl و border قابل تنظیم
- تمام مقادیر از `--ds-color-*`، `--ds-space-*`، `--ds-radius-*`، `--ds-shadow-*` مشتق شده

---

## چه زمانی فعال شود

وقتی]:
- بخش نمایش محتوا (کارت محصول، کادر اعلان، پروفایل، جدول.Grid) می‌سازید.
- نیاز به چیدمان شبکه‌ای ریسپانسیو دارید.
- badge و آواتار باید در همه صفحات یک समान 보이ند.

---

## گردش کار

1. **فایل پایه را import کنید**: `tokens/css-variables.css` از `ds-design-tokens`.
2. **`.card` را بسازید**: background card، border ۱px border-color، border-radius-lg، shadow-sm، overflow-hidden.
3. **حالت hover**: border-color-border-hover، shadow-md، translateY(-۴px) باtransition-base.
4. **بخش‌های داخلی**: `.card-header` (padding، border-bottom div)، `.card-body` (padding)، `.card-footer` (flex، gap، background surface).
5. ** `.card-interactive`**: cursor-pointer، transition همهٔ پراپرتی‌ها، بدون shift Layout در hover.
6. **شبکه**: `.grid` با display grid، gap space-۸؛ `.grid-cols-1/2/3/4`؛ در ≤۷۶۸px تک‌ستونه.
7. **Badge**: inline-flex، border-radius-full، 텍ست-xs، وزن-semibold، حروف بزرگ، رنگ‌های semantic.
8. **آواتار**: inline-flex، border-radius-full،overflow-hidden، border ۱px، background-surface، سایز xs-xl.
9. **تست**: `preview.html` با کارت‌های مختلف (default, elevated, outline, colorful) در موبایل و دسکتاپ.

---

### نمونه کد (components/cards.css)

```css
.card {
  background-color: var(--ds-color-card);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-sm);
  transition:
    box-shadow var(--ds-transition-base),
    border-color var(--ds-transition-base),
    transform var(--ds-transition-fast);
  overflow: hidden;
}

.card:hover {
  box-shadow: var(--ds-shadow-md);
  border-color: var(--ds-color-border-hover);
  transform: translateY(-4px);
}

.card > *:last-child { margin-bottom: 0; }

.card-header {
  padding: var(--ds-space-4) var(--ds-space-5);
  border-bottom: 1px solid var(--ds-color-divider);
  background-color: var(--ds-color-surface);
}

.card-body { padding: var(--ds-space-5); }

.card-footer {
  padding: var(--ds-space-3) var(--ds-space-5);
  border-top: 1px solid var(--ds-color-divider);
  background-color: var(--ds-color-surface);
  display: flex;
  justify-content: flex-end;
  gap: var(--ds-space-2);
}

.card-interactive { cursor: pointer; }
.card-interactive:hover { transform: translateY(-4px); }

.card-image {
  width: 100%;
  height: 160px;
  object-fit: cover;
  background-color: var(--ds-color-surface);
}

/* Variants */
.card-elevated { box-shadow: var(--ds-shadow-lg); border: none; }
.card-outline { box-shadow: none; border: 1px solid var(--ds-color-border); }

/* Grid */
.grid { display: grid; gap: var(--ds-space-4); }
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }

@media (max-width: 768px) {
  .grid-cols-2, .grid-cols-3, .grid-cols-4 {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
}

/* Badge */
.badge {
  display: inline-flex;
  align-items: center;
  font-family: var(--ds-font-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-font-weight-semibold);
  padding: 2px 8px;
  border-radius: var(--ds-radius-full);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-default { background-color: var(--ds-color-surface); color: var(--ds-color-text-secondary); border: 1px solid var(--ds-color-border); }
.badge-primary { background-color: var(--ds-color-primary); color: var(--ds-color-on-primary); }
.badge-success { background-color: rgba(16,185,129,0.1); color: var(--ds-color-success); border: 1px solid rgba(16,185,129,0.2); }
.badge-warning { background-color: rgba(245,158,11,0.1); color: var(--ds-color-warning); border: 1px solid rgba(245,158,11,0.2); }
.badge-error { background-color: rgba(239,68,68,0.1); color: var(--ds-color-error); border: 1px solid rgba(239,68,68,0.2); }
.badge-info { background-color: rgba(59,130,246,0.1); color: var(--ds-color-info); border: 1px solid rgba(59,130,246,0.2); }

/* Avatar */
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--ds-font-sans);
  font-weight: var(--ds-font-weight-semibold);
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--ds-color-surface);
  color: var(--ds-color-text-primary);
  border: 1px solid var(--ds-color-border);
  box-shadow: var(--ds-shadow-sm);
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-xs { width: 20px; height: 20px; font-size: var(--ds-text-xs); }
.avatar-sm { width: 26px; height: 26px; font-size: var(--ds-text-xs); }
.avatar-md { width: 34px; height: 34px; font-size: var(--ds-text-sm); }
.avatar-lg { width: 42px; height: 42px; font-size: var(--ds-text-base); }
```

---

## چک‌لیست کیفیت

- [ ] کارت overflow-hidden دارد (عکس recombinant نшаwd)
- [ ] hover فقط card را لایفت می‌کند، 레이аут جابه‌جا نمی‌شود
- [ ] badge رنگ‌های semantic و kontrast AA دارد
- [ ] آواتار border-radius-full وoverflow-hidden است
- [ ] شبکه در ۷۶۸px تک‌ستونه می‌شود
- [ ] تمام مقادیر از توکن ds-* هستند، هاردکد نیست
- [ ] در حالت تیره خوانایی حفظ می‌شود

---

## خروجی

- `components/cards.css` — کارت، grille، badge، آواتار
- `preview.html` — نمایش کارت‌های مختلف و شبکه ریسپانسیو
- وابسته به: `ds-design-tokens`