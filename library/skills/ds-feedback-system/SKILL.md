---
name: ds-feedback-system
description: سیستم بازخورد کاربر (alert، toast، modal، tooltip، progress، empty state) با انیمیشن، focus-trap و دسترسی کامل.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-feedback-system

> "بازخورد بلافاصله، واضح و غیرپرداختی باشد."

---

## هدف

ساخت گروه بازخورد که**:
- `.alert`: success/warning/error/info با border-left رنگ و آیکون.
- `.toast`: reposition bottom-right، auto-dismiss ۵ ثانیه، dismiss manual.
- `.modal`: backdrop blur، focus-trap، ESC بسته شدن، trap-focus.
- `.tooltip`: hover trigger، arrow، positioning (top/bottom/left/right).
- `.empty-state`: ilustración، عنوان،-action button.
- `.progress`: لودینگ spinner یا bar.
- همه با transition ds-motion-animation و focus-visible.

---

## چه زمانی فعال شود

وقتی]:
- اعلان یا هشدار به کاربر نیاز است.
- modal برای تایید یا فرم لازمه.
- toast برای پیام موقت لازمه.
- tooltip برای توضیح آیکون/دکمه لازمه.

---

## gondول_Workflow

1. **`.alert` بسازید**: padding space-4 space-5، border-radius-md، border-left ۴px رنگ-state، flex row.
2. **`.toast`**: fixed bottom-right، gap space-3، animation slide-up، dismiss دکمه X.
3. **`.modal`**: backdrop rgba blur، modal-card background card، padding space-6، border-radius-lg، focus-trap، ESC close.
4. **`.tooltip`**: absolute، background text-inverse، text-xs، padding space-1 space-2، border-radius-sm، arrow با border.
5. **`.empty-state`**: text-center، py space-12، acción btn-primary.
6. **تست**: alert clipها، toast ظاهر/پیچیده، modal focus-trap و ESC، tooltip hover.

---

### نمونه کد (components/feedback.css)

```css
.alert {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  padding: var(--ds-space-4) var(--ds-space-5);
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-color-border);
  background-color: var(--ds-color-surface);
  font-size: var(--ds-text-sm);
  animation: ds-slide-up var(--ds-transition-base) both;
}

.alert-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
}

.alert-success { background-color: rgba(16,185,129,0.1); border-left-color: var(--ds-color-success); color: var(--ds-color-success); }
.alert-warning { background-color: rgba(245,158,11,0.1); border-left-color: var(--ds-color-warning); color: var(--ds-color-warning); }
.alert-error { background-color: rgba(239,68,68,0.1); border-left-color: var(--ds-color-error); color: var(--ds-color-error); }
.alert-info { background-color: rgba(59,130,246,0.1); border-left-color: var(--ds-color-info); color: var(--ds-color-info); }

.alert-title {
  font-weight: var(--ds-font-weight-semibold);
  margin-right: var(--ds-space-2);
}

.alert-dismiss {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ds-color-text-muted);
  padding: var(--ds-space-1);
}

/* Toast */
.toast-container {
  position: fixed;
  bottom: var(--ds-space-6);
  right: var(--ds-space-6);
  z-index: var(--ds-z-tooltip);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
}

.toast {
  min-width: 300px;
  padding: var(--ds-space-4) var(--ds-space-5);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xl);
  background-color: var(--ds-color-card);
  color: var(--ds-color-text-primary);
  border: 1px solid var(--ds-color-border);
  animation: ds-slide-up var(--ds-transition-slow) both;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  z-index: var(--ds-z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ds-space-4);
  animation: ds-fade-in var(--ds-transition-base) both;
}

.modal {
  background-color: var(--ds-color-card);
  border-radius: var(--ds-radius-lg);
  padding: var(--ds-space-6);
  max-width: 560px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--ds-shadow-xl);
  animation: ds-scale-in var(--ds-transition-base) both;
}

.modal-close {
  position: absolute;
  top: var(--ds-space-3);
  left: var(--ds-space-3); /* RTL-adjusted: left */
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ds-color-text-muted);
  padding: var(--ds-space-1);
}

/* Tooltip */
.tooltip {
  position: absolute;
  z-index: var(--ds-z-tooltip);
  font-size: var(--ds-text-xs);
  background-color: var(--ds-color-background-inverse);
  color: #ffffff;
  padding: var(--ds-space-1) var(--ds-space-2);
  border-radius: var(--ds-radius-sm);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ds-transition-fast);
}

.tooltip.show { opacity: 1; }

/* Empty state */
.empty-state {
  text-align: center;
  padding: var(--ds-space-12) var(--ds-space-8);
  color: var(--ds-color-text-muted);
}

.empty-state-title {
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-font-weight-semibold);
  color: var(--ds-color-text-primary);
  margin: var(--ds-space-3) 0 var(--ds-space-2) 0;
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  .alert, .toast, .modal-overlay, .modal { animation: none !important; }
}
```

---

## چک‌لیست کیفیت

- [ ] alert هر ۴ وضعیت (success/warning/error/info) دارد.
- [ ] toast auto-dismiss و dismiss manual.
- [ ] modal backdrop blur، focus-trap، ESC close.
- [ ] tooltip hover-trigger و positioning.
- [ ] empty-state با action button.
- [ ] تمام چیزها reduced-motion را احترم می‌کنند.
- [ ] focus-visible روی دکمه‌های dismiss/close.

---

## خروجی

- `components/feedback.css` — alert، toast، modal، tooltip، empty-state
- `preview.html` — نمایش هر نوع بازخورد
- وابسته به: `ds-design-tokens`, `ds-motion-animation`, `ds-button-system`, `ds-accessibility-a11y`