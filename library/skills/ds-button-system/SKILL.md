---
name: ds-button-system
description: سیستم کامپوننت دکمه حرفه‌ای با همه variantes (primary، secondary، outline، ghost، destructive، icon)، سایزها (xs→xl)، حالت‌های hover/focus/disabled و دکمه‌چین (toolbar/group) بر پایهٔ توکن‌های ds-design-tokens.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-button-system

> "دکمه، primer تعامل کاربر است. باید دیدنی باشد، قابل کلیک، و حالت آن در هر دستگاه مشخص باشد."

---

## هدف

ساخت یک سری دکمه کاملاً ریسپانسیو و قابل دسترس (accessible) که**:
- از توکن‌های `--ds-color-*`، `--ds-space-*`، `--ds-radius-*` و `--ds-transition-*` استفاده می‌کند.
- سایز‌های `xs`, `sm`, `md`, `lg`, `xl` و حالت `full-width` دارد.
- Varianتهای `primary`, `secondary`, `outline`, `ghost`, `destructive`, `icon` را پوشش می‌دهد.
- حالت `:hover`, `:active`, `:focus-visible`, و `:disabled` را volledig تعریف می‌کند.
- دکمه‌چین (`.btn-toolbar`) برای گروه‌بندی دکمه‌ها در نوار ابزار فراهم می‌کند.

---

## چه زمانی فعال شود

وقتی]:
- نیاز به دکمه در هر صفحه یا کامپوننت دارید.
- می‌خواهید همه دکمه‌های پروژه یک ظاهر و رفتار unit have.
- accessed by keyboard و screen reader مهم است (دکمه باید focus-visible داشته باشد).

---

## گردش کار

1. **فایل پایه را import کنید**: `tokens/css-variables.css` از `ds-design-tokens` را قبل از این فایل لود کنید.
2. **کلاس پایه `.btn` را تعریف کنید**: display inline-flex، border-none، cursor-pointer، transition همه پراپرتی‌ها.
3. **سایزها را اضافه کنید**: `.btn-xs` (۴px ۸px)، `.btn-sm` (۶px ۱۲px)، `.btn-md` (۸px ۱۶px)، `.btn-lg` (۱۰px ۲۰px)، `.btn-xl` (۱۲px ۲۴px).
4. **Varianها را بسازید**: primary (background رنگ اصلی)، secondary (background سطح)، outline (محوطه با border)، ghost (بدون background، رنگ-muted)، destructive (قرمز).
5. **حالت interactivo**: hover رنگ را کمی تیره‌تر می‌کند؛ activeScale ۰٫۹۸ می‌کند؛ focus-visible را با ring ۲px مشخص می‌کند.
6. **دکمه‌چین**: `.btn-toolbar` با gap ۸px و border دور گروه.
7. **آیکون**: `.btn-icon` با aspect-ratio ۱/۱ وborder-radius पूर्ण.
8. **تست**: صفحه `preview.html` بسازید و همه دکمه‌ها را در Light/Dark و موبایل تست کنید.

---

### نمونه کد (components/buttons.css)

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-2);
  font-family: var(--ds-font-sans);
  font-size: var(--ds-text-base);
  font-weight: var(--ds-font-weight-medium);
  line-height: var(--ds-line-height-normal);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
  transition:
    background-color var(--ds-transition-base),
    color var(--ds-transition-base),
    border-color var(--ds-transition-base),
    transform var(--ds-transition-fast);
  touch-action: manipulation;
  user-select: none;
  text-decoration: none;
}

.btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ds-color-focus-ring);
}

.btn:active:not(:disabled) {
  transform: scale(0.98);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.btn svg {
  width: 1em;
  height: 1em;
  fill: currentColor;
}

/* Sizes */
.btn-xs { padding: 4px 8px; font-size: var(--ds-text-xs); border-radius: var(--ds-radius-sm); }
.btn-sm { padding: 6px 12px; font-size: var(--ds-text-sm); }
.btn-md { padding: 8px 16px; font-size: var(--ds-text-base); }
.btn-lg { padding: 10px 20px; font-size: var(--ds-text-lg); border-radius: var(--ds-radius-lg); }
.btn-xl { padding: 12px 24px; font-size: var(--ds-text-xl); border-radius: var(--ds-radius-xl); }
.btn-full { width: 100%; }

/* Variants */
.btn-primary {
  background-color: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  border-color: var(--ds-color-primary);
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--ds-color-primary-hover);
  border-color: var(--ds-color-primary-hover);
}

.btn-secondary { background-color: var(--ds-color-surface); color: var(--ds-color-text-primary); }
.btn-secondary:hover:not(:disabled) { background-color: #f1f5f9; }

.btn-outline { background-color: transparent; color: var(--ds-color-text-primary); }
.btn-outline:hover:not(:disabled) { border-color: var(--ds-color-primary); color: var(--ds-color-primary); }

.btn-ghost { background-color: transparent; border: none; color: var(--ds-color-text-muted); padding: 6px 10px; }
.btn-ghost:hover:not(:disabled) { background-color: #f1f5f9; color: var(--ds-color-text-primary); }

.btn-destructive { background-color: var(--ds-color-error); color: #ffffff; border-color: var(--ds-color-error); }
.btn-destructive:hover:not(:disabled) { background-color: #dc2626; }

/* Icon button */
.btn-icon { padding: var(--ds-space-2); aspect-ratio: 1 / 1; min-width: auto; border-radius: var(--ds-radius-md); }
.btn-icon svg { width: 1.1em; height: 1.1em; }

/* Toolbar */
.btn-toolbar {
  display: inline-flex;
  gap: var(--ds-space-1);
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-color-border);
  background-color: var(--ds-color-surface);
}
.btn-toolbar .btn { border-radius: 0; border-left-width: 0; }
.btn-toolbar .btn:first-child { border-top-left-radius: var(--ds-radius-md); border-bottom-left-radius: var(--ds-radius-md); border-left-width: 1px; }
.btn-toolbar .btn:last-child { border-top-right-radius: var(--ds-radius-md); border-bottom-right-radius: var(--ds-radius-md); }
```

---

## چک‌لیست کیفیت

- [ ] هر دکمه `cursor: pointer` دارد.
- [ ] `:focus-visible` با ring قابل دیدن است (keyboard navigation).
- [ ] `:disabled` با `opacity: 0.5` و `pointer-events: none` غیرفعال می‌شود.
- [ ] hover و active با 트랜زیشن ۱۵۰–۲۰۰ms 부드러운 است.
- [ ] سایز لمس (touch target) حداقل ۴۴×۴۴ پیکسل در موبایل.
- [ ] بدون emoji به عنوان آیکون (فقط SVG).
- [ ] در حالت تیره (dark) خوانایی حفظ می‌شود.

---

## خروجی

- `components/buttons.css` — استایل‌های دکمه و دکمه‌چین
- `preview.html` — نمایش همه variant، سایز و حالت دکمه‌ها
- وابسته به: `ds-design-tokens` (توکن‌ها)