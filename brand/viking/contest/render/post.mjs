// The 3-slide feed carousel (1080×1350, 4:5).
//
// Structure is lifted from the reference carousel: angled orange ticker, official logo top-right,
// «۱/۳» capsule top-left, a one-glance title block, a 2×3 card grid with a catering bar, and a
// white CTA strip across the bottom. Copy is the new campaign's; nothing from the reference
// campaign (prices, dates, giveaway) is carried over.

import { C, GEO, CARD, FONT, SIZE } from './tokens.mjs';
import { line, wrap, fa, fitSize } from './type.mjs';
import { tape, logo, capsule, card, clockCard, arrow, icon, safeFamily } from './ornaments.mjs';
import { photo, cover, grade, vignette, scrim, grain, bloom } from './photo.mjs';
import { post1, post2, post3 } from './copy.mjs';

const { w: W, h: H } = SIZE.post;

const TAPE = { y: GEO.tapeTop.y, h: GEO.tapeTop.h, angle: GEO.tapeTop.angle };

/** Ticker + logo + slide capsule shared by all three slides. */
async function chrome(ctx, { tapeText, index }) {
  tape(ctx, { ...TAPE, width: W, text: tapeText, size: 40 });
  await logo(ctx, W - GEO.logoRight - GEO.logoSize, GEO.logoTop, GEO.logoSize);
  capsule(ctx, { x: GEO.capsuleLeft, y: GEO.capsuleTop, text: `${fa(index)}/${fa(3)}` });
}

/** White angled strip with one CTA line, sitting above the safe bottom edge. */
function strip(ctx, text) {
  const h = GEO.stripHeight;
  const y = 1214;
  ctx.save();
  ctx.translate(W / 2, y + h / 2);
  ctx.rotate((GEO.stripAngle * Math.PI) / 180);
  const bw = W + h * 2.4;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = C.paper;
  ctx.fillRect(-bw / 2, -h / 2, bw, h);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  // Latin strings stay LTR, Persian stays RTL — measured, fitted, then centred.
  const family = safeFamily(text, FONT.display);
  const isLatin = family !== FONT.display;
  ctx.direction = isLatin ? 'ltr' : 'rtl';
  let size = isLatin ? 36 : 38;
  ctx.font = `${size}px ${family}`;
  if (ctx.measureText(text).width > W - 170) {
    size = Math.floor((size * (W - 170)) / ctx.measureText(text).width);
    ctx.font = `${size}px ${family}`;
  }
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 3);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Slide 1 — hook, title, dates
// ---------------------------------------------------------------------------------------------
async function slide1(ctx) {
  const img = await photo(new URL('../assets/bg/post-1-hero.jpg', import.meta.url).pathname);
  cover(ctx, img, { w: W, h: H, focus: 0.46, zoom: 1.04 });
  bloom(ctx, { x: W * 0.7, y: H * 0.22, r: 660 });
  grade(ctx, { w: W, h: H });
  ctx.fillStyle = 'rgba(10,8,7,0.16)';
  ctx.fillRect(0, 0, W, H);
  scrim(ctx, { w: W, h: H, stops: [[0, 0.74], [0.14, 0.26], [0.32, 0.2], [0.46, 0.46], [0.56, 0.8], [0.7, 0.95], [1, 0.98]] });
  vignette(ctx, { w: W, h: H, strength: 0.5 });

  await chrome(ctx, { tapeText: post1.tape, index: 1 });

  // Latin eyebrow, letter-spaced, like the reference's AUTUMN ESCAPE.
  line(ctx, post1.latin, W / 2, 700, {
    size: 30, family: FONT.text === 'Vazir' ? 'VazirBold' : 'VazirBold', color: C.cream,
    dir: 'ltr', letterSpacing: 7, shadow: { blur: 16, y: 4 },
  });

  line(ctx, post1.title, W / 2, 846, {
    size: fitSize(ctx, post1.title, { family: FONT.display, maxWidth: 940, start: 158 }), family: FONT.display, color: C.amber,
    glow: 30, glowColor: 'rgba(243,154,43,0.42)',
    stroke: { color: 'rgba(0,0,0,0.55)', width: 5 },
    shadow: { color: 'rgba(0,0,0,0.95)', blur: 2, y: 9 },
  });
  line(ctx, post1.sub, W / 2, 936, {
    size: fitSize(ctx, post1.sub, { family: 'VazirBlack', maxWidth: 900, start: 52 }), family: 'VazirBlack', color: C.white, shadow: { blur: 22, y: 5 },
  });

  const cw = 330;
  const ch = 122;
  const gap = 64;
  const total = cw * 2 + gap;
  const x0 = (W - total) / 2;
  clockCard(ctx, { x: x0, y: 1016, w: cw, h: ch, label: post1.dateB.label, value: post1.dateB.value, labelSize: 30, valueSize: 58 });
  arrow(ctx, { x: x0 + cw + gap / 2, y: 1016 + ch / 2, w: 40, dir: -1 });
  clockCard(ctx, { x: x0 + cw + gap, y: 1016, w: cw, h: ch, label: post1.dateA.label, value: post1.dateA.value, labelSize: 30, valueSize: 58 });

  strip(ctx, post1.latin);
}

