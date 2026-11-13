# SLATE — Design System Master File

> **LOGIC:** When building a specific page, first check `docs/pages/[page-name].md`.  
> If that file exists, its rules **override** this Master file.  
> If not, strictly follow the rules below.

---

**Project:** Slate Design System  
**Version:** 1.0.0  
**Category:** Developer Tools / Documentation / High-Density Technical UI  
**Design Dials:** Variance 5/10 | Motion 4/10 | Density 8/10  
**Framework:** CSS custom properties + JSON tokens

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Background | `#f8fafc` | `--color-background` |
| Surface | `#ffffff` | `--color-surface` |
| Card | `#ffffff` | `--color-card` |
| Text Primary | `#0f172a` | `--color-text-primary` |
| Text Secondary | `#334155` | `--color-text-secondary` |
| Text Muted | `#64748b` | `--color-text-muted` |
| Code | `#be185d` | `--color-code` |
| Code BG | `#f1f5f9` | `--color-code-bg` |
| Primary | `#475569` | `--color-primary` |
| Primary Hover | `#334155` | `--color-primary-hover` |
| Secondary | `#94a3b8` | `--color-secondary` |
| Border | `#cbd5e1` | `--color-border` |
| Border Hover | `#94a3b8` | `--color-border-hover` |
| Focus Ring | `rgba(71,85,105,0.4)` | `--color-focus-ring` |
| Success | `#15803d` | `--color-success` |
| Warning | `#b45309` | `--color-warning` |
| Error | `#dc2626` | `--color-error` |
| Info | `#2563eb` | `--color-info` |

### Typography

- **Body:** System sans-serif (Segoe UI, Roboto)
- **Mono / Code:** ui-monospace, SFMono, Menlo, Consolas
- **Mood:** technical, precise, dense, keyboard-first
- **Scale:** 12px → 30px (xs … 3xl)
- **Line height:** 1.25 / 1.5 / 1.7

### Spacing Variables

*Density: 8/10 — High density (4px base grid)*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` | Micro gaps, table cell padding |
| `--space-2` | `8px` | Input padding, tight gaps |
| `--space-3` | `12px` | Component padding |
| `--space-4` | `16px` | Section spacing |
| `--space-5` | `20px` | Card body padding |
| `--space-6` | `24px` | Large section padding |
| `--space-8` | `32px` | Page margins |

### Shadow Depths

| Level | Usage |
|-------|-------|
| `--shadow-sm` | Cards, inputs, dropdowns |
| `--shadow-md` | Hover states, modals |
| `--shadow-lg` | Side navigation, floating panels |
| `--shadow-xl` | Hero overlays, fullscreen modals |

---

## Component Specs

### Buttons

- Base `.btn` with tight padding, small radius (6px), 1px border.
- Variants: `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-ghost`, `.btn-destructive`.
- Sizes: `.btn-xs` / `.sm` / `.md` / `.lg` — important for dense toolbars.
- `:active` scale 0.98 for tactile keyboard-like feedback.
- Toolbar wrapper: `.btn-toolbar` for grouped actions.

### Inputs

- Label is uppercase, small, muted (field label pattern).
- 1px border, monospace helper text.
- Focus: primary border + subtle ring.
- `.code-inline` for inline code snippets within text.

### Cards

- Default: 1px border + subtle shadow.
- `.card-compact` for dense data rows.
- `.card-elevated` for modals and side panels.
- Badges use monospace font for status indicators.

---

## Motion

| Property | Value | Usage |
|----------|-------|-------|
| `--transition-fast` | `100ms ease` | Hover, toggles |
| `--transition-base` | `150ms ease` | Focus, borders |
| `--transition-slow` | `200ms ease` | Modals, drawers |

Respect `prefers-reduced-motion`.

---

## Anti-Patterns (Do NOT Use)

- ❌ Emojis as icons — use SVG (Lucide / Heroicons).
- ❌ Missing `cursor:pointer` on clickables.
- ❌ Layout-shifting hovers.
- ❌ Low contrast text — 4.5:1 minimum (WCAG AA).
- ❌ Instant state changes — always transition (100–200ms).
- ❌ Invisible focus states.
- ❌ Large border-radius on data tables — keep it tight (4–8px).
- ❌ Playful bounce animations — technical UI should feel instant.

---

## Pre-Delivery Checklist

- [ ] No emojis as icons (SVG only)
- [ ] Consistent icon set (Lucide / Heroicons)
- [ ] `cursor:pointer` on all clickables
- [ ] Hover transitions 100–200ms
- [ ] Light & dark mode verified
- [ ] Focus states visible (ring)
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px – 1440px
- [ ] Touch targets ≥ 44px on mobile
- [ ] No horizontal scroll
- [ ] Code blocks use monospace font