// Eight Story frames (1080×1920, 9:16), two per day for four days.
//
// Geometry follows the reference Story: angled orange ticker at the top, the official logo
// top-right, a hook under it, one big display statement, the mechanic/cards that back it up, date
// capsules and a white strip at the very bottom.
//
// Layout is a measured vertical stack: every block reports its height, the stack is centred in the
// 330…1700 content zone, and nothing that a reader needs lands inside Instagram's own chrome
// (top ~8%, bottom ~12%).

import { C, GEO, FONT, SIZE, STORY_SCALE } from './tokens.mjs';
import { line, wrap, fa, fitSize } from './type.mjs';
import { tape, logo, capsule, card, clockCard, arrow, icon, safeFamily, displayWithPunctuation } from './ornaments.mjs';
import { photo, cover, grade, vignette, scrim, grain, bloom } from './photo.mjs';
import { stories } from './copy.mjs';

const { w: W, h: H } = SIZE.story;

const TAPE = {
  y: Math.round(GEO.tapeStory.y * STORY_SCALE),
  h: Math.round(GEO.tapeStory.h * STORY_SCALE),
  angle: GEO.tapeStory.angle,
};

const ZONE = { top: 360, bottom: 1652 };

/** Measured width of `text` at `size`, without touching drawing state. */
function fitWidth(ctx, text, family, size) {
  const saved = ctx.font;
  ctx.font = `${size}px ${family}`;
  const w = ctx.measureText(text).width;
  ctx.font = saved;
  return w;
}
const M = 70;

function strip(ctx, text) {
  const h = 92;
  const y = H - 168;
  ctx.save();
  ctx.translate(W / 2, y + h / 2);
  ctx.rotate((-1.5 * Math.PI) / 180);
  const bw = W + h * 2.4;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = C.paper;
  ctx.fillRect(-bw / 2, -h / 2, bw, h);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  const family = safeFamily(text, FONT.display);
  const isLatin = family !== FONT.display;
  ctx.direction = isLatin ? 'ltr' : 'rtl';
  let size = isLatin ? 36 : 42;
  ctx.font = `${size}px ${family}`;
  // Never let the CTA run past the frame edges, where the rotation would slice a letter off.
  if (ctx.measureText(text).width > W - 190) {
    size = Math.floor((size * (W - 190)) / ctx.measureText(text).width);
    ctx.font = `${size}px ${family}`;
  }
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 3);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Blocks — each returns the height it consumed
// ---------------------------------------------------------------------------------------------

function hookBlock(ctx, text, y) {
  if (!text) return 0;
  const size = 44;
  const maxWidth = W - 62 - 190;
  const lines = wrap(ctx, text, { family: 'VazirBlack', size, maxWidth });
  const step = Math.round(size * 1.42);
  lines.forEach((t, i) => {
    line(ctx, t, W - 62, y + i * step, {
      size, family: 'VazirBlack', color: C.white, align: 'right', dir: 'rtl',
      shadow: { blur: 20, y: 4 },
    });
  });
  return lines.length * step;
}