// ---------------------------------------------------------------------------------------------
// Slide 2 — the six experiences + catering
// ---------------------------------------------------------------------------------------------
async function slide2(ctx) {
  const img = await photo(new URL('../assets/bg/post-2-canopy.jpg', import.meta.url).pathname);
  cover(ctx, img, { w: W, h: H, focus: 0.45, zoom: 1.06, blur: 7 });
  grade(ctx, { w: W, h: H, warm: 0.1, cool: 0.06 });
  ctx.fillStyle = 'rgba(10,8,7,0.3)';
  ctx.fillRect(0, 0, W, H);
  scrim(ctx, { w: W, h: H, stops: [[0, 0.82], [0.26, 0.66], [0.6, 0.78], [0.82, 0.9], [1, 0.96]] });
  vignette(ctx, { w: W, h: H, strength: 0.55 });

  await chrome(ctx, { tapeText: post2.tape, index: 2 });

  const m = GEO.margin;
  const gap = 18;
  const cw = (W - m * 2 - gap) / 2;
  const ch = 146;
  const top = 396;

  post2.cards.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = m + col * (cw + gap);
    const y = top + row * (ch + gap);
    card(ctx, { x, y, w: cw, h: ch });
    // RTL: icon on the right edge, text right-aligned beside it.
    icon(ctx, item.icon, x + cw - 58, y + ch / 2 - 30, 56, { lw: 1.95 });
    const textRight = x + cw - 122;
    line(ctx, item.title, textRight, y + 66, {
      size: 37, family: 'VazirBlack', color: C.white, align: 'right',
      shadow: { blur: 14, y: 3 },
    });
    line(ctx, item.sub, textRight, y + 112, {
      size: 28, family: 'VazirMedium', color: '#E4DACB', align: 'right',
      shadow: { blur: 12, y: 3 },
    });
  });

  // Mixed Persian text: never set in Lalezar, which has no separator glyphs.
  line(ctx, post2.rooms, W / 2, 972, {
    size: 46, family: safeFamily(post2.rooms, FONT.display), color: C.white,
    glow: 20, glowColor: 'rgba(243,154,43,0.45)', shadow: { blur: 18, y: 4 },
  });

  // Catering bar
  const barY = 1010;
  const barH = 138;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = C.tape;
  ctx.beginPath();
  ctx.roundRect(m, barY, W - m * 2, barH, 26);
  ctx.fill();
  ctx.restore();
  line(ctx, post2.paysLead, W / 2, barY + 58, { size: 42, family: 'VazirBlack', color: C.ink });
  // Vazirmatn: this line uses «·», which Lalezar does not ship.
  line(ctx, post2.paysSub, W / 2, barY + 108, { size: 30, family: 'VazirBold', color: 'rgba(20,16,12,0.88)' });

  strip(ctx, post2.strip);
}

