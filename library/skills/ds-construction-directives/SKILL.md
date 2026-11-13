---
name: ds-construction-directives
description: دستورالعمل ساخت و assemblage یک سیستم طراحی از ابتدا: ترتیب المهارت‌ها، CI، نسخه‌بندی، اليد-import، و استراتژی hand-off به Figma/کد.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-construction-directives

> "ساخت سیستم طراحی Maraton است، نه دوड़؛ ترتیب المهارت‌ها مشخص است."

---

## هدف

راهنمای مرحلهٔی ساخت یک سیستم طراحی حرفه‌ای که**:
- ترتیب المهارت‌ها: ds-design-tokens → ds-button-system → ds-form-input-system → ds-card-layout-system → ds-theme-dark-light → ds-responsive-grid → ds-motion-animation → ds-accessibility-a11y → ds-icon-system → ds-data-display-system → ds-navigation-system → ds-feedback-system → ds-design-system-master → ds-component-preview → ds-professional-references.
- دستور import صحیح (tokens قبل از components).
- CI check: هر PR باید skill‌ها را بیلد کند و preview.html را باز کند.
- نسخه‌بندی: semver برای توکن‌ها و components.
- استراتژی hand-off: فایل JSON برای Figma، CSS برای کد، MASTER.md برای مستندات.

---

## چه زمانی فعال شود

وقتی]:
- از صفر سیستم طراحی می‌سازید.
- مهارت‌های ds-* را ترکیب می‌کنید.
- به CI و hand-off نیاز دارید.

---

## gondول_ترتیب ساخت (Phases)

### فاز ۱: پایگاه (Foundation)
1. `ds-design-tokens` — توکن‌های رنگ، فاصله، تایپوGRAPHY، سایه، Robert، transition.
2. `ds-theme-dark-light` — تم تیره/روشن و toggle.
3. `ds-accessibility-a11y` —法 قاعدة دسترسی و focus-visible.

### فاز ۲: کامپوننت‌های پایه (Core Components)
4. `ds-button-system` — دکمه‌ها و دکمه‌چین.
5. `ds-form-input-system` — ورودی‌ها، select، textarea، چک‌باکس.
6. `ds-card-layout-system` — کارت، شبکه، badge، آواتار.
7. `ds-responsive-grid` — شبکه ریسپانسیو و flex utilities.

### فاز ۳: حرکات و نمایش (Motion & Display)
8. `ds-motion-animation` — transition، keyframes، hover-lift.
9. `ds-icon-system` — آیکون SVG، naming، استفاده.
10. `ds-data-display-system` — جدول، لیست، progress، skeleton.
11. `ds-navigation-system` — nav، breadcrumb، tabs، pagination.
12. `ds-feedback-system` — alert، toast، modal، tooltip.

### فاز ۴: مستندات و پیش نمایش (Docs & Preview)
13. `ds-design-system-master` — MASTER.md و governance.
14. `ds-component-preview` — preview.html برای تست.
15. `ds-professional-references` — مراجع و تصمیمات.

---

## gondول_دستور import صحیح

```html
<!-- ۱. توکن‌ها (اولین فایل) -->
<link rel="stylesheet" href="tokens/css-variables.css">

<!-- ۲. تم (اختیاری) -->
<link rel="stylesheet" href="components/theme.css">

<!-- ۳. کامپوننت‌ها (بعد از توکن‌ها) -->
<link rel="stylesheet" href="components/buttons.css">
<link rel="stylesheet" href="components/inputs.css">
<link rel="stylesheet" href="components/cards.css">
<link rel="stylesheet" href="components/grid.css">
<link rel="stylesheet" href="components/motion.css">
<link rel="stylesheet" href="components/feedback.css">
```

---

## gondول_CI و نسخه‌بندی

```yaml
# .github/workflows/ds-ci.yml (نمونه)
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate Skill Frontmatter
        run: python3 scripts/validate_skill_frontmatter.py library/skills/ds-*/
      - name: Build Preview HTML
        run: python3 scripts/build_preview.py design-systems/*/preview.html
```

نسخه‌بندی: `MAJOR.MINOR.PATCH` برای هر ds-* skill. هر تغییر در توکن रंग = MAJOR؛ افزودن variante = MINOR؛ رفع Bug = PATCH.

---

## چک‌لیست کیفیت

- [ ] ترتیب المهارت‌ها رعایت شده (tokens اول، components بعد).
- [ ] import ترتیب صحیح (CSS variables قبل از components).
- [ ] هر skill فایل SKILL.md با frontmatter کامل دارد.
- [ ] هر component skill فایل preview.html دارد.
- [ ] چک‌لیست کیفیت هر skill در `## چک‌لیست کیفیت` ثبت شده.
- [ ] خروجی هر skill مشخص است (فایل‌ها و وابستگی‌ها).

---

## خروجی

- `docs/CONSTRUCTION.md` — راهنمای ساخت سیستم طراحی
- وابسته به: همه مهارت‌های ds-*