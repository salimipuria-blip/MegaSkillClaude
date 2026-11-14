// Vector furniture for the Viking contest frames: the angled tape, the official round logo, the
// slide capsule, the dark cards and a small hand-built icon set.
//
// The references draw their icons as thin amber outlines, not emoji. Emoji would drag a colour
// font into the render and break the palette, so every icon here is a stroked path.

import { loadImage } from '@napi-rs/canvas';
import { join } from 'node:path';
import { BRAND } from './type.mjs';
import { C } from './tokens.mjs';
import { line } from './type.mjs';

const imgCache = new Map();

// Characters Lalezar cannot draw; the ticker and strips must never print them.
const MISSING = new Set([...'·•—–|/✦★◆●◦\u200e\u200f']);

/**
 * Family that can actually draw `text`. Lalezar has no Latin glyphs at all, so any string mixing
 * Persian with a Latin word, a bullet or a slash is set in Vazirmatn instead of printing tofu.
 */
/**
 * Display type in Lalezar with any trailing ASCII punctuation («!») drawn in Vazirmatn, because
 * Lalezar ships no Latin glyphs and would otherwise print a tofu box next to «رایگان».
 */
export function displayWithPunctuation(ctx, text, x, y, opts = {}) {
  const { size = 120, color = '#fff', align = 'center', dir = 'rtl' } = opts;
  const match = text.match(/^(.*?)([!?.,]+)$/);
  if (!match) return line(ctx, text, x, y, { ...opts, family: 'Lalezar', size, color, align, dir });
  const [, body, punct] = match;
  ctx.save();
  ctx.direction = dir;
  ctx.font = `${size}px Lalezar`;
  const bodyW = ctx.measureText(body).width;
  ctx.font = `${Math.round(size * 0.86)}px VazirBlack`;
  const punctW = ctx.measureText(punct).width;
  const total = bodyW + punctW + size * 0.02;
  // RTL: the word sits on the right, the punctuation hangs off its left edge.
  const startX = align === 'center' ? x + total / 2 : align === 'right' ? x : x + total;
  ctx.restore();
  line(ctx, body, startX, y, { ...opts, family: 'Lalezar', size, color, align: 'right', dir: 'rtl' });
  line(ctx, punct, startX - bodyW - size * 0.02, y, {
    ...opts, family: 'VazirBlack', size: Math.round(size * 0.86), color, align: 'left', dir: 'ltr',
  });
  return undefined;
}

export function safeFamily(text, preferred = 'Lalezar') {
  const unsupported = [...text].some(
    (ch) => (ch.codePointAt(0) < 0x7f && ch !== ' ') || MISSING.has(ch),
  );
  return unsupported ? 'VazirBlack' : preferred;
}

/** Load (and cache) a local image; the renderer never fetches anything over the network. */
export async function localImage(name) {
  if (!imgCache.has(name)) imgCache.set(name, await loadImage(join(BRAND, name)));
  return imgCache.get(name);
}

/**
 * Oversized angled tape across the frame. The band extends past both edges so the rotation never
 * exposes a corner, exactly as in the references.
 */
export function tape(ctx, { y, h, angle, width, color = C.tape, text = null, font = null, size = 42, color2 = C.ink, inset = 0, repeat = true }) {
  ctx.save();
  ctx.translate(width / 2, y + h / 2);
  ctx.rotate((angle * Math.PI) / 180);
  const w = width + h * 2.4;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (text) {
    ctx.font = `${size}px ${font || 'Lalezar'}`;
    // Lalezar has no «·» glyph (it would render as a tofu box); a Persian comma is the correct
    // separator for Persian copy and is present in every brand face.
    const sep = ' ، ';
    let label = text;
    if (repeat) {
      // The references run the same ticker line edge to edge; repeat it rather than stretch it.
      // Repeat the ticker while it still fits comfortably; the band is rotated, so a line that
      // only *just* fits would lose words at the slanted edges.
      const limit = width * 0.86;
      let guard = 1;
      while (guard < 3) {
        const next = `${label}${sep}${text}`;
        if (ctx.measureText(next).width > limit) break;
        label = next;
        guard += 1;
      }
    }
    // A ticker that would still overflow is scaled down rather than clipped by the frame edge.
    const safeWidth = width * 0.86;
    const over = ctx.measureText(label).width - safeWidth;
    let s2 = size;
    if (over > 0) s2 = Math.max(30, Math.floor((size * safeWidth) / ctx.measureText(label).width));
    ctx.font = `${s2}px ${font || 'Lalezar'}`;
    // Belt and braces: if a glyph is still missing from the face, drop it instead of drawing tofu.
    const safe = [...label].filter((ch) => MISSING.has(ch) ? false : true).join('');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillStyle = color2;
    ctx.fillText(safe || label, 0, s2 * 0.04 + inset);
  }
  ctx.restore();
}

