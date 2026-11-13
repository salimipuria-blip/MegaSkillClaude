---
name: ds-design-system-master
description: فایل مستند Master و قانون Govranance هر سیستم طراحی: edge-case، override per-page، anti-patterns، چک‌لیست پیش از تحویل، و نسخه‌بندی.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-design-system-master

> "Master file منبعِ حقیقت است؛ هر صفحه که فایل خودش دارد، قوانین آن overriding است."

---

## هدف

ساخت مستندات مکمل و חוק governance برای هر سیستم طراحی که**:
- نام پروژه، نسخه، دسته، دایره‌های طراحی (Variance/Motion/Density) را مشخص کند.
- 팔ت رنگ، تایپوGRAPHY، فاصله، سایه را جدول‌بندی کند.
- Spec کامپوننت‌ها (دکمه، ورودی، کارت) را با کد مثال ثبت کند.
- Motion durations و easings را ثبت کند.
- Anti-patterns (ممنوعیات) را لیست کند (emoji آیکون، layout shift،stant state change، …).
- چک‌لیست پیش از تحویل (Pre-delivery checklist) داشته باشد.
- قانون override per-page: اگر `pages/[name].md` وجود دارد، آن Rule-run است.

---

## چه زمانی فعال شود

وقتی]:
- سیستم طراحی برای تیم یا مشتری مستند می‌شود.
- نیاز به legge gouvernance و Project-hand-off دارید.
- مهارت‌های ds-* را ترکیب می‌کنید و یک منبع واحد می‌خواهید.

---

## gondול_workflow (ساخت Master)

1. **هدر**: Project، Version، Category، Design Dials (Variance ۱-۱۰، Motion، Density)، Framework.
2. **Global Rules**: 팔ت رنگ جدول، Typography (font، mood، scale، line-height، weight)، Spacing tokens، Shadow depths.
3. **Component Specs**: هر کامپوننت با کد CSS و توضیح状態 (default, hover, disabled, focus).
4. **Motion**: جدول transitionها و easingها.
5. **Anti-Patterns**: لیست مجوزهای منوع (❌).
6. **Pre-Delivery Checklist**: چک‌باکس‌های ۱۰ گانه.
7. **Overrides**: توضیح قانون per-page.

---

### نمونه فایل MASTER.md (بخش‌ها)

```markdown
# <SYSTEM-NAME> — Design System Master File

> LOGIC: When building a specific page, first check `docs/pages/[page-name].md`.  
> If that file exists, its rules override this Master file.  
> If not, strictly follow the rules below.

**Project:** <Name>  
**Version:** 1.0.0  
**Category:** <SaaS / Luxury / Consumer / Technical>  
**Design Dials:** Variance X/10 | Motion X/10 | Density X/10  

## Global Rules

### Color Palette
| Role | Hex | CSS Variable |

### Typography
- Heading Font: ...
- Body Font: ...
- Mood: ...

### Spacing Variables
| Token | Value | Usage |

### Shadow Depths
| Level | Usage |

## Component Specs

### Buttons
```css
...
```

### Inputs
```css
...
```

### Cards
```css
...
```

## Motion
| Property | Value | Usage |

## Anti-Patterns (Do NOT Use)
- ❌ ...

## Pre-Delivery Checklist
- [ ] ...
```

---

## چک‌لیست کیفیت

- [ ] هدر complete (Project, Version, Category, Design Dials).
- [ ] 팔ت رنگ complète با CSS Variable.
- [ ] Typography کامل (font، mood، scale).
- [ ] spacing و shadow از ds-tokens هستند.
- [ ] هر کامپوننت با کد مثال و توضیح حالت‌ها.
- [ ]anti-patterns معقول و مرتبط.
- [ ] چک‌لیست پیش از تحویل ۱۰ مورد.
- [ ] قانون override per-page توضیح داده شده.

---

## خروجی

- `docs/MASTER.md` — مستندات کامل سیستم طراحی
- `docs/pages/` — فایل‌های override خاص هر صفحه (اختیاری)
- وابسته به: همه مهارت‌های ds-* (tokens, button, input, card, grid, motion, a11y, theme, icon, data, navigation, feedback)