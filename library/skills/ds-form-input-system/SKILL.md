---
name: ds-form-input-system
description: سیستم ورودی (form inputs) حرفه‌ای شامل input، select، textarea، چک‌باکس، رادیو و helium field با لیبل، متن راهنما، خطا و حالت focus بر پایه توکن‌های ds-design-tokens.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-form-input-system

> "فرم را به گونه‌ای بسازید که کاربر هرگز ن.errorهای پنهان देखे؛ هر فیلد یک راهنمای واضح داشته باشد."

---

## هدف

ساخت یک مجموعه ورودی کامل و قابل دسترس که**:
- با `.field`گروه‌بندی شود (دیس-play flex column، gap).
- شامل `<label>`، `<input>`، `<select>`، `<textarea>` و `<input type="checkbox|radio">` باشد.
- متن راهنما (`.helper-text`) و خطا (`.error-text`) داشته باشد.
- حالت focus با ring و border رنگ اصلی مشخص شود.
- حالت خطا (`.error`) با رنگ `--ds-color-error` و shadow pigments باشد.
- حالت غیرفعال (`disabled`) با background سطح و cursor-not-allowed باشد.
- آنالیوز (monospace) برای کد‌لاین (`<code>`) داخل helper داشته باشد.

---

## چه زمانی فعال شود

وقتی]:
- صفحه فرم (登録، ورود، تنظیمات، تماس) می‌سازید.
- نیاز به اعتبارسنجی بصری (خطا و راهنمای کاربری) دارید.
- دسترسی keyboard و screen reader برای ورودی‌ها ضروری است.

---

## گردش کار

1. **ساخت `.field`**: flex-direction column، gap ۸px، margin-bottom ۲۰px.
2. **لیبل**: font-size ۰٫۷۵rem، font-weight ۶۰۰، uppercase، رنگ muted.
3. **ورودی‌ها**: padding ۱۲px ۱۶px، border ۱px border-color، border-radius ۸px، width ۱۰۰٪، box-sizing border-box.
4. **فوکوس**: outline-none، border-color رنگ اصلی، box-shadow ۰ ۰ ۰ ۲px focus-ring.
5. **خطا**: border-color قرمز، box-shadowلigne قرمز شفاف.
6. **استاخر (select)**: apparence-none، فلش iconsvg به عنوان پس‌زمینه سمت راست.
7. **Textarea**: min-height ۱۲۰px، resize vertical، font-family monospace.
8. **چک‌باکس/رادیو**: accent-color رنگ اصلی، cursor pointer، grouped در `.field-checkbox` و `.field-radio`.
9. **کد‌لاین**: `<code>` با background سطح و رنگ کد، برای نمایش مثال در helper-text.

---

### نمونه کد (components/inputs.css)

```css
.field {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
  margin-bottom: var(--ds-space-5);
}

.field label {
  font-family: var(--ds-font-sans);
  font-size: var(--ds-text-xs);
  font-weight: var(--ds-font-weight-semibold);
  color: var(--ds-color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field .helper-text {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-muted);
  font-family: var(--ds-font-mono);
}

.field .error-text {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-error);
  font-family: var(--ds-font-mono);
}

.input,
.select,
.textarea {
  font-family: var(--ds-font-sans);
  font-size: var(--ds-text-sm);
  padding: var(--ds-space-2) var(--ds-space-3);
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background-color: var(--ds-color-surface);
  color: var(--ds-color-text-primary);
  transition:
    border-color var(--ds-transition-base),
    box-shadow var(--ds-transition-base);
  width: 100%;
  box-sizing: border-box;
}

.input::placeholder,
.textarea::placeholder {
  color: var(--ds-color-text-muted);
}

.input:focus,
.select:focus,
.textarea:focus {
  outline: none;
  border-color: var(--ds-color-primary);
  box-shadow: 0 0 0 2px var(--ds-color-focus-ring);
}

.input:disabled,
.select:disabled,
.textarea:disabled {
  background-color: #f1f5f9;
  color: var(--ds-color-text-muted);
  cursor: not-allowed;
  border-color: #e2e8f0;
}

.input.error,
.select.error,
.textarea.error {
  border-color: var(--ds-color-error);
}
.input.error:focus,
.select.error:focus,
.textarea.error:focus {
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2);
}

.textarea {
  min-height: 120px;
  resize: vertical;
  line-height: var(--ds-line-height-relaxed);
  font-family: var(--ds-font-mono);
  font-size: var(--ds-text-sm);
}

.select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right var(--ds-space-3) center;
  background-size: 1em;
  padding-right: 2rem;
}

.code-inline {
  font-family: var(--ds-font-mono);
  font-size: 0.875em;
  background-color: #f1f5f9;
  color: #be185d;
  padding: 1px 4px;
  border-radius: var(--ds-radius-sm);
}

.input-checkbox,
.input-radio {
  width: 1rem;
  height: 1rem;
  accent-color: var(--ds-color-primary);
  cursor: pointer;
}

.field-checkbox,
.field-radio {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  cursor: pointer;
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-primary);
}
```

---

## چک‌لیست کیفیت

- [ ] هر فیلد دارای `<label>` یا `aria-label` است.
- [ ] `:focus-visible` با ring ۲px مشخص شده.
- [ ] حالت خطا با رنگ قرمز و متن error-text مشخص است.
- [ ] helper-text با فونت مونو برایExample کد.
- [ ] کلیه ورودی‌ها ۱۰۰٪ عرضfieldset را occupancy می‌کنند (responsive).
- [ ] checkbox/radio با accent-color رنگ اصلی.
- [ ] در حالت تیره خوانایی و Kontrast حفظ می‌شود.

---

## خروجی

- `components/inputs.css` — استایل ورودی‌ها و فیلدها
- `preview.html` — نمایش فرم کامل (success, error, disabled)
- وابسته به: `ds-design-tokens`