function heroBlock(ctx, s, y) {
  let h = 0;
  if (s.head) {
    displayWithPunctuation(ctx, s.head, W / 2, y + 132, {
      size: fitSize(ctx, s.head, { family: FONT.display, maxWidth: 800, start: 168 }),
      color: C.amber, glow: 38, glowColor: 'rgba(243,154,43,0.5)',
      stroke: { color: 'rgba(0,0,0,0.6)', width: 6 },
      shadow: { color: 'rgba(0,0,0,0.95)', blur: 3, y: 9 },
    });
    h += 168;
  }
  const maxW = 950;
  let size = s.title.length > 17 ? 104 : 132;
  let rows = [s.title];
  if (fitWidth(ctx, s.title, FONT.display, size) > maxW) {
    // Two balanced lines read far better than one shrunk line on a full-bleed frame.
    const words = s.title.split(' ');
    if (words.length > 1) {
      const mid = Math.ceil(words.length / 2);
      rows = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
      const widest = Math.max(...rows.map((r) => fitWidth(ctx, r, FONT.display, size)));
      if (widest > maxW) size = Math.floor((size * maxW) / widest);
    } else {
      size = Math.floor((size * maxW) / fitWidth(ctx, s.title, FONT.display, size));
    }
  }
  rows.forEach((row, i) => {
    line(ctx, row, W / 2, y + h + 96 + i * Math.round(size * 0.96), {
      size, family: FONT.display,
      color: s.head ? C.white : C.amber,
      glow: s.head ? 14 : 30, glowColor: 'rgba(243,154,43,0.42)',
      stroke: { color: 'rgba(0,0,0,0.5)', width: 5 },
      shadow: { color: 'rgba(0,0,0,0.95)', blur: 18, y: 6 },
    });
  });
  h += Math.round(size * 0.96) * rows.length + 14;
  if (s.sub) {
    line(ctx, s.sub, W / 2, y + h + 46, {
      size: 38, family: 'VazirBold', color: C.cream, shadow: { blur: 16, y: 4 },
    });
    h += 70;
  }
  return h;
}

function bodyBlock(ctx, text, y) {
  if (!text) return 0;
  const size = 36;
  const lines = wrap(ctx, text, { family: 'VazirMedium', size, maxWidth: W - 180 });
  const step = Math.round(size * 1.55);
  lines.slice(0, 3).forEach((t, i) => {
    line(ctx, t, W / 2, y + i * step, { size, family: 'VazirMedium', color: '#F5EEE2', shadow: { blur: 16, y: 4 } });
  });
  return lines.slice(0, 3).length * step;
}

/** Three mechanic chips (follow / repost / tag). */
function stepsBlock(ctx, items, y) {
  const gap = 16;
  const cw = (W - M * 2 - gap * (items.length - 1)) / items.length;
  const ch = 200;
  items.forEach((item, i) => {
    const x = W - M - cw - i * (cw + gap);
    card(ctx, { x, y, w: cw, h: ch, radius: 26, fill: 'rgba(18,14,11,0.9)', border: 'rgba(243,154,43,0.7)' });
    icon(ctx, item.icon || 'people', x + cw / 2 - 23, y + 24, 46, { lw: 1.9 });
    line(ctx, item.title, x + cw / 2, y + 116, {
      size: item.title.length > 12 ? 30 : 33, family: 'VazirBlack', color: C.white, shadow: { blur: 12, y: 3 },
    });
    line(ctx, item.sub, x + cw / 2, y + 154, {
      size: item.sub.length > 13 ? 24 : 26, family: 'VazirMedium', color: C.mute,
      ...(item.dir === 'ltr' ? { dir: 'ltr' } : {}),
    });
  });
  return ch;
}

/** Two-up cards: icon + title + subtitle; `big` prints the subtitle as a display figure. */
function pairBlock(ctx, items, y, { big = false, dir = null } = {}) {
  const gap = 22;
  const cw = (W - M * 2 - gap) / 2;
  const ch = big ? 226 : 214;
  items.forEach((item, i) => {
    const x = W - M - cw - i * (cw + gap);
    card(ctx, {
      x, y, w: cw, h: ch, radius: 26,
      fill: big ? 'rgba(9,7,6,0.92)' : 'rgba(18,14,11,0.9)',
      border: big ? 'rgba(243,154,43,0.82)' : 'rgba(243,154,43,0.62)',
      lw: big ? 2.6 : 2.2,
    });
    if (big) {
      line(ctx, item.title, x + cw / 2, y + 64, { size: 30, family: 'VazirBold', color: C.cream });
      line(ctx, item.sub, x + cw / 2, y + 162, {
        size: 74, family: FONT.display, color: C.amber,
        glow: 18, glowColor: 'rgba(243,154,43,0.34)', stroke: { color: 'rgba(60,26,0,0.3)', width: 3 },
      });
    } else {
      icon(ctx, item.icon, x + 24, y + 24, 44, { lw: 1.9 });
      line(ctx, item.title, x + cw - 26, y + 112, {
        size: item.title.length > 12 ? 30 : 33, family: 'VazirBlack', color: C.white, align: 'right',
        shadow: { blur: 12, y: 3 },
      });
      const sub = dir || item.dir;
      line(ctx, item.sub, x + cw - 26, y + 158, {
        size: item.sub.length > 14 ? 27 : 31, family: 'VazirMedium', color: C.mute, align: 'right',
        ...(sub === 'ltr' ? { dir: 'ltr' } : {}),
      });
    }
  });
  return ch;
}

