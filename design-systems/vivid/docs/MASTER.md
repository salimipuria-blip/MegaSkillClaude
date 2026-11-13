# VIVID — Design System Master File

> **LOGIC:** When building a specific page, first check `docs/pages/[page-name].md`.  
> If that file exists, its rules **override** this Master file.  
> If not, strictly follow the rules below.

---

**Project:** Vivid Design System  
**Version:** 1.0.0  
**Category:** Consumer / B2C / Mobile-first / Marketing  
**Design Dials:** Variance 8/10 | Motion 7/10 | Density 6/10  
**Framework:** CSS custom properties + JSON tokens

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#ec4899` | `--color-primary` |
| Primary Hover | `#db2777` | `--color-primary-hover` |
| Accent 1 | `#f59e0b` | `--color-accent-1` |
| Accent 2 | `#10b981` | `--color-accent-2` |
| Accent 3 | `#3b82f6` | `--color-accent-3` |
| Accent 4 | `#8b5cf6` | `--color-accent-4` |
| Accent 5 | `#ef4444` | `--color-accent-5` |
| Background | `#ffffff` | `--color-background` |
| Surface | `#fafafa` | `--color-surface` |
| Card | `#ffffff` | `--color-card` |
| Text Primary | `#111827` | `--color-text-primary` |
| Text Secondary | `#4b5563` | `--color-text-secondary` |
| Text Muted | `#9ca3af` | `--color-text-muted` |
| Border | `#e5e7eb` | `--color-border` |
| Focus Ring | `rgba(236,72,153,0.4)` | `--color-focus-ring` |
| Success | `#10b981` | `--color-success` |
| Warning | `#f59e0b` | `--color-warning` |
| Error | `#ef4444` | `--color-error` |
| Info | `#3b82f6` | `--color-info` |

**Light mode is default; dark mode available via media query.**

### Typography

- **Display/Heading:** Outfit (or system fallback) — friendly, rounded
- **Body:** System sans-serif
- **Mood:** playful, energetic, approachable, consumer
- **Scale:** 12px → 60px
- **Line height:** 1.15 / 1.5 / 1.75

### Spacing Variables

*Density: 6/10 — Balanced-to-compact*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` | Icon gaps |
| `--space-2` | `8px` | Inline spacing |
| `--space-3` | `12px` | Tight padding |
| `--space-4` | `16px` | Standard padding |
| `--space-5` | `20px` | Section gaps |
| `--space-6` | `24px` | Card padding |
| `--space-8` | `32px` | Large section padding |
| `--space-12` | `48px` | Hero margins |

### Shadow Depths

| Level | Usage |
|-------|-------|
| `--shadow-sm` | Inputs, subtle elements |
| `--shadow-md` | Buttons, default cards |
| `--shadow-lg` | Elevated cards, modals |
| `--shadow-xl` | Floating action buttons, hero panels |
| `--shadow-colorful` | Glow around primary CTAs |

---

## Component Specs

### Buttons

- Base `.btn` with friendly `border-radius: 12px–24px`.
- Variants: `.btn-primary`, `.btn-secondary`, `.btn-outline`, `.btn-ghost`, `.btn-destructive`, `.btn-accent-1…5`.
- Active state: slight scale down (`0.97`) for tactile feedback.
- Always `:focus-visible` ring.

### Inputs

- 2px border, large radius (`16px`), pink focus ring.
- Wrap in `.field` with label + helper/error text.
- Disabled uses surface background + `cursor: not-allowed`.

### Cards

- Default: 2px border + medium shadow.
- Hover: lift 4px + border turns primary pink.
- `.card-colorful` for gradient backgrounds.
- Interactive cards must have `cursor: pointer`.

---

## Motion

| Property | Value | Usage |
|----------|-------|-------|
| `--transition-fast` | `150ms cubic-bezier` | Hover, toggles |
| `--transition-base` | `250ms cubic-bezier` | Focus, colors |
| `--transition-slow` | `400ms cubic-bezier` | Modals, entries |
| `--transition-bounce` | `350ms spring` | Playful entrances |

Respect `prefers-reduced-motion` — convert bounce to ease.

---

## Anti-Patterns (Do NOT Use)

- ❌ Emojis as icons — use SVG.
- ❌ Missing `cursor:pointer` on clickables.
- ❌ Layout-shifting hovers.
- ❌ Low contrast text — 4.5:1 minimum (WCAG AA).
- ❌ Instant state changes — always transition.
- ❌ Invisible focus states.
- ❌ Sharp corners (under 8px) on primary interactive elements — keep it friendly.

---

## Pre-Delivery Checklist

- [ ] No emojis as icons (SVG only)
- [ ] Consistent icon set
- [ ] `cursor:pointer` on all clickables
- [ ] Hover transitions 150–400ms
- [ ] Light & dark mode verified
- [ ] Focus states visible
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px – 1440px
- [ ] Touch targets ≥ 44px on mobile
- [ ] No horizontal scroll