// ---------------------------------------------------------------------------------------------
// Slide 3 — cost, cancellation terms, two phone numbers
// ---------------------------------------------------------------------------------------------
async function slide3(ctx) {
  const img = await photo(new URL('../assets/bg/post-3-night.jpg', import.meta.url).pathname);
  cover(ctx, img, { w: W, h: H, focus: 0.62 });
  bloom(ctx, { x: W * 0.52, y: H * 0.42, r: 520, color: 'rgba(255,150,60,0.32)' });
  grade(ctx, { w: W, h: H, warm: 0.14, cool: 0.14 });
  scrim(ctx, { w: W, h: H, stops: [[0, 0.86], [0.26, 0.66], [0.5, 0.72], [0.78, 0.93], [1, 0.97]] });
  vignette(ctx, { w: W, h: H, strength: 0.55 });

  await chrome(ctx, { tapeText: post3.tape, index: 3 });

  const m = GEO.margin;
  line(ctx, post3.title, W / 2, 398, {
    size: fitSize(ctx, post3.title, { family: FONT.display, maxWidth: 920, start: 84 }), family: FONT.display, color: C.white, glow: 16,
    stroke: { color: 'rgba(0,0,0,0.5)', width: 4 }, shadow: { blur: 20, y: 5 } });
  line(ctx, post3.sub, W / 2, 458, { size: 34, family: 'VazirMedium', color: C.mute, shadow: { blur: 14, y: 3 } });

  // Two price columns
  const gap = 22;
  const cw = (W - m * 2 - gap) / 2;
  const ch = 176;
  const y = 512;
  const cols = [
    { ...post3.colA, x: m + cw + gap },
    { ...post3.colB, x: m },
  ];
  for (const col of cols) {
    card(ctx, { x: col.x, y, w: cw, h: ch, radius: 24, fill: 'rgba(10,8,7,0.88)', border: 'rgba(243,154,43,0.8)', lw: 2.6 });
    line(ctx, col.label, col.x + cw / 2, y + 56, { size: 32, family: 'VazirBold', color: C.cream });
    line(ctx, col.value, col.x + cw / 2, y + 140, {
      size: 78, family: FONT.display, color: C.amber,
      glow: 18, glowColor: 'rgba(243,154,43,0.34)',
      stroke: { color: 'rgba(60,26,0,0.35)', width: 3 },
    });
  }

  line(ctx, post3.unitNote, W / 2, y + ch + 46, { size: 29, family: 'VazirMedium', color: C.mute, shadow: { blur: 12, y: 3 } });

  // Cancellation terms
  const condY = 786;
  const condH = 148;
  card(ctx, { x: m, y: condY, w: W - m * 2, h: condH, radius: 24 });
  line(ctx, post3.condTitle, W - m - 34, condY + 54, { size: 34, family: 'VazirBlack', color: C.amber, align: 'right' });
  const lines = wrap(ctx, post3.condBody, { family: 'VazirMedium', size: 31, maxWidth: W - m * 2 - 68 });
  lines.slice(0, 2).forEach((text, i) => {
    line(ctx, text, W - m - 34, condY + 100 + i * 40, { size: 31, family: 'VazirMedium', color: '#F3EBDF', align: 'right' });
  });

  // Red CTA bar (the reference's only strong red; here it carries the action, not a fake discount)
  const ctaY = 972;
  const ctaH = 108;
  ctx.save();
  ctx.translate(W / 2, ctaY + ctaH / 2);
  ctx.rotate((-1.4 * Math.PI) / 180);
  ctx.shadowColor = 'rgba(255,77,61,0.42)';
  ctx.shadowBlur = 34;
  ctx.fillStyle = C.alert;
  ctx.beginPath();
  ctx.roundRect(-(W - m * 2) / 2, -ctaH / 2, W - m * 2, ctaH, 24);
  ctx.fill();
  ctx.restore();
  line(ctx, post3.cta, W / 2, ctaY + 68, { size: 44, family: 'VazirBlack', color: C.white, shadow: { blur: 12, y: 3 } });

  // Phone numbers, WhatsApp-marked
  const py = 1116;
  const half = (W - m * 2 - 40) / 2;
  post3.phones.forEach((p, i) => {
    const px = m + i * (half + 40);
    icon(ctx, p.icon || 'whatsapp', px + half - 42, py - 34, 42, { lw: 1.7, color: C.amber });
    line(ctx, p.label, px + half - 96, py, { size: 31, family: 'VazirBold', color: C.cream, align: 'right' });
    line(ctx, p.phone, px + half - 96, py + 52, {
      size: 42, family: 'VazirBlack', color: C.white, align: 'right', dir: 'ltr',
    });
  });

  strip(ctx, post3.strip);
}

const SLIDES = [slide1, slide2, slide3];

/** Draw slide `index` (1-based). Returns metadata the renderer logs. */
export async function drawPostSlide(ctx, index) {
  ctx.clearRect(0, 0, W, H);
  await SLIDES[index - 1](ctx);
  grain(ctx, { w: W, h: H, opacity: 0.05 });
  return { index, w: W, h: H, slug: ['hook', 'program', 'terms'][index - 1] };
}

export const POST_COUNT = SLIDES.length;
