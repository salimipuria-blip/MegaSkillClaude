# PRISM — Design System Master File

> **LOGIC:** When building a specific page, first check `docs/pages/[page-name].md`.  
> If that file exists, its rules **override** this Master file.  
> If not, strictly follow the rules below.

---

**Project:** Prism Design System  
**Version:** 1.0.0  
**Category:** SaaS / Enterprise / Dashboard  
**Design Dials:** Variance 6/10 | Motion 5/10 | Density 5/10  
**Framework:** CSS custom properties + JSON tokens (framework-agnostic)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#2563eb` | `--color-primary` |
| Primary Hover | `#1d4ed8` | `--color-primary-hover` |
| Secondary | `#64748b` | `--color-secondary` |
| Background | `#ffffff` | `--color-background` |
| Surface | `#f8fafc` | `--color-surface` |
| Card | `#ffffff` | `--color-card` |
| Text Primary | `#0f172a` | `--color-text-primary` |
| Text Secondary | `#475569` | `--color-text-secondary` |
| Text Muted | `#94a3b8` | `--color-text-muted` |
| Border | `#e2e8f0` | `--color-border` |
| Border Hover | `#cbd5e1` | `--color-border-hover` |
| Focus Ring | `rgba(37,99,235,0.4)` | `--color-focus-ring` |
| Success | `#10b981` | `--color-success` |
| Warning | `#f59e0b` | `--color-warning` |
| Error | `#ef4444` | `--color-error` |
| Info | `#3b82f6` | `--color-info` |

**Dark mode:** Automatically applied via `@media (prefers-color-scheme: dark)`.

### Typography

- **Font:** System font stack (San Francisco, Segoe UI, Roboto)
- **Mood:** clean, professional, readable, neutral
- **Scale:** 12px → 36px (xs, sm, base, lg, xl, 2xl, 3xl, 4xl)
- **Line height:** 1.25 / 1.5 / 1.75
- **Weights:** 400, 500, 600, 700

### Spacing Variables

*Density: 5/10 — Balanced*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` | Icon gaps |
| `--space-2` | `8px` | Inline spacing |
| `--space-3` | `12px` | Tight component padding |
| `--space-4` | `16px` | Standard padding |
| `--space-5` | `20px` | Section gaps |
| `--space-6` | `24px` | Card padding |
| `--space-8` | `32px` | Large section padding |
| `--space-12` | `48px` | Hero / page margins |

### Shadow Depths

| Level | Usage |
|-------|-------|
| `--shadow-sm` | Subtle lift, inputs, dropdowns |
| `--shadow-md` | Cards, buttons hover |
| `--shadow-lg` | Modals, sidebars |
| `--shadow-xl` | Hero overlays, floating panels |

---

## Component Specs

### Buttons

Use `.btn` base class + variant modifier (`.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-ghost`, `.btn-destructive`).

- Always include `cursor: pointer` on clickable elements.
- Always provide `:focus-visible` state.
- Use `.btn-sm` / `.md` / `.lg` / `.xl` for sizing.
- Never use emojis as icons — use SVG.

### Inputs

Wrap in `.field` with `<label>` and optional `.helper-text` / `.error-text`.
- Focus ring must be visible (2–3px).
- Error state uses `--color-error` border + shadow.
- Disabled state uses `--color-surface` background + `cursor: not-allowed`.

### Cards

- Default: `.card` with light shadow and border.
- Hover: lift 2px, shadow increases to `md`.
- Interactive cards: `.card-interactive` + `cursor: pointer`.
- Never shift layout on hover (avoid `scale` transforms that move siblings).

---

## Motion

| Property | Value | Usage |
|----------|-------|-------|
| `--transition-fast` | `150ms ease` | Hover states, toggles |
| `--transition-base` | `200ms ease` | Focus, color changes |
| `--transition-slow` | `300ms ease` | Page transitions, modals |

Respect `prefers-reduced-motion: reduce` — disable non-essential motion.

---

## Anti-Patterns (Do NOT Use)

- ❌ **Emojis as icons** — Use SVG icons (Lucide, Heroicons, Phosphor).
- ❌ **Missing `cursor:pointer`** — All clickable elements must declare it.
- ❌ **Layout-shifting hovers** — Avoid transforms that move sibling elements.
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio (WCAG AA).
- ❌ **Instant state changes** — Always use transitions (150–300ms).
- ❌ **Invisible focus states** — Focus must be visible for keyboard navigation.

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent set (Lucide / Heroicons)
- [ ] `cursor:pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150–300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Dark mode: colors verified
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile