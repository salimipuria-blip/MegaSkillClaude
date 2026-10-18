# BISON Brand Book

Cinematic digital brand book for **BISON** — a luxury outdoor house.

**Source:** `bison-brand-book/` in the private `MegaSkillClaude` monorepo (deployed by Vercel).
The old standalone repo and its GitHub Pages site are retired (Pages returns 404, raw links 403).

**Download ZIP:** served by the site at `/BISON-Brand-Book.zip` (`public/BISON-Brand-Book.zip`). It opens
offline: unzip and double-click `index.html`. Rebuild it with `npm run zip` after changing the site.

The site is a long-scroll identity system with live **desktop** and **mobile** product demos, built from the [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) design-intelligence workflow (Scroll-Triggered Storytelling, exaggerated minimalism, Cormorant + Montserrat, iron / bone / gold).

## Run

```bash
npm install
npm run dev
```

Then open the local URL. The dev server binds to `0.0.0.0` so preview hosts work.

```bash
npm test        # static, accessibility and ZIP contracts (node:test, no extra deps; needs `unzip`)
npm run build
npm run preview
npm run zip     # rebuild the offline ZIP (needs `zip`)
```

## What’s inside

- **Origin** — full-bleed hero and pinned manifesto
- **Mark** — primary bison, head seal, clear space, minimums
- **Color** — click-to-copy tokens
- **Type / Voice / Image** — the written system, on the page
- **In the wild** — MacBook + iPhone theater, plus fullscreen live demos
- **Rules** — the four things you never do to the animal

## Source of truth

- `design-system/bison-brand-book/MASTER.md` — generated design system
- `docs/brand-guidelines.md` — written guidelines
- `public/images/` — photography and marks

## Stack

Vite, vanilla JS, GSAP ScrollTrigger, Lenis. No framework on purpose — the book should feel like print that learned to scroll.
