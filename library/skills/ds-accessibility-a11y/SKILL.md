---
name: ds-accessibility-a11y
description: دستورات و چک‌لیست دسترسی (a11y) برای همه کامپوننت‌ها:WCAG AA، readur focus، Kontrast، ARIA، صفحه کلید، reduced-motion و تست‌ها.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-accessibility-a11y

> "دسترسی ویژگی اضافه نیست؛ основа UI است."

---

## هدف

ساخت لایه دسترسی کامل که**:
- Kontrast متن و پس‌زمینه حداقل ۴٫۵:۱ (WCAG AA) و ۳:۱ برای calf-gray/UI elements.
- `:focus-visible` روی همه عناصرب کلیک‌پذیر (دکمه، ورودی، لینک، تاب).
- tutte عناصرب interactive می‌بایست keyboard-focusable باشند.
- ARIA-label/aria-describedby در ورودی‌ها، دکمه‌های آیکون‌دار، modal، tooltip.
- prefer-reduced-motion بهcharacterized است.
- scroll افقی در ۳۲۰px+ وجود ندارد.
- زبان صفحه (lang="fa") و جهت RTL صحيح است.

---

## چه زمانی فعال شود

وقتی]:
- هر کامپوننت یا صفحه ساخته می‌شود.
- تست دسترسی قبل از تحویل لازم است.
- conformance WCAG AA مورد نیاز است.

---

## گردش کار

1. **焦点 trạng thái**: همه دکمه/ورودی/لینک `:focus-visible` با ring ۲px دارند.
2. **Kontrast**: متن اصلی روی background حداقل ۴٫۵:۱؛ متن-muted حداقل ۳:۱.
3. **Keyboard**: Tab'ordre منطقی است؛ focus Trap در modal/dialog.
4. **ARIA**: دکمه آیکون دار `aria-label`؛ ورودی‌ها `aria-describedby` به helper/error.
5. **ALT 텍ست**: تصاویر meaningful `alt` دارند؛ ornamental `alt=""`.
6. **RTL**: `dir="rtl"` و `lang="fa"` در `<html>`.
7. **تست**: صفحه را فقط با صفحه‌کلید ناوبری کنید؛ از screen reader استفاده کنید.
8. **چک‌لیست**: قبل از هر PR، چک‌لیست زیر را تیک بزنید.

---

### نمونه چک‌لیست دسترسی (Markdown)

```markdown
## چک‌لیست a11y (WCAG AA)

- [ ] تمام دکمه‌ها `cursor: pointer` و `:focus-visible` دارند
- [ ] Kontrast متن≥ ۴.۵:۱، متن-muted≥ ۳:۱
- [ ] همه ورودی‌ها دارای `<label>` یا `aria-label` هستند
- [ ] دکمه‌های آیکون‌دار `aria-label` دارند
- [ ] تصاویر meaningful دارای `alt`، Ornamental دارای `alt=""`
- [ ] `<html lang="fa" dir="rtl">` existiert
- [ ] prefers-reduced-motion respected است
- [ ] در ۳۷۵px scroll افقی وجود ندارد
- [ ] modal focus-trap و Escape ببندد
- [ ] رنگ تنها conveyer معنا نیست (با آیکون/متن همراه)
```

---

## چک‌لیست کیفیت

- [ ] تمام موارد چک‌لیست بالا در هر کامپوننت اعمال شده.
- [ ] focused element در screen reader قابل شناخت است.
- [ ] رنگ نبounced تنها کارrier معنا باشد.
- [ ] skip-to-content لینک در هر صفحه وجود دارد (اختیاری empfohlen).

---

## خروجی

- `docs/a11y-checklist.md` — چک‌لیست دسترس‌پذیری
- `components/a11y.css` — استایل focus-visible، skip-link، sr-only
- `preview.html` — نمایش الفوکوس، contrast، RTL
- وابسته به: `ds-design-tokens`, `ds-button-system`, `ds-form-input-system`