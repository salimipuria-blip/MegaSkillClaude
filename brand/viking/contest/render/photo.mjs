// Photographic finishing for the contest frames.
//
// The base photographs are generated without any lettering, then graded here so all nine frames
// share one colour world: warm amber highlights, deep but open green shadows, a soft vignette and
// a controlled black scrim exactly where the Persian type goes. Grain is added last so panels and
// text still sit on top of it.

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const cache = new Map();
let grainTile = null;

export async function photo(path) {
  if (!cache.has(path)) {
    if (!existsSync(path)) throw new Error(`background photo missing: ${path}`);
    cache.set(path, await loadImage(path));
  }
  return cache.get(path);
}

/**
 * Draw a photo to cover the whole frame.
 * `focus` is the vertical anchor (0 = top of image, 1 = bottom) so crops choose the subject band
 * deliberately instead of always centring.
 */
export function cover(ctx, img, { w, h, focus = 0.5, focusX = 0.5, zoom = 1, grade = true, blur = 0, lift = 1 }) {
  const scale = Math.max(w / img.width, h / img.height) * zoom * lift;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (w - dw) * focusX;
  const dy = (h - dh) * focus;
  ctx.save();
  ctx.filter = grade
    ? `saturate(1.1) contrast(1.06) brightness(0.99)${blur ? ` blur(${blur}px)` : ''}`
    : blur
      ? `blur(${blur}px)`
      : 'none';
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

/** Warm/cool split grade: amber highlights riding on cool, deep shadows. */
export function grade(ctx, { w, h, warm = 0.12, cool = 0.1 }) {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(255,168,74,${warm})`);
  g.addColorStop(0.55, `rgba(255,140,50,${warm * 0.35})`);
  g.addColorStop(1, `rgba(20,40,30,${cool})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Soft lens vignette; keeps the eye on the centred type without crushing the corners to black. */
export function vignette(ctx, { w, h, strength = 0.55, inner = 0.34 }) {
  ctx.save();
  const g = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * inner, w / 2, h * 0.46, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.62, `rgba(0,0,0,${strength * 0.35})`);
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Vertical scrim. `stops` is [[position, alpha], …] from top to bottom — the references darken the
 * lower half hard so white Persian type holds against bright water and foliage.
 */
export function scrim(ctx, { w, h, stops }) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [pos, alpha] of stops) g.addColorStop(pos, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Fine film grain, generated once and reused; drawn in overlay so it also textures the panels. */
export function grain(ctx, { w, h, opacity = 0.055, size = 220 }) {
  if (!grainTile) {
    const c = createCanvas(size, size);
    const g = c.getContext('2d');
    const data = g.createImageData(size, size);
    for (let i = 0; i < data.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 210;
      data.data[i] = v;
      data.data[i + 1] = v;
      data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    g.putImageData(data, 0, 0);
    grainTile = c;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = opacity;
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) ctx.drawImage(grainTile, x, y);
  }
  ctx.restore();
}

/** Soft warm bloom around a light source, used to lift the sunrise frames. */
export function bloom(ctx, { x, y, r, color = 'rgba(255,176,84,0.5)' }) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(0.42, color.replace(/[\d.]+\)$/, '0.14)'));
  g.addColorStop(1, 'rgba(255,140,50,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Resolve a photo name under the contest assets folder. */
export const bgPath = (name) => resolve(join(process.cwd(), 'assets/bg', name));
