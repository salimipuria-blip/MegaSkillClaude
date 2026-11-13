---
name: ds-motion-animation
description: سیستم حرکت و انیمیشن حرفه‌ای شامل transition، easing، keyframes، prefers-reduced-motion و flip transitions برای صفحات و کامپوننت‌ها.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-motion-animation

> "حرکت باید معنی داشته باشد، نه_showcase_. هر انیمیشن یک هدف UX دارد."

---

## هدف

ساخت لایه انیمیشن که**:
- transition tokens: fast (۱۵۰ms), base (۲۰۰ms), slow (۳۰۰ms), bounce (۳۵۰ms spring)
- easing همهٔ transiton‌ها (cubic-bezier)
- keyframes: fade-in, slide-up, slide-down, scale-in, shimmer, pulse
- class-based: `.animate-fade-in`, `.slide-up`, `.hover-lift`
- respects `prefers-reduced-motion: reduce` (بدون انیمیشن غیرضروری)
- GSAP Flip plugin hints برای shared-element transitions (اختیاری)

---

## چه زمانی فعال شود

وقتی]:
-/page-transition یا element-transition نیاز دارید.
- hover و focus animation باید منسجم باشد.
- دسترسی reduced-motion مهم است.

---

## گردش کار

1. **متغیرهای transition در CSS بسازید** (`--ds-transition-fast/base/slow/bounce`).
2. **클래س‌های انیمیشن بسازید**: `.fade-in`, `.slide-up`, `.scale-in`, `.shimmer`.
3. **hover transition را با easing Cubic-bezier تعریف کنید.**
4. ** modal/page transition با slow duration.**
5. ** respects prefers-reduced-motion: disable all non-essential motion.**
6. **تست**: دکمه hover، کارت lift، modal open، prefers-reduced-motion.

---

### نمونه کد (components/motion.css)

```css
:root {
  --ds-transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --ds-transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --ds-transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
  --ds-transition-bounce: 350ms cubic-bezier(0.68, -0.55, 0.27, 1.55);
  --ds-easing-ease-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ds-easing-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Keyframes */
@keyframes ds-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes ds-slide-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ds-scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes ds-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Animation classes */
.animate-fade-in { animation: ds-fade-in var(--ds-transition-base) both; }
.animate-slide-up { animation: ds-slide-up var(--ds-transition-slow) both; }
.animate-scale-in { animation: ds-scale-in var(--ds-transition-base) both; }

/* Hover lift */
.hover-lift {
  transition: transform var(--ds-transition-base), box-shadow var(--ds-transition-base);
}
.hover-lift:hover { transform: translateY(-4px); box-shadow: var(--ds-shadow-lg); }

/* Loading shimmer */
.loading-shimmer {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: ds-shimmer 1.5s infinite;
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .hover-lift:hover { transform: none; }
}
```

---

## چک‌لیست کیفیت

- [ ] fast/base/slow/bounce transition تعریف شده.
- [ ] fade-in, slide-up, scale-in, shimmer keyframes وجود دارند.
- [ ] hover-lift با transform و shadow.
- [ ] prefers-reduced-motion بهcharacterized است.
- [ ] duration معقول (۱۵۰–۴۰۰ms).
- [ ] هیچ انیمیشن Flash یا درد سر ندارد.

---

## خروجی

- `components/motion.css` — transition، keyframes، کلاس‌های انیمیشن
- `preview.html` — نمایش انیمیشن‌های hover, fade, slide, shimmer
- وابسته به: `ds-design-tokens`