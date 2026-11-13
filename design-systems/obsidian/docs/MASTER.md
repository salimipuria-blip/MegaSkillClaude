# OBSIDIAN — Design System Master File

> **LOGIC:** When building a specific page, first check `docs/pages/[page-name].md`.  
> If that file exists, its rules **override** this Master file.  
> If not, strictly follow the rules below.

---

**Project:** Obsidian Design System  
**Version:** 1.0.0  
**Category:** Luxury / Finance / Premium Dark UI  
**Design Dials:** Variance 7/10 | Motion 6/10 | Density 4/10  
**Framework:** CSS custom properties + JSON tokens

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Background | `#0a0a0a` | `--color-background` |
| Surface | `#171717` | `--color-surface` |
| Card | `#171717` | `--color-card` |
| Text Primary | `#f5f5f4` | `--color-text-primary` |
| Text Secondary | `#d6d3d1` | `--color-text-secondary` |
| Text Muted | `#a8a29e` | `--color-text-muted` |
| Primary / Gold | `#a16207` | `--color-primary` |
| Primary Hover | `#b45309` | `--color-primary-hover` |
| Secondary | `#44403c` | `--color-secondary` |
| Border | `#272727` | `--color-border` |
| Border Hover | `#3f3f3f` | `--color-border-hover` |
| Focus Ring | `rgba(161,98,7,0.5)` | `--color-focus-ring` |
| Success | `#16a34a` | `--color-success` |
| Warning | `#ca8a04` | `--color-warning` |
| Error | `#dc2626` | `--color-error` |
| Info | `#2563eb` | `--color-info` |

**Light mode:** Available via `@media (prefers-color-scheme: light)` but not the default.

### Typography

- **Heading Font:** Cormorant Garamond (Serif) — for headlines, display, and premium feel
- **Body Font:** System sans-serif (Segoe UI, Roboto)
- **Mood:** luxury, premium, finance, editorial, refined
- **Scale:** 12px → 48px
- **Line height:** 1.2 (tight headings) / 1.5 / 1.8 (relaxed body)

### Spacing Variables

*Density: 4/10 — Spacious*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` | Micro gaps |
| `--space-2` | `8px` | Icon spacing |
| `--space-3` | `12px` | Tight component padding |
| `--space-4` | `16px` | Standard padding |
| `--space-5` | `20px` | Section rhythm |
| `--space-6` | `24px` | Card padding |
| `--space-8` | `32px` | Generous section padding |
| `--space-12` | `48px` | Hero margins |

### Shadow Depths

| Level | Usage |
|-------|-------|
| `--shadow-sm` | Inputs, subtle dividers |
| `--shadow-md` | Cards, dropdowns |
| `--shadow-lg` | Modals, side navigation |
| `--shadow-xl` | Floating panels, hero overlays |
| `--shadow-glow-primary` | Gold accent glow around CTAs |

---

## Component Specs

### Buttons

Base `.btn` + variants: `.btn-primary` (gold, with glow), `.btn-secondary`, `.btn-outline`, `.btn-ghost`, `.btn-destructive`.

- `:focus-visible` required with visible ring.
- Never use emojis as icons.
- Hover should not shift layout.

### Inputs

Wrap in `.field` with `<label>`. Dark surface background (`#171717`) with subtle border.
- Focus: gold border + focus ring.
- Error: red border + soft red shadow.
- Disabled: near-black background + `cursor: not-allowed`.

### Cards

- Default: 1px border + subtle shadow.
- Hover: lift 3px + shadow increases.
- `.card-glow` for featured/gold items.
- `.card-elevated` for modals and hero sections.

---

## Motion

| Property | Value | Usage |
|----------|-------|-------|
| `--transition-fast` | `150ms ease` | Hover, toggles |
| `--transition-base` | `250ms ease` | Focus, color |
| `--transition-slow` | `400ms ease` | Modals, page entry |

Respect `prefers-reduced-motion`.

---

## Anti-Patterns (Do NOT Use)

- ❌ Emojis as icons — use SVG.
- ❌ Missing `cursor:pointer` on clickables.
- ❌ Layout-shifting hovers (scale/move siblings).
- ❌ Low contrast text — 4.5:1 minimum (WCAG AA).
- ❌ Instant state changes — always transition.
- ❌ Invisible focus states.
- ❌ Pure black (`#000000`) backgrounds — use `#0a0a0a` for depth.

---

## Pre-Delivery Checklist

- [ ] No emojis as icons (SVG only)
- [ ] Consistent icon set
- [ ] `cursor:pointer` on all clickables
- [ ] Hover transitions 150–400ms
- [ ] Dark mode contrast 4.5:1+
- [ ] Light mode override verified
- [ ] Focus states visible
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px – 1440px
- [ ] No horizontal scroll