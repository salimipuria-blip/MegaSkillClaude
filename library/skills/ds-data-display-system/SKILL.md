---
name: ds-data-display-system
description: سیستم نمایش داده (table، list، badge، skeleton، progress، statistic card) برای داشبوردها و صفحات غنی از داده، بر پایهٔ توکن ds-*.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-data-display-system

> "داده را به گونه‌ای نشان دهید که کاربر نی ammon است بهMeaning فکر کند."

---

## هدف

ساخت گروه نمایش داده که**:
- `.table` با border، zebra striping، hover row، fixed header.
- `.stat-card` برای نمایش عدد بزرگ (KPI) با trend arrow.
- `.badge` برای وضعیت (معمولاً由 ds-card-layout-system).
- `.skeleton` برای state لودینگ (shimmer از ds-motion-animation).
- `.progress-bar` و `.progress-ring` برای پیشرفت.
- `.list` و `.list-item` برای لیست‌های数据ی.
- تمام مقادیر از توکن ds-color/space/typography.

---

## چه زمانی فعال شود

وقتی]:
- داشبورد، جدول داده، یا صفحه Analytics می‌سازید.
- state لودینگ (skeleton) نیاز است.
- KPI و number display لازم است.

---

## gondول_Workflow

1. **`.table` بسازید**: width ۱۰۰٪، border-collapse، border border-color، th background surface.
2. **زebra striping**: `tr:nth-child(even)` background surface-hover.
3. **hover row**: background surface-hover، transition-base.
4. **`.stat-card`**: عدد بزرگ (text-3xl/4xl)، label muted، trend (success/warning).
5. **`.skeleton`**: background shimmer، border-radius-md، pulse animation.
6. **`.progress-bar`**: track surface، fill primary، height space-2.
7. **`.list-item`**: padding space-3 space-4، border-bottom divider.
8. **تست**: جدول با ۵+ سطر، سkeleon در Karten، progress-bar%.

---

### نمونه کد (components/data-display.css)

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--ds-font-sans);
  font-size: var(--ds-text-sm);
}

.table th,
.table td {
  padding: var(--ds-space-3) var(--ds-space-4);
  text-align: right;
  border-bottom: 1px solid var(--ds-color-border);
}

.table thead th {
  background-color: var(--ds-color-surface);
  color: var(--ds-color-text-secondary);
  font-weight: var(--ds-font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: var(--ds-text-xs);
}

.table tbody tr:hover {
  background-color: var(--ds-color-surface-hover);
}

.stat-card {
  background-color: var(--ds-color-card);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-lg);
  padding: var(--ds-space-6);
  box-shadow: var(--ds-shadow-sm);
}

.stat-value {
  font-family: var(--ds-font-mono);
  font-size: var(--ds-text-3xl);
  font-weight: var(--ds-font-weight-bold);
  color: var(--ds-color-text-primary);
}

.stat-label {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-trend {
  font-size: var(--ds-text-sm);
  font-weight: var(--ds-font-weight-medium);
}

.stat-trend.up { color: var(--ds-color-success); }
.stat-trend.down { color: var(--ds-color-error); }

.skeleton {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: ds-shimmer 1.5s infinite;
  border-radius: var(--ds-radius-md);
  height: 1em;
}

.skeleton-lg { height: 3rem; border-radius: var(--ds-radius-lg); }

.progress-track {
  width: 100%;
  height: var(--ds-space-2);
  background-color: var(--ds-color-surface);
  border-radius: var(--ds-radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: var(--ds-color-primary);
  border-radius: var(--ds-radius-full);
  transition: width var(--ds-transition-base);
}
```

---

## چک‌لیست کیفیت

- [ ] جدول zebra striping و hover row دارد.
- [ ] stat-card عدد بزرگ و trend رنگی.
- [ ] skeleton با shimmer از ds-motion-animation.
- [ ] progress-bar با transition width.
- [ ] تمام مقادیر از توکن ds-* هستند.
- [ ] responsive: جدول در موبایل scroll افقی نداشته باشد (wrapper overflow-auto).

---

## خروجی

- `components/data-display.css` — جدول، stat-card، skeleton، progress
- `preview.html` — نمایش جدول، KPI، سkeleon، progress
- وابسته به: `ds-design-tokens`, `ds-motion-animation`