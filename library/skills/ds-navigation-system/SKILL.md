---
name: ds-navigation-system
description: سیستم ناوبری حرفه‌ای شامل navbar، breadcrumb، tabs، pagination، sidebar و mobil-menu بر پایهٔ توکن ds-*.
date_added: "2026-10-31"
risk: safe
source: self
source_type: self
---

# ds-navigation-system

> "ناوبری باید کاربر را هرگز گومان نکند که کجاست."

---

## هدف

ساخت گروه ناوبری که**:
- `.navbar`: fixed/sticky، logo، link-list، action button، dark/light.
- `.breadcrumb`: خلاصه مسیر، split-icon، text-xs.
- `.tabs`: horizontal scroll، active state با border-bottom رنگ-primary.
- `.pagination`: prev/next، number dots، disabled state.
- `.sidebar`: collapsible، width space، backdrop optional.
- `.mobile-menu`: hamburger، overlay، trap focus.
- همه link‌ها `:focus-visible` و `cursor-pointer` دارند.

---

## چه زمانی فعال شود

وقتی]:
- 헤در یا سایدبار پروژه نیاز دارد.
- pagination یا tabs برای محتوای много صفحه لازم است.
- mobil-menu و accessibility ضروری است.

---

## gondول_Workflow

1. **`.navbar` بسازید**: flex، justify-between، padding space-4 space-6، shadow-md، sticky-top.
2. **.nav-link**: padding space-2 space-3، border-radius-md، transition-base، hover surface-hover.
3. **`.breadcrumb`**: flex gap space-1، text-xs muted، divider `>`.
4. **`.tabs`**: flex overflow-x-auto، tab padding space-3 space-4، active border-bottom ۲px primary.
5. **`.pagination`**: flex gap space-2، btn-sm برای اعداد و prev/next.
6. **`.mobile-menu`**: hamburger button، overlay fixed، slide-in از راست (RTL)، focus trap.
7. **تست**: keyboard Tab در navbar، mobil-menu باز/بسته، breadcrumb معتبر.

---

### نمونه کد (components/navigation.css)

```css
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ds-space-4) var(--ds-space-6);
  background-color: var(--ds-color-surface);
  border-bottom: 1px solid var(--ds-color-border);
  position: sticky;
  top: 0;
  z-index: var(--ds-z-sticky);
  box-shadow: var(--ds-shadow-sm);
}

.nav-brand {
  font-family: var(--ds-font-sans);
  font-weight: var(--ds-font-weight-bold);
  font-size: var(--ds-text-lg);
  color: var(--ds-color-text-primary);
  text-decoration: none;
}

.nav-links {
  display: flex;
  gap: var(--ds-space-4);
  align-items: center;
}

.nav-link {
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  padding: var(--ds-space-2) var(--ds-space-3);
  border-radius: var(--ds-radius-md);
  transition: background-color var(--ds-transition-base), color var(--ds-transition-base);
}

.nav-link:hover,
.nav-link:focus-visible {
  background-color: var(--ds-color-surface-hover);
  color: var(--ds-color-text-primary);
}

.nav-link.active {
  color: var(--ds-color-primary);
  font-weight: var(--ds-font-weight-semibold);
}

/* Breadcrumb */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--ds-space-1);
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-muted);
  padding: var(--ds-space-3) var(--ds-space-4);
}

.breadcrumb a {
  color: var(--ds-color-text-secondary);
  text-decoration: none;
}
.breadcrumb a:hover { color: var(--ds-color-primary); }

.breadcrumb-divider {
  font-size: var(--ds-text-xs);
  color: var(--ds-color-text-muted);
}

/* Tabs */
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--ds-color-border);
  overflow-x: auto;
  padding-bottom: 1px;
}

.tab {
  padding: var(--ds-space-3) var(--ds-space-4);
  font-size: var(--ds-text-sm);
  color: var(--ds-color-text-secondary);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color var(--ds-transition-base), border-color var(--ds-transition-base);
  white-space: nowrap;
}

.tab:hover,
.tab:focus-visible {
  color: var(--ds-color-primary);
}

.tab.active {
  color: var(--ds-color-primary);
  border-bottom-color: var(--ds-color-primary);
  font-weight: var(--ds-font-weight-semibold);
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  justify-content: center;
  padding: var(--ds-space-6) 0;
}

.page-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ds-color-border);
  border-radius: var(--ds-radius-md);
  background-color: var(--ds-color-background);
  color: var(--ds-color-text-secondary);
  font-size: var(--ds-text-sm);
  cursor: pointer;
  transition: all var(--ds-transition-base);
}

.page-btn:hover:not(:disabled) {
  border-color: var(--ds-color-primary);
  color: var(--ds-color-primary);
  background-color: var(--ds-color-surface-hover);
}

.page-btn.active {
  background-color: var(--ds-color-primary);
  color: #ffffff;
  border-color: var(--ds-color-primary);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Mobile hamburger */
.mobile-menu-toggle {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--ds-space-2);
}

.mobile-menu-toggle svg {
  width: 24px;
  height: 24px;
  fill: currentColor;
}

@media (max-width: 768px) {
  .nav-links { display: none; }
  .mobile-menu-toggle { display: block; }
}
```

---

## چک‌لیست کیفیت

- [ ] navbar sticky و shadow دارد.
- [ ] nav-link focus-visible و hover دارد.
- [ ] breadcrumb معتبر و divider دارد.
- [ ] tabs active state با رنگ-primary.
- [ ] pagination disabled state و active دارد.
- [ ] mobil-menu در ≤۷۶۸px فعال می‌شود.
- [ ] تمام لینک‌ها cursor-pointer دارند.

---

## خروجی

- `components/navigation.css` —navbar، breadcrumb، tabs، pagination، mobil-menu
- `preview.html` — نمایش ناوبری در دسکتاپ و موبایل
- وابسته به: `ds-design-tokens`, `ds-button-system`