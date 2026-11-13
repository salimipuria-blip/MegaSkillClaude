---
name: ds-professional-references
description: فهرست مرجع‌های حرفه‌ای diseño سیستم (Carbon، Material 3، Primer، Spectrum، Cloudscape، Fluent، AntD، Polaris، shadcn/ui، Radix، Tailwind، Figma Variables، Style Dictionary، Storybook، Tokens Studio) و چگونه از هر یک الهام بگیرید بدون کپی見た目.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-professional-references

> "مرجع‌ها برای الهام است، نه کپی-paste."

---

## هدف

فهرست از بهترین سیستم‌های طراحی مرجع جهان و استخراج **決定‌ها (decisions)** از هر یک، برای استفاده در ساخت سیستم طراحی خودتان**:
-IBM Carbon — دسترسی، governance، vier-tier token architecture.
-Google Material 3 — token hierarchy (primitive → alias → component), dynamic color.
-GitHub Primer — system as engineering product, versioning, changelog.
-Adobe Spectrum — évolving live system, versioned token contract.
-AWS Cloudscape — dashboard density, token origin.
-Microsoft Fluent 2 — cross-platform coherence.
-Ant Design — ۴۰۰+ token, compact density, enterprise forms.
-Shopify Polaris — documentation quality, when-to-use/when-not-to-use.
-shadcn/ui — ownership model (copy-paste, own the code), Radix primitives.
-Radix UI — headless, accessible primitives.
-Tailwind CSS — utility-first token layer.
-Figma Variables — design source of truth, multi-mode tokens.
-Style Dictionary — transform tokens to CSS/iOS/Android.
-Storybook — component development in isolation.
-Tokens Studio — token pipeline from Figma to code.

---

## چه زمانی فعال شود

وقتی]:
- systemat designing می‌کنید و نیاز به مرجع دارید.
- می‌خواهید بدانید چه تصمیم‌هایی برای token naming، component API، governance باید بگیرید.
- مقایسه بین کتابخانه‌ها و سیستم‌ها لازم است.

---

## gondول_جدول مراجع

| سیستمر Ref | شرکت | بهترین برای | steal this (چه چیزی را بگیرید) |
|------------|-------|------------|------------------------------|
| IBM Carbon | IBM | Enterprise/data-heavy | Accessibility + governance + charts |
| Material 3 | Google | Token architecture | Three-tier token system (primitive→alias→component) |
| GitHub Primer | GitHub | Engineering-first system | Versioning + changelog + Octicons |
| Adobe Spectrum | Adobe | Evolving live system | Versioned token contract |
| AWS Cloudscape | AWS | Dashboards | Token origin + density |
| Fluent 2 | Microsoft | Cross-platform | Shared tokens, per-platform code |
| Ant Design | Ant Group | Enterprise forms/tables | ۴۰۰+ tokens, compact density, i18n |
| Shopify Polaris | Shopify | Documentation | When-to-use / when-not-to-use sections |
| shadcn/ui | Community | Ownership | Copy primitives, replace defaults |
| Radix UI | Community | Accessible primitives | Headless, WAI-ARIA |
| Tailwind CSS | — | Utility-first token layer | Utility class naming |
| Figma Variables | — | Design source of truth | Multi-mode tokens |
| Style Dictionary | Amazon | Token transform | CSS/Swift/Android from one JSON |
| Storybook | — | Component docs | Isolation development |
| Tokens Studio | — | Token pipeline | Figma → GitHub sync |

---

## gondول_چگونه از مرجع استفاده کنید (بدون کپی نمایش)

1. **تصمیم‌ها را بگیرید، نه ظاهر**: مثلاً antd از ۴۰۰ 토큘ن استفاده می‌کند، شما هم layered token بسازید اما رنگ‌ها را برند خودتان بگذارید.
2. **naming convention را کپی کنید**: `color.background.danger` نه `red-600`.
3. **component API را inspiré بگیرید**: من Polaris می‌فهمد چه زمانی یک کامپوننت را استفاده کند و چه زمانی نه.
4. ** gouvernance را borrow کنید**: ورژن‌دهی و changelog مثل Primer.
5. **ابزارها را انتخاب کنید**: Figma + Style Dictionary + Storybook لایه اصلی است.

---

## چک‌لیست کیفیت

- [ ] حداقل ۵ سیستم مرجع بررسی شده.
- [ ] تصمیمات (نه فقط رنگ‌ها) استخراج شده.
- [ ] naming convention مشخص شده.
- [ ] ابزار pile (Figma/Storybook/Style Dictionary) انتخاب شده.

---

## خروجی

- `docs/professional-references.md` — فهرست مراجع و تصمیمات استخراج‌شده
- وابسته به: ds-design-system-master