/** The official logo, used verbatim (never redrawn) with a soft drop shadow. */
export async function logo(ctx, x, y, size, { shadow = true } = {}) {
  const img = await localImage('logo.png');
  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 8;
  }
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

/** The «۲/۳» slide capsule from the reference's top-left corner. */
export function capsule(ctx, { x, y, text, size = 27, padX = 20, padY = 9 }) {
  ctx.save();
  ctx.font = `${size}px VazirBold`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + padX * 2;
  const h = size + padY * 2;
  ctx.fillStyle = 'rgba(24,20,17,0.82)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#F1E8DC';
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  ctx.restore();
  return { w, h };
}

/** Dark translucent card with the reference's thin amber hairline. */
export function card(ctx, { x, y, w, h, radius = 26, fill = C.card, border = 'rgba(243,154,43,0.62)', lw = 2.4, glow = 0 }) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = 'rgba(243,154,43,0.35)';
    ctx.shadowBlur = glow;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = border;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.restore();
}

/** Label/value capsule pair used for dates («حرکت ۵ آذر ← پایان ۶ آذر»). */
export function clockCard(ctx, {
  x, y, w, h,
  label, value,
  labelSize = 30, valueSize = 52,
  radius = 22,
  align = 'center',
}) {
  card(ctx, { x, y, w, h, radius, fill: 'rgba(16,13,11,0.88)', border: 'rgba(243,154,43,0.85)', lw: 2.6 });
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const cx = align === 'center' ? x + w / 2 : align === 'right' ? x + w - 22 : x + 22;
  ctx.font = `${labelSize}px VazirMedium`;
  ctx.fillStyle = C.mute;
  ctx.fillText(label, cx, y + labelSize + 12);
  ctx.font = `${valueSize}px Lalezar`;
  ctx.fillStyle = C.amber;
  const m = ctx.measureText(value);
  const vw = m.width;
  if (vw > w - 26) {
    const scaled = Math.floor((valueSize * (w - 26)) / vw);
    ctx.font = `${scaled}px Lalezar`;
  }
  ctx.fillText(value, cx, y + h - 18);
  ctx.restore();
}

/** Thin arrow (←) drawn as a path so its weight matches the cards at any scale. */
export function arrow(ctx, { x, y, w = 44, color = C.amber, lw = 4.5, dir = 1 }) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - (dir * w) / 2, y);
  ctx.lineTo(x + (dir * w) / 2, y);
  ctx.moveTo(x + (dir * w) / 2 - dir * w * 0.34, y - w * 0.3);
  ctx.lineTo(x + (dir * w) / 2, y);
  ctx.lineTo(x + (dir * w) / 2 - dir * w * 0.34, y + w * 0.3);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Icon set — 24×24 design grid, stroked, scaled by `s`.
// ---------------------------------------------------------------------------------------------