/** A quoted condition / note with a shield or clock marker. */
function noteCardBlock(ctx, { title, text, iconName = 'shield' }, y) {
  const lines = wrap(ctx, text, { family: 'VazirMedium', size: 34, maxWidth: W - M * 2 - 120 });
  const ch = 74 + lines.slice(0, 3).length * 52 + 46;
  card(ctx, { x: M, y, w: W - M * 2, h: ch, radius: 26, fill: 'rgba(14,11,9,0.9)', border: 'rgba(243,154,43,0.6)' });
  icon(ctx, iconName || 'shield', W - M - 62, y + 40, 44, { lw: 1.9 });
  if (title) {
    line(ctx, title, W - M - 116, y + 66, { size: 34, family: 'VazirBlack', color: C.amber, align: 'right' });
  }
  lines.slice(0, 3).forEach((t, i) => {
    line(ctx, t, W - M - 34, y + (title ? 126 : 90) + i * 52, {
      size: 34, family: 'VazirMedium', color: '#F3EBDF', align: 'right',
    });
  });
  return ch;
}

/** Phone rows with a WhatsApp mark: label on the right, number set LTR and large. */
function contactsBlock(ctx, items, y) {
  const rowH = 138;
  const gap = 16;
  items.forEach((item, i) => {
    const ry = y + i * (rowH + gap);
    card(ctx, { x: M + 20, y: ry, w: W - (M + 20) * 2, h: rowH, radius: 24, fill: 'rgba(9,7,6,0.92)', border: 'rgba(243,154,43,0.75)', lw: 2.4 });
    const cx = M + 20 + (W - (M + 20) * 2) / 2;
    icon(ctx, item.icon || 'whatsapp', W - M - 66, ry + 46, 44, { lw: 1.75 });
    line(ctx, item.label, cx, ry + 52, { size: 31, family: 'VazirBold', color: C.cream });
    line(ctx, item.sub, cx, ry + 108, {
      size: 46, family: 'VazirBlack', color: C.white, dir: 'ltr',
    });
  });
  return items.length * rowH + (items.length - 1) * gap;
}

function datesBlock(ctx, items, y) {
  const gap = 78;
  const cw = (W - M * 2 - gap) / 2;
  const ch = 152;
  items.forEach((item, i) => {
    const x = W - M - cw - i * (cw + gap);
    clockCard(ctx, { x, y, w: cw, h: ch, label: item.label, value: item.value, labelSize: 31, valueSize: 66 });
  });
  arrow(ctx, { x: W / 2, y: y + ch / 2, w: 42, dir: -1 });
  return ch;
}

// ---------------------------------------------------------------------------------------------

