# BISON Brand Guidelines v1.0

> Last updated: 2026-08-18
> Status: Release
> Companion: cinematic brand book at the site root

## Quick Reference

| Element | Value |
|---------|-------|
| Primary Color | Iron `#0B0A09` |
| Secondary Color | Hide `#1C1917` |
| Accent / CTA | Ember `#A16207` |
| Animal / Metal | Prairie Gold `#C6A15B` |
| Paper | Bone `#E8DFD2` |
| Heading Font | Cormorant |
| Body Font | Montserrat |
| Voice | Grounded, unhurried, exact |

---

## 1. Color Palette

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Iron | `#0B0A09` | rgb(11,10,9) | Night field, chrome, photography plates |
| Hide | `#1C1917` | rgb(28,25,23) | Cards, raised surfaces, store chrome |
| Prairie Gold | `#C6A15B` | rgb(198,161,91) | Mark, labels, the animal |
| Ember | `#A16207` | rgb(161,98,7) | Primary CTA — WCAG AA on white |

### Secondary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Stone | `#44403C` | rgb(68,64,60) | Secondary text on dark |
| Dust | `#8A8175` | rgb(138,129,117) | Meta, captions |

### Neutral Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Bone | `#E8DFD2` | rgb(232,223,210) | Paper, light chapters |
| Snow | `#FAFAF9` | rgb(250,250,249) | Light UI field |
| Text Primary | `#0C0A09` | rgb(12,10,9) | Body on bone |
| Border | `#D6D3D1` | rgb(214,211,209) | Light dividers |

### Semantic Colors

| State | Hex | Usage |
|-------|-----|-------|
| Success | `#22C55E` | Confirmations only — never brand chrome |
| Warning | `#F59E0B` | Pending states |
| Error | `#DC2626` | Errors, destructive actions |
| Info | `#3B82F6` | System messages |

### Accessibility

- Bone on Iron: well above 7:1 (AAA)
- Ember `#A16207` on white: AA for large text and UI
- Prairie Gold on Iron is for marks and large type, not 14px body
- All interactive elements meet WCAG 2.1 AA

---

## 2. Typography

### Font Stack

```css
--font-display: "Cormorant", "Times New Roman", serif;
--font-body: "Montserrat", system-ui, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, monospace;
```

### Type Scale

| Element | Size (Desktop) | Size (Mobile) | Weight | Line Height |
|---------|----------------|---------------|--------|-------------|
| Hero | clamp 4.6rem–20rem | 4.6rem | 500 | 0.78 |
| H1 | 96px | 48px | 500 | 0.88 |
| H2 | 64px | 36px | 500 | 0.92 |
| H3 | 32px | 24px | 500 | 1.15 |
| Body | 18px | 16px | 300 | 1.7 |
| Label | 11–12px | 11px | 400 | 1.4 |

### Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=JetBrains+Mono:wght@400;500&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

---

## 3. Logo Usage

### Variants

| Variant | File | Use Case |
|---------|------|----------|
| Full bison | `public/images/mark-body.png` | Primary lockup, dark or bone fields |
| Head seal | `public/images/mark-bison.png` | App icon, favicon, wax / square |
| Wordmark | HTML / Cormorant tracking 0.28em | When the animal already appears nearby |

### Clear Space

Minimum clear space = height of the hump.

### Minimum Size

| Context | Minimum Width |
|---------|---------------|
| Digital — full mark | 120px |
| Digital — head | 24px |
| Print — full mark | 35mm |
| Print — head | 10mm |

### Don'ts

- Don't stretch or compress
- Don't rotate
- Don't recolor outside Iron / Gold / Bone / Snow
- Don't add shadows, glows, or outlines
- Don't place on busy pattern

---

## 4. Voice & Tone

### Brand Personality

| Trait | Description |
|-------|-------------|
| **Grounded** | Physical materials, real weather, no abstraction for its own sake |
| **Unhurried** | We do not shout launches. We open the season. |
| **Exact** | Specific nouns. Measured claims. Short sentences. |

### Voice Chart

| Trait | We Are | We Are Not |
|-------|--------|------------|
| Grounded | Specific, tactile | Motivational poster |
| Unhurried | Quietly sure | Hype cycle |
| Exact | Built to last | Western costume |

### Tone by Context

| Context | Tone | Example |
|---------|------|---------|
| Marketing | Campaign, dry | "A coat for the year the weather stopped being polite." |
| Product | Factual | "Storm welt. Hide / bone lining." |
| Error | Calm | "The herd is offline. Try the ridge again." |
| Success | Brief | "Packed." |

### Prohibited Terms

| Avoid | Reason |
|-------|--------|
| Revolutionary | Empty |
| Seamless | Overused |
| Synergy | Corporate |
| Beast mode | Costume |
| Rugged-chic | Agency slang |

---

## 5. Imagery Guidelines

### Photography Style

- **Lighting:** Side light, golden hour, or single gold rim in studio
- **Subjects:** The animal, empty plains, product as object — never smiling catalog
- **Color treatment:** Iron shadows, bone highlights, one metal
- **Composition:** Room around the subject. Horizon low.

### Illustrations

- Style: Solid silhouette only
- Colors: Prairie Gold or Iron
- No mascot poses, no charging action lines

### Icons

- Style: Outline, 24px grid
- Stroke: 1.5px
- No emoji as structural icons

---

## 6. Design Components

### Buttons

| Type | Background | Text | Notes |
|------|------------|------|-------|
| Primary | `#A16207` | `#FFFFFF` | Ember CTA |
| Secondary | Transparent | current | 2px border |
| Demo tab | `#C6A15B` when on | `#0B0A09` | Device theater |

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Tight gaps |
| sm | 8px | Icon gaps |
| md | 24px | Standard padding |
| lg | 32px | Section padding |
| xl | 48px | Large gaps |
| 2xl | 64px | Section margins |
| 3xl | 96px | Hero padding |

### Motion

- Complex scroll storytelling on desktop
- One pinned chapter only (Origin)
- `prefers-reduced-motion` disables loader, pin, parallax
- Micro-interactions 150–300ms
- No cheap bounce, no emoji confetti

---

## AI Image Generation

### Base Prompt Template

```
Cinematic editorial, iron and bone grade, single gold rim light, American plains or dark studio, photorealistic, no text, no watermark, luxury outdoor house
```

### Visual Don'ts

| Avoid | Reason |
|-------|--------|
| CGI grinning bison | Costume |
| Neon overlays | Off-palette |
| Stock handshake | Off-voice |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-08-18 | First digital brand book |