const ICONS = {
  fire(ctx) {
    // campfire: flame + two crossed logs
    ctx.moveTo(12, 3);
    ctx.bezierCurveTo(16, 7, 17.5, 9, 17.5, 11.5);
    ctx.bezierCurveTo(17.5, 14.6, 15.1, 17, 12, 17);
    ctx.bezierCurveTo(8.9, 17, 6.5, 14.6, 6.5, 11.5);
    ctx.bezierCurveTo(6.5, 9.4, 7.6, 8.2, 9, 6.6);
    ctx.bezierCurveTo(9.3, 8.4, 10.1, 9.2, 11.2, 9.6);
    ctx.bezierCurveTo(11.1, 7.4, 11.4, 5.2, 12, 3);
    ctx.closePath();
    ctx.moveTo(4, 20.5);
    ctx.lineTo(20, 17.5);
    ctx.moveTo(4, 17.5);
    ctx.lineTo(20, 20.5);
  },
  music(ctx) {
    ctx.moveTo(9, 18);
    ctx.bezierCurveTo(9, 19.7, 7.7, 21, 6, 21);
    ctx.bezierCurveTo(4.3, 21, 3, 19.7, 3, 18);
    ctx.bezierCurveTo(3, 16.3, 4.3, 15, 6, 15);
    ctx.bezierCurveTo(7.7, 15, 9, 16.3, 9, 18);
    ctx.closePath();
    ctx.moveTo(9, 18);
    ctx.lineTo(9, 5.5);
    ctx.lineTo(20, 3);
    ctx.lineTo(20, 15.5);
    ctx.moveTo(20, 15.5);
    ctx.bezierCurveTo(20, 17.2, 18.7, 18.5, 17, 18.5);
    ctx.bezierCurveTo(15.3, 18.5, 14, 17.2, 14, 15.5);
    ctx.bezierCurveTo(14, 13.8, 15.3, 12.5, 17, 12.5);
    ctx.bezierCurveTo(18.7, 12.5, 20, 13.8, 20, 15.5);
    ctx.closePath();
  },
  cinema(ctx) {
    ctx.rect(3, 5.5, 18, 13);
    ctx.moveTo(8.2, 8.8);
    ctx.lineTo(13.4, 12);
    ctx.lineTo(8.2, 15.2);
    ctx.closePath();
  },
  forest(ctx) {
    ctx.moveTo(12, 2.5);
    ctx.lineTo(17.5, 10.5);
    ctx.lineTo(14.6, 10.5);
    ctx.lineTo(19, 16.5);
    ctx.lineTo(12.9, 16.5);
    ctx.lineTo(12.9, 21.5);
    ctx.lineTo(11.1, 21.5);
    ctx.lineTo(11.1, 16.5);
    ctx.lineTo(5, 16.5);
    ctx.lineTo(9.4, 10.5);
    ctx.lineTo(6.5, 10.5);
    ctx.closePath();
  },
  home(ctx) {
    ctx.moveTo(3.5, 10.5);
    ctx.lineTo(12, 3);
    ctx.lineTo(20.5, 10.5);
    ctx.moveTo(5.8, 9);
    ctx.lineTo(5.8, 20.5);
    ctx.lineTo(18.2, 20.5);
    ctx.lineTo(18.2, 9);
    ctx.moveTo(10, 20.5);
    ctx.lineTo(10, 14.5);
    ctx.lineTo(14, 14.5);
    ctx.lineTo(14, 20.5);
  },
  river(ctx) {
    ctx.moveTo(3, 6.5);
    ctx.bezierCurveTo(6, 4, 8, 5.5, 11, 6.5);
    ctx.bezierCurveTo(14, 7.5, 15.5, 5.2, 18.5, 4.8);
    ctx.moveTo(3, 12);
    ctx.bezierCurveTo(6, 9.5, 8, 11, 11, 12);
    ctx.bezierCurveTo(14, 13, 15.5, 10.7, 18.5, 10.3);
    ctx.moveTo(3, 17.5);
    ctx.bezierCurveTo(6, 15, 8, 16.5, 11, 17.5);
    ctx.bezierCurveTo(14, 18.5, 15.5, 16.2, 18.5, 15.8);
  },
  paddle(ctx) {
    // paddleboard + paddle
    ctx.moveTo(2.5, 19.5);
    ctx.bezierCurveTo(8, 17.4, 16, 17.4, 21.5, 19.5);
    ctx.moveTo(12.5, 16.5);
    ctx.lineTo(15.5, 4.5);
    ctx.moveTo(14.9, 6.6);
    ctx.lineTo(17, 3.5);
  },
  tent(ctx) {
    ctx.moveTo(12, 3.5);
    ctx.lineTo(21, 20.5);
    ctx.lineTo(3, 20.5);
    ctx.closePath();
    ctx.moveTo(12, 3.5);
    ctx.lineTo(12, 20.5);
    ctx.moveTo(7.6, 20.5);
    ctx.lineTo(12, 13.5);
    ctx.lineTo(16.4, 20.5);
  },
  plate(ctx) {
    ctx.beginPath();
    ctx.arc(12, 12, 8.6, 0, Math.PI * 2);
    ctx.moveTo(12, 3.4);
    ctx.arc(12, 12, 4.4, 0, Math.PI * 2);
  },
  car(ctx) {
    ctx.moveTo(3, 15.5);
    ctx.lineTo(3, 11.5);
    ctx.lineTo(5.6, 6.5);
    ctx.lineTo(18.4, 6.5);
    ctx.lineTo(21, 11.5);
    ctx.lineTo(21, 15.5);
    ctx.closePath();
    ctx.moveTo(3, 11.5);
    ctx.lineTo(21, 11.5);
    ctx.moveTo(6.5, 15.5);
    ctx.arc(6.5, 15.5, 2, 0, Math.PI * 2);
    ctx.moveTo(17.5, 15.5);
    ctx.arc(17.5, 15.5, 2, 0, Math.PI * 2);
  },
  clock(ctx) {
    ctx.beginPath();
    ctx.arc(12, 12, 8.8, 0, Math.PI * 2);
    ctx.moveTo(12, 6.5);
    ctx.lineTo(12, 12);
    ctx.lineTo(16, 14.5);
  },
  gift(ctx) {
    ctx.rect(3.5, 8.5, 17, 12);
    ctx.moveTo(3.5, 12.8);
    ctx.lineTo(20.5, 12.8);
    ctx.moveTo(12, 8.5);
    ctx.lineTo(12, 20.5);
    ctx.moveTo(12, 8.5);
    ctx.bezierCurveTo(9.5, 8.3, 6.2, 7.4, 6.8, 5);
    ctx.bezierCurveTo(7.4, 2.9, 11, 4.6, 12, 8.5);
    ctx.moveTo(12, 8.5);
    ctx.bezierCurveTo(14.5, 8.3, 17.8, 7.4, 17.2, 5);
    ctx.bezierCurveTo(16.6, 2.9, 13, 4.6, 12, 8.5);
  },
  camera(ctx) {
    ctx.roundRect?.(3, 7.5, 18, 12.5, 2.5);
    ctx.moveTo(8.5, 7.5);
    ctx.lineTo(9.9, 4.5);
    ctx.lineTo(14.1, 4.5);
    ctx.lineTo(15.5, 7.5);
    ctx.moveTo(12, 8.6);
    ctx.arc(12, 13.6, 3.6, 0, Math.PI * 2);
  },
  people(ctx) {
    ctx.beginPath();
    ctx.arc(9, 8, 3.4, 0, Math.PI * 2);
    ctx.moveTo(2.8, 20.5);
    ctx.bezierCurveTo(2.8, 16.2, 5.6, 13.6, 9, 13.6);
    ctx.bezierCurveTo(12.4, 13.6, 15.2, 16.2, 15.2, 20.5);
    ctx.moveTo(15.4, 5.2);
    ctx.arc(16.6, 8.2, 2.8, 0, Math.PI * 2);
    ctx.moveTo(17.4, 13.8);
    ctx.bezierCurveTo(19.9, 14.4, 21.4, 16.8, 21.4, 20.5);
  },
  repair(ctx) {
    ctx.moveTo(20.5, 6.5);
    ctx.bezierCurveTo(19, 5, 16.4, 5, 15, 6.4);
    ctx.lineTo(6.4, 15);
    ctx.bezierCurveTo(5, 16.4, 5, 19, 6.5, 20.5);
    ctx.bezierCurveTo(8, 22, 10.6, 22, 12, 20.6);
    ctx.lineTo(20.6, 12);
    ctx.bezierCurveTo(22, 10.6, 22, 8, 20.5, 6.5);
    ctx.closePath();
    ctx.moveTo(8.2, 8.2);
    ctx.lineTo(10.2, 10.2);
  },
  plus(ctx) {
    ctx.moveTo(12, 4);
    ctx.lineTo(12, 20);
    ctx.moveTo(4, 12);
    ctx.lineTo(20, 12);
  },
  pin(ctx) {
    ctx.moveTo(12, 21);
    ctx.bezierCurveTo(12, 21, 19.5, 14.2, 19.5, 9.2);
    ctx.bezierCurveTo(19.5, 5.1, 16.1, 2.5, 12, 2.5);
    ctx.bezierCurveTo(7.9, 2.5, 4.5, 5.1, 4.5, 9.2);
    ctx.bezierCurveTo(4.5, 14.2, 12, 21, 12, 21);
    ctx.closePath();
    ctx.moveTo(12, 6.4);
    ctx.arc(12, 9.2, 2.8, 0, Math.PI * 2);
  },
  shield(ctx) {
    ctx.moveTo(12, 2.4);
    ctx.lineTo(20, 5.4);
    ctx.lineTo(20, 11.4);
    ctx.bezierCurveTo(20, 17.4, 16.4, 20.2, 12, 21.6);
    ctx.bezierCurveTo(7.6, 20.2, 4, 17.4, 4, 11.4);
    ctx.lineTo(4, 5.4);
    ctx.closePath();
    ctx.moveTo(8.6, 11.8);
    ctx.lineTo(11.2, 14.4);
    ctx.lineTo(15.6, 9.2);
  },
  whatsapp(ctx) {
    ctx.moveTo(20.5, 12);
    ctx.bezierCurveTo(20.5, 16.7, 16.7, 20.5, 12, 20.5);
    ctx.bezierCurveTo(10.3, 20.5, 8.7, 20, 7.4, 19.1);
    ctx.lineTo(3.5, 20.5);
    ctx.lineTo(5, 16.7);
    ctx.bezierCurveTo(4.1, 15.4, 3.5, 13.8, 3.5, 12);
    ctx.bezierCurveTo(3.5, 7.3, 7.3, 3.5, 12, 3.5);
    ctx.bezierCurveTo(16.7, 3.5, 20.5, 7.3, 20.5, 12);
    ctx.closePath();
    ctx.moveTo(9.2, 8.4);
    ctx.bezierCurveTo(9.6, 8.2, 10.2, 8.4, 10.5, 9);
    ctx.bezierCurveTo(10.8, 9.6, 11, 10.2, 10.6, 10.7);
    ctx.bezierCurveTo(11.2, 11.8, 12.2, 12.8, 13.4, 13.3);
    ctx.bezierCurveTo(13.9, 12.9, 14.4, 13.1, 15, 13.4);
    ctx.bezierCurveTo(15.6, 13.7, 15.7, 14.3, 15.5, 14.7);
    ctx.bezierCurveTo(15.1, 15.6, 14.1, 16, 13.2, 15.8);
    ctx.bezierCurveTo(10.8, 15.3, 8.7, 13.2, 8.2, 10.8);
    ctx.bezierCurveTo(8, 9.9, 8.4, 8.8, 9.2, 8.4);
    ctx.closePath();
  },
};

/** Draw an icon centred in a `s`×`s` box at (x, y). */
export function icon(ctx, name, x, y, s, { color = C.amber, lw = 1.9, alpha = 1 } = {}) {
  const draw = ICONS[name];
  if (!draw) throw new Error(`unknown icon "${name}"`);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = (lw * 24) / s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  draw(ctx);
  ctx.stroke();
  ctx.restore();
}

export const ICON_NAMES = Object.keys(ICONS);