async function drawOne(ctx, s) {
  const img = await photo(new URL(`../assets/bg/${s.photo}`, import.meta.url).pathname);
  cover(ctx, img, { w: W, h: H, focus: s.focus ?? 0.5, lift: 1, zoom: s.zoom ?? 1 });

  if (s.bloom) bloom(ctx, s.bloom === 'warm'
    ? { x: W * 0.64, y: H * 0.3, r: 760 }
    : { x: W * 0.46, y: H * 0.66, r: 560, color: 'rgba(255,150,60,0.32)' });

  grade(ctx, { w: W, h: H, warm: 0.12, cool: 0.12 });
  // A common veil keeps nine very different photographs at one exposure, so the type never has to
  // fight a bright sky in one frame and a black hole in the next.
  ctx.fillStyle = `rgba(10,8,7,${s.veil ?? 0.3})`;
  ctx.fillRect(0, 0, W, H);
  scrim(ctx, { w: W, h: H, stops: s.scrim || [[0, 0.8], [0.18, 0.26], [0.4, 0.24], [0.6, 0.6], [0.8, 0.9], [1, 0.94]] });
  vignette(ctx, { w: W, h: H, strength: 0.5 });

  tape(ctx, { ...TAPE, width: W, text: s.kicker, size: 44 });
  await logo(ctx, W - 62 - 148, 236, 148);
  capsule(ctx, { x: 58, y: 252, text: `${fa(s.slot)}/${fa(stories.length)}` });

  // 1. hook under the ticker/logo
  const hookH = hookBlock(ctx, s.hook, 236);
  const hookBottom = hookH ? 236 + hookH : 236;

  // 2. measure the stack
  const blocks = [];
  blocks.push({ id: 'hero', h: (s.head ? 168 : 0) + 118 + (s.sub ? 58 : 0) });
  if (s.body) blocks.push({ id: 'body', h: Math.min(3, wrap(ctx, s.body, { family: 'VazirMedium', size: 36, maxWidth: W - 180 }).length) * 56 });
  if (s.steps) blocks.push({ id: 'steps', h: 200 });
  if (s.cards) blocks.push({ id: 'cards', h: s.cards[0].key === 'figure' ? 226 : 214 });
  if (s.noteCards) s.noteCards.forEach((_, i) => blocks.push({ id: `note${i}`, h: 0 }));
  if (s.contacts) blocks.push({ id: 'contacts', h: s.contacts.length * 138 + (s.contacts.length - 1) * 16 });
  if (s.dates) blocks.push({ id: 'dates', h: 152 });
  const measured = blocks.map((b) => {
    if (b.id.startsWith('note')) {
      const card_ = s.noteCards[Number(b.id.slice(4))];
      const lines = wrap(ctx, card_.text, { family: 'VazirMedium', size: 34, maxWidth: W - M * 2 - 120 });
      return { id: b.id, h: 74 + Math.min(3, lines.length) * 52 + 46 };
    }
    return { id: b.id, h: b.h };
  });
  const contentH = measured.reduce((sum, b) => sum + b.h, 0);
  const count = measured.length;
  const zoneTop = Math.max(ZONE.top, hookBottom + 40);
  const free = ZONE.bottom - zoneTop;
  // Distribute the spare room into the gaps, bottom-anchored: the composition sits above the strip
  // and the photograph keeps the top half, which is how the reference frames are built.
  const gapEff = count > 1 ? Math.min(86, Math.max(44, (free - contentH) / (count - 1))) : 0;
  const total = contentH + gapEff * Math.max(0, count - 1);
  let y = Math.max(zoneTop, ZONE.bottom - total);
  const gap = gapEff;

  for (const b of measured) {
    if (b.id === 'hero') y += heroBlock(ctx, s, y);
    if (b.id === 'body') y += bodyBlock(ctx, s.body, y);
    if (b.id === 'steps') y += stepsBlock(ctx, s.steps, y);
    if (b.id === 'cards') y += pairBlock(ctx, s.cards, y, { big: s.cards[0].key === 'figure' });
    if (b.id.startsWith('note')) y += noteCardBlock(ctx, s.noteCards[Number(b.id.slice(4))], y);
    if (b.id === 'contacts') y += contactsBlock(ctx, s.contacts, y);
    if (b.id === 'dates') y += datesBlock(ctx, s.dates, y);
    y += gap;
  }

  strip(ctx, s.strip);
  grain(ctx, { w: W, h: H, opacity: 0.052 });

  return { id: s.id, day: s.day, slot: s.slot, w: W, h: H, bottom: Math.round(y - gap) };
}

export async function drawStory(ctx, slot) {
  const s = stories[slot - 1];
  if (!s) throw new Error(`story slot ${slot} does not exist (1…${stories.length})`);
  ctx.clearRect(0, 0, W, H);
  return drawOne(ctx, s);
}

export const STORY_COUNT = stories.length;
