# 📘 INDEX — مهارت‌های سیستم طراحی (ds-*)

فهرست کامل مهارت‌های مگا‌اسکیل برای ساخت، توسعه و نگهداری سیستم طراحی حرفه‌ای. هر مهارت یک فایل `SKILL.md` دارد با ساختار مگا‌اسکیل (frontmatter + هدف + چه زمانی فعال شود + گردش کار + چک‌لیست کیفیت + خروجی).

---

## گروه۱: پایه (Foundation)

| مهارت | فایل | هدف chính | وابسته به |
|------|------|-----------|-----------|
| **ds-design-tokens** | `ds-design-tokens/SKILL.md` | توکن‌های رنگ، فاصله، تایپوGRAPHY، سایه، Robert، transition (CSS + JSON) | — |
| **ds-theme-dark-light** | `ds-theme-dark-light/SKILL.md` | تم تیره/روشن، toggle با data-theme، localStorage | ds-design-tokens |
| **ds-accessibility-a11y** | `ds-accessibility-a11y/SKILL.md` |WCAG AA، focus-visible، Kontrast، ARIA، RTL، reduced-motion | ds-design-tokens |

## گروه۲: کامپوننت‌های پایه (Core Components)

| مهارت | فایل | هدف chính | وابسته به |
|------|------|-----------|-----------|
| **ds-button-system** | `ds-button-system/SKILL.md` | دکمه‌ها (primary/secondary/outline/ghost/destructive/icon)، سایزها، دکمه‌چین | ds-design-tokens |
| **ds-form-input-system** | `ds-form-input-system/SKILL.md` | input/select/textarea/checkbox/radio، field، helper، error، focus ring | ds-design-tokens |
| **ds-card-layout-system** | `ds-card-layout-system/SKILL.md` | کارت، شبکه (grid)، badge، آواتار، ch_layout | ds-design-tokens |
| **ds-responsive-grid** | `ds-responsive-grid/SKILL.md` | breakpoint ۴گانه، container، سیستم ۱۲ستونی، flex utilities | ds-design-tokens |

## گروه۳: حرکت و نمایش (Motion & Display)

| مهارت | فایل | هدف chính | وابسته به |
|------|------|-----------|-----------|
| **ds-motion-animation** | `ds-motion-animation/SKILL.md` | transition، keyframes (fade/slide/scale/shimmer)، hover-lift، reduced-motion | ds-design-tokens |
| **ds-icon-system** | `ds-icon-system/SKILL.md` | SVG آیکون، naming convention، اندازه xs-xl، currentColor | ds-design-tokens |
| **ds-data-display-system** | `ds-data-display-system/SKILL.md` | جدول، stat-card، skeleton، progress-bar، list | ds-design-tokens, ds-motion-animation |
| **ds-navigation-system** | `ds-navigation-system/SKILL.md` | navbar، breadcrumb، tabs، pagination، mobil-menu | ds-design-tokens, ds-button-system |
| **ds-feedback-system** | `ds-feedback-system/SKILL.md` | alert، toast، modal (focus-trap, ESC)، tooltip، empty-state | ds-design-tokens, ds-motion-animation, ds-button-system, ds-accessibility-a11y |

## گروه۴: مستندات و گ znancia (Docs & Governance)

| مهارت | فایل | هدف chính | وابسته به |
|------|------|-----------|-----------|
| **ds-design-system-master** | `ds-design-system-master/SKILL.md` | MASTER.md، governance، anti-patterns، چک‌لیست پیش از تحویل | همه ds-* |
| **ds-component-preview** | `ds-component-preview/SKILL.md` | preview.html ONE-PAGE برای تست سریع کامپوننت‌ها | همه ds-* |
| **ds-professional-references** | `ds-professional-references/SKILL.md` | مرجع Carbon/Material/Primer/Spectrum/Cloudscape/Fluent/AntD/Polaris/shadcn/Radix/Tailwind/Figma/Style Dictionary/Storybook/Tokens Studio | ds-design-system-master |
| **ds-construction-directives** | `ds-construction-directives/SKILL.md` | دستورالعمل ساخت فاز‌به‌فاز، ترتیب import، CI، نسخه‌بندی semver | همه ds-* |

---

## نحوه استفاده

هر `SKILL.md` را به ترتیب venceu Auszeichnungen بخوانید و طبق گام‌های `## گردش کار` اجرا کنید. فایل‌های خروجی هر مهارت (CSS، JSON، HTML، JS) در همان پوشه skill قرار می‌گیرند.

```text
library/skills/
├── ds-design-tokens/
│   ├── SKILL.md
│   ├── tokens/css-variables.css
│   └── tokens/design-tokens.json
├── ds-button-system/
│   ├── SKILL.md
│   └── components/buttons.css
├── ds-form-input-system/
│   ├── SKILL.md
│   └── components/inputs.css
├── ds-card-layout-system/
│   ├── SKILL.md
│   └── components/cards.css
├── ds-theme-dark-light/
│   ├── SKILL.md
│   └── js/toggle-theme.js
├── ds-responsive-grid/
│   ├── SKILL.md
│   └── components/grid.css
├── ds-motion-animation/
│   ├── SKILL.md
│   └── components/motion.css
├── ds-accessibility-a11y/
│   ├── SKILL.md
│   └── docs/a11y-checklist.md
├── ds-icon-system/
│   ├── SKILL.md
│   └── components/icons.css
├── ds-data-display-system/
│   ├── SKILL.md
│   └── components/data-display.css
├── ds-navigation-system/
│   ├── SKILL.md
│   └── components/navigation.css
├── ds-feedback-system/
│   ├── SKILL.md
│   └── components/feedback.css
├── ds-design-system-master/
│   └── SKILL.md
├── ds-component-preview/
│   └── SKILL.md
├── ds-professional-references/
│   └── SKILL.md
├── ds-construction-directives/
│   └── SKILL.md
└── ds-INDEX.md
```

---

## چک‌لیست نهایی پیش از commit

- [ ] هر skill فایل `SKILL.md` با frontmatter کامل (name, description, date_added, risk, source, source_type) دارد.
- [ ] هر skill شامل `## هدف`، `## چه زمانی فعال شود`، `## گردش کار`، `## چک‌لیست کیفیت`، `## خروجی` است.
- [ ] توضیحات و متن‌های کاربرDisplayed به زبان فارسی هستند.
- [ ] وابستگی‌ها (dependencies) در هر skill مشخص شده.
- [ ] فایل‌های CSS/JS/HTML خروجی در همان پوشه skill وجود دارند (aje�ه برای مهارت‌های мастер/preview/references/construction فقط SKILL.md است).
