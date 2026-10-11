# CHAM Design System — Master

> Source of truth: `src/styles/app.css` (tokens) and the Figma file
> "CHAM Store OS — Design System (by FJCOD)", frame *Brand Foundations (cream · navy)*.
> Figma variable names equal the CSS names. Page overrides: `pages/persian-rtl.md`.

**Project:** CHAM Store OS · **Brand reference:** `docs/brand/reference-cream-navy.png` · **Details:** `docs/BRAND.md`

## Brand pillars
اقتصادی (fast, discount/cash control, visible profit) · اصیل (khatam girih, Jalali calendar, Persian) · شیک (Swiss minimal, white space, precise type) · لوکس (cream cloth, navy type, soft shadows).

## Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F3EBDD` | `#0A1224` | Page background (cream) |
| `--surface` | `#FBF7F0` | `#101B33` | Cards, inputs |
| `--surface-2` | `#EEE4D3` | `#16233F` | Subtle fills |
| `--fg` | `#0E1B36` | `#F3EBDD` | Text |
| `--fg-muted` | `#3D4A66` | `#CFC6B6` | Secondary text |
| `--fg-subtle` | `#5F6A84` | `#A3ABBE` | Hints |
| `--border` / `--border-strong` | `#E2D6C2` / `#CDBEA5` | `#1F2C4A` / `#2E3D60` | Dividers |
| `--accent` | `#12213F` | `#E9DCC4` | Buttons, links |
| `--accent-strong` | `#1F3366` | `#F6EEDF` | Hover, chart, ring |
| `--accent-soft` | `#E6DCC9` | `#1B2846` | Soft highlight |
| `--on-accent` | `#F3EBDD` | `#12213F` | Text on accent |
| `--side-bg` / `--side-fg` | `#12213F` / `#F3EBDD` | `#070D1B` / `#F3EBDD` | Sidebar |
| `--sand` | `#B08D57` | `#B08D57` | Small brass details only |
| `--good` / `--good-bg` | `#166534` / `#E3EEDD` | `#86D19A` / `#10261A` | Success |
| `--warn` / `--warn-bg` | `#9A4B0B` / `#F6E6CF` | `#F0B46B` / `#2A1D0C` | Warning |
| `--bad` / `--bad-bg` | `#B42318` / `#F7DFD8` | `#F19B8F` / `#2C1412` | Error |
| `--info` / `--info-bg` | `#1F3366` / `#E2E5EE` | `#B9C6E6` / `#142041` | Info |

Dark mode follows `prefers-color-scheme` and `[data-theme="dark"]`.

## Typography
- Persian display / headings / wordmark «چام»: **Markazi Text** 600/700 (`--font-display`)
- Persian UI and body: **Readex Pro** variable (`--font`)
- Latin wordmark `C H A M`: **Bodoni Moda**, open letter-spacing (`--font-latin`)
- Persian digits, tabular figures. All fonts are bundled via `@fontsource`; no network needed.

## Shape, space, elevation
- Radius: `--radius` 14px (cards), `--radius-sm` 10px (buttons, inputs), 999px (chips, avatars).
- Space: `--space-lg` 16px, `--space-xl` 24px; page max-width 1440px.
- Shadow: `--shadow-sm` (cards), `--shadow` (raised/modals); navy-tinted, soft.

## Components
- **Button:** min-height 40px, padding 0 16px, radius 10px; primary = `--accent` on `--on-accent`.
- **Input:** min-height 42px, padding 8px 12px, radius 10px, `--surface` fill, `--border`.
- **Card:** `--surface`, 1px `--border`, radius 14px, `--shadow-sm`, padding 24px.
- **Focus:** `:focus-visible` 2px `--ring` outline, 2px offset.
- **Khatam motif:** only on navy surfaces, ≤16% opacity.

## Rules
- `dir="rtl"`; charts run right→left.
- Text contrast ≥ 4.5:1; keep focus states visible; respect `prefers-reduced-motion`.
- Transitions 150–300ms; no layout-shifting hovers; SVG icons only (no emoji).
- Responsive checks: 375, 768, 1024, 1440px; no horizontal scroll on mobile.
- Growth loop modules: جذب → فروش → رضایت → بازگشت → معرفی.
