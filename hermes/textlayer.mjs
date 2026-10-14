// The text layer for Hermes photo editing: a real typographic overlay, drawn with an actual font,
// never by the image model. The image models mangle Persian script, so the honest answer to
// «روی عکس بنویس» is not a refusal any more - it is this module.
//
// How it works (no native dependencies anywhere):
//   1. textRequest()  reads the request: the words to set, where they go, in what style.
//   2. designSpec()   turns that into a design: font size for the frame, palette with a guarantee of
//                     legibility (stroke + soft shadow), optional banner strip, RTL/LTR by script.
//   3. textLayout()   wraps the words into lines with a conservative width estimate (the real browser
//                     canvas shapes and measures them again, which is why wrapping stays safe).
//   4. three executors for the same layer:
//        - the app draws it on a <canvas> with Vazirmatn (real shaping, RTL, downloadable PNG),
//        - renderTextLayer() renders it server-side through Cloudflare Browser Rendering when the
//          BROWSER binding exists (optional, so Telegram gets a composed picture too),
//        - svgOverlay() writes the same layer as an SVG document for a designer's toolchain.
//
// Craft references: library/github-skills/image-studio (when text belongs on a photo at all),
// prompt-master (short, purposeful copy), product-photo-studio (brand-safe placement).

import { imageInfo, base64Bytes, bytesToBase64, faDigits } from './image-bytes.mjs';

/** Where the block sits on the frame. */
export const LAYER_POSITIONS = ['top', 'middle', 'bottom'];
export const POSITION_LABEL = { top: 'بالای عکس', middle: 'وسط عکس', bottom: 'پایین عکس' };
const POSITION_WORDS = [
  ['top', /(?:بالا|سر(?:صفحه)?|هدر|top|header)/iu],
  ['middle', /(?:وسط|میان|مرکز|center|middle)/iu],
  ['bottom', /(?:پایین|زیر|تهٔ|ته‌|bottom|footer|lower)/iu],
];
const STYLE_WORDS = [
  // The brand name is not a colour instruction: «کمپ وایکینگ» is copy, not styling.
  ['gold', /(?:طلایی|طلائی|زر|طلا|گلد|gold)/iu],
  ['white', /(?:سفید|white)/iu],
  ['dark', /(?:مشکی|سیاه|تیره|dark|black)/iu],
];
const BIG_WORDS = /(?:بزرگ|درشت|تیتر|big|large|title|headline)/iu;
const SMALL_WORDS = /(?:کوچک|کوچیک|ریز|small|tiny)/iu;
const BAR_WORDS = /(?:نوار|پلاک|کادر|باکس|پس\s*زمینه|banner|bar|plate|box)/iu;
const LOGO_WORDS = /(?<![\p{L}])(?:لوگو|لوگوتایپ|logo|watermark|واترمارک)(?![\p{L}])/iu;
// Words that are about the styling, not the message: they are stripped from the tail of the text.
const STYLE_TAIL = /(?:[\s،,]+با\s*(?:فونت|رنگ)\s*\S+[\s\S]*|[\s،,]+in\s+(?:white|gold|black|bold|red)\b[\s\S]*|[\s،,]+(?:طلایی|سفید|مشکی|سیاه|تیره|گلد)[\s،,]*(?:و\s*\S+)?[\s\S]*)$/iu;

const quoted = (s) => {
  const m = s.match(/[«"'“]([^«»"'”]{1,140})[»"'”]/u);
  return m ? m[1].trim() : '';
};
const afterColon = (s) => {
  const i = s.search(/[:：]/u);
  return i === -1 ? '' : s.slice(i + 1).trim();
};
const afterVerb = (s) => {
  const m = s.match(/(?:بنویس|بنویسی|نوشته\s*بشه|write|add\s+text|تایپ\s*کن)\s*(?:که|:)?\s*([\s\S]{1,140})/iu);
  return m ? m[1].trim() : '';
};
/** The words themselves: from quotes, after a colon, or after the verb - cleaned of styling tails. */
function readWords(raw) {
  const body = quoted(raw) || afterColon(raw) || afterVerb(raw);
  return body.replace(STYLE_TAIL, '').replace(/^[\s:：،,.«»"'“”-]+|[\s:：،,.«»"'“”-]+$/gu, '').trim();
}

/**
 * Read a "put text on this photo" request. Returns the words plus the design hints, or null when the
 * message is not about setting text (a logo/watermark request is deliberately not text).
 */
export function textRequest(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 300) return null;
  if (!/(?:متن|نوشته|بنویس|بنویسی|تیتر|کپشن|شعار|write|text|title|caption|تیتراژ)/iu.test(raw)) return null;
  if (LOGO_WORDS.test(raw) && !/(?:متن|نوشته|بنویس|تیتر)/u.test(raw)) return null;
  const body = readWords(raw);
  if (!body || body.length < 2 || /^(?:متن|نوشته|text|something|چیزی)$/iu.test(body)) return null;
  const position = (POSITION_WORDS.find(([, re]) => re.test(raw)) || ['bottom'])[0];
  const style = (STYLE_WORDS.find(([, re]) => re.test(raw)) || ['auto'])[0];
  const size = BIG_WORDS.test(raw) ? 1.25 : SMALL_WORDS.test(raw) ? 0.75 : 1;
  const rtl = /[\u0600-\u06ff]/.test(body);
  return { text: body.slice(0, 140), position, style, size, bar: BAR_WORDS.test(raw), rtl };
}

/** Palettes: every one keeps the text readable on an unknown photo (stroke + soft drop shadow). */
export const PALETTES = {
  gold: { fill: '#f5a623', stroke: 'rgba(12,16,22,0.75)', shadow: 'rgba(0,0,0,0.55)', bar: 'rgba(8,12,18,0.42)' },
  white: { fill: '#ffffff', stroke: 'rgba(10,14,20,0.70)', shadow: 'rgba(0,0,0,0.55)', bar: 'rgba(8,12,18,0.40)' },
  dark: { fill: '#0d1117', stroke: 'rgba(255,255,255,0.75)', shadow: 'rgba(255,255,255,0.35)', bar: 'rgba(255,255,255,0.42)' },
};
export const FONT_STACK = "Vazirmatn, 'Segoe UI', Tahoma, system-ui, sans-serif";

/**
 * The design for one frame. Sizes are relative to the picture so the same layer looks right on a
 * 1080x1350 story and on a 4000px photo. `tone` comes from the retoucher brief (or the caller) and
 * only decides which palette "auto" picks.
 */
export function designSpec({ text, width = 1024, height = 1024, position = 'bottom', style = 'auto', size = 1, bar = false, tone = 'mixed', weight = 600, offset = 0 }) {
  const W = Math.max(64, Math.round(width || 1024));
  const H = Math.max(64, Math.round(height || 1024));
  const words = String(text || '').trim();
  const rtl = /[\u0600-\u06ff]/.test(words);
  const chosen = style !== 'auto' ? style : tone === 'light' ? 'dark' : 'white';
  const sizeFactor = Number(size) > 0 ? Number(size) : 1;
  const pos = LAYER_POSITIONS.includes(position) ? position : 'bottom';
  // `offset` is a nudge in fractions of the height (positive = down), for «کمی بالاتر/پایین‌تر».
  const nudge = Math.min(0.10, Math.max(-0.10, Number(offset) || 0));
  const palette = PALETTES[chosen] || PALETTES.white;
  const margin = Math.round(H * 0.045);
  const maxWidth = Math.round(W * 0.88);
  // Start from a headline size for the frame and shrink until the longest word fits on one line.
  const base = Math.min(H * 0.085, W * 0.12) * sizeFactor;
  const longestWord = Math.max(...words.split(/\s+/).map((w) => w.length), 1);
  const fitted = Math.min(base, (maxWidth * 0.9) / (longestWord * 0.58));
  // One line is the cleaner design when the words still read large that way; below half the headline
  // size the block wraps instead of shrinking into a thin line.
  // 6% safety margin so the wrapping estimate can never push a "one line" design onto two lines.
  const oneLine = (maxWidth * 0.94) / (Math.max(words.length, 1) * AVG_GLYPH);
  const headline = oneLine >= base * 0.5 ? Math.min(base, oneLine) : Math.min(base, fitted);
  const fontSize = Math.max(Math.round(H * 0.032), Math.round(headline));
  return {
    text: words, style: chosen, tone, bar: !!bar, rtl, direction: rtl ? 'rtl' : 'ltr',
    position: pos, offset: nudge,
    // The knobs, unchanged and re-runnable: a follow-up («بالاتر ببر»، «سفیدش کن») replays them.
    design: { text: words, position: pos, style: chosen, size: sizeFactor, bar: !!bar, offset: nudge, tone, weight },
    font: FONT_STACK, weight, align: 'center',
    width: W, height: H, maxWidth, margin,
    fontSize, lineHeight: Math.round(fontSize * 1.32),
    fill: palette.fill, stroke: palette.stroke, bar_fill: palette.bar,
    strokeWidth: Math.max(2, Math.round(fontSize * 0.055)),
    shadow: { color: palette.shadow, blur: Math.max(4, Math.round(fontSize * 0.22)), dx: 0, dy: Math.max(1, Math.round(fontSize * 0.045)) },
    chars: words.length,
  };
}

/** Average advance width of the font as a fraction of the font size (Vazirmatn is fairly average). */
export const AVG_GLYPH = 0.58;
const estimate = (s, size) => s.length * AVG_GLYPH * size;

/**
 * Wrap the words into lines that fit the frame and place the block. The wrapping estimate is
 * deliberately conservative (wider than reality) and the browser/canvas re-measures for real, so a
 * line never overflows the safe area.
 */
export function textLayout(spec, { measure = null, maxLines = 4 } = {}) {
  const width = measure || ((s, size) => estimate(s, size));
  let fontSize = spec.fontSize;
  let lines = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    lines = [];
    let line = '';
    // A word longer than one line (a wall of characters, a URL) is hard-broken by characters.
    const perLine = Math.max(4, Math.floor(spec.maxWidth / (AVG_GLYPH * fontSize)));
    const words = spec.text.split(/\s+/).flatMap((w) => {
      if (w.length <= perLine) return [w];
      const chunks = [];
      for (let i = 0; i < w.length; i += perLine) chunks.push(w.slice(i, i + perLine));
      return chunks;
    });
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && width(candidate, fontSize) > spec.maxWidth) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines) break;
    fontSize = Math.max(Math.round(spec.height * 0.028), Math.round(fontSize * 0.85));
  }
  if (lines.length > maxLines) { // last resort: cut with an ellipsis instead of spilling
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(2, lines[maxLines - 1].length - 1))}…`;
  }
  const lineHeight = Math.round(fontSize * 1.32);
  const blockHeight = lineHeight * lines.length;
  const pad = Math.round(fontSize * 0.35);
  // A nudge («کمی بالاتر») shifts the block; the block never leaves the safe area, so the words stay
  // on the picture even when the user keeps pushing in one direction.
  const want = Math.round((Number(spec.offset) || 0) * spec.height);
  const lo = spec.margin + Math.round(blockHeight / 2);
  const hi = Math.max(lo, spec.height - spec.margin - Math.round(blockHeight / 2));
  const anchors = {
    top: spec.margin + Math.round(blockHeight / 2),
    middle: Math.round(spec.height / 2) - Math.round(spec.height * 0.02),
    bottom: spec.height - spec.margin - Math.round(blockHeight / 2),
  };
  const centres = {};
  for (const key of Object.keys(anchors)) centres[key] = Math.min(Math.max(anchors[key] + want, lo), hi);
  const home = (spec.design && spec.design.position) || spec.position || 'bottom';
  const effective = spec.height ? (centres[home] - anchors[home]) / spec.height : 0;
  return {
    ...spec, lines, fontSize, lineHeight, blockHeight,
    design: { ...(spec.design || {}), offset: effective },
    positions: centres, x: Math.round(spec.width / 2),
    barBox: { x: 0, width: spec.width, height: blockHeight + pad * 2, pad, radius: 0 },
    firstLineOffset: Math.round(((lines.length - 1) * lineHeight) / 2),
  };
}

const TUNE_TARGET = /(?:متن|نوشته|تیتر|عنوان|لایه|شعار|کپشن|کلمه|کلمات|text|title|caption|layer)/iu;
const PHOTO_TARGET = /(?:عکس|تصویر|فریم|photo|image|picture)/iu;
// Words that mean the *photo*, not the words on it: «کیفیتش رو بالا ببر» is a different job.
const EDIT_NOISE = /(?:کیفیت|وضوح|رزولوشن|شارپ|تیز|شاپ|ریتوش|نویز|روشنایی|کنتراست|اشباع|رنگ\u200cبندی|پس\u200cزمینه|بک\u200cگراند|کراپ|بزرگنمایی|watermark)/iu;
// «برش» alone means cropping the photo, but «ببرش بالاتر» is a move: the word needs its boundaries.
const CROP_NOISE = /(?<![\p{L}])برش(?:ش)?(?![\p{L}])/iu;
const UP_WORDS = /(?:بالاتر|بیارش?\s*بالا|ببرش?\s*بالا|بذارش?\s*بالا|higher|\bup\b)/iu;
const DOWN_WORDS = /(?:پایین\s*تر|پایین‌تر|ببرش?\s*پایین|بیارش?\s*پایین|بذارش?\s*پایین|lower|\bdown\b)/iu;
const MID_WORDS = /(?:وسط|میان|مرکز|center|centre|middle)/iu;
// Absolute places: «متن رو ببر بالای عکس» jumps to the anchor instead of taking one step.
const TOP_PLACE = /(?:بالای\s*(?:عکس|تصویر)|سر\s*ِ?\s*(?:عکس|تصویر)|سرصفحه|هدر|top\s+of|at\s+the\s+top)/iu;
const BOTTOM_PLACE = /(?:تهٔ?\s*(?:عکس|تصویر)|پایین\s*(?:عکس|تصویر)|زیر\s*(?:عکس|تصویر)|کف\s*(?:عکس|تصویر)|bottom\s+of|at\s+the\s+bottom)/iu;
const NUDGE_WORDS = /(?:کمی|یه\s*کم|یکم|خرده‌ای|ذره‌ای|کمتر|a\s*bit|slightly)/iu;
const MOVE_WORDS = /(?:ببر|ببرش|ببرید|بذار|بگذار|بزن|بیار|بیارش|منتقل|جابه\s*جا|جابجا|حرکت|انتقال|کن|کنش|بکن|move|bring|put|shift)/iu;
const OFF_WORDS = /(?:بردار|برداشتن|حذف|بدون|نباشه|نباشد|نخوا|نمی\s*خوام|لازم\s*نیست|remove|without|no\s+(?:bar|plate))/iu;
const REWRITE_WORDS = /(?:عوض|تغییر|جایگزین|بنویس|بنویسی|بکنش|بکن|کنش|بشه|write|change|replace)/iu;

/**
 * A follow-up that only touches the layer that is already on the photo: «بالاتر ببر»، «کمی پایین‌تر»،
 * «وسطش بذار»، «سفیدش کن»، «درشت‌ترش کن»، «نوار رو بردار»، «متن رو عوض کن به «…»»، «متن رو بردار».
 * Returns the knobs to replay, or null when the message is about the photo itself (a quality, a
 * sharpen or a retouch request belongs to the edit studio, not to the text).
 */
export function layerTuneRequest(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 200) return null;
  if (EDIT_NOISE.test(raw) || CROP_NOISE.test(raw)) return null;
  const hasTarget = TUNE_TARGET.test(raw);
  if (PHOTO_TARGET.test(raw) && !hasTarget) return null; // «عکس رو بالاتر ببر» is not about the words
  const tune = {};
  const up = UP_WORDS.test(raw), down = DOWN_WORDS.test(raw);
  const placing = MOVE_WORDS.test(raw) || hasTarget;
  if (TOP_PLACE.test(raw) && placing) tune.position = 'top';
  else if (BOTTOM_PLACE.test(raw) && placing) tune.position = 'bottom';
  else if (MID_WORDS.test(raw) && placing) tune.position = 'middle';
  else if (up && !down) {
    if (NUDGE_WORDS.test(raw) || !MOVE_WORDS.test(raw)) tune.nudge = 'up';
    else tune.move = 'up';
  } else if (down && !up) {
    if (NUDGE_WORDS.test(raw) || !MOVE_WORDS.test(raw)) tune.nudge = 'down';
    else tune.move = 'down';
  }
  const style = STYLE_WORDS.find(([, re]) => re.test(raw));
  if (style) tune.style = style[0];
  if (BIG_WORDS.test(raw)) tune.size = 1.15;
  else if (SMALL_WORDS.test(raw)) tune.size = 0.85;
  if (BAR_WORDS.test(raw)) tune.bar = !OFF_WORDS.test(raw);
  const body = readWords(raw);
  if (body && body.length >= 2 && !/^(?:متن|نوشته|تیتر|عنوان|لایه|text|title|سفید|طلایی|تیره)$/iu.test(body)
    && REWRITE_WORDS.test(raw)) tune.text = body.slice(0, 140);
  if (!tune.text && hasTarget && OFF_WORDS.test(raw) && /(?:متن|نوشته|تیتر|عنوان|لایه|شعار)/u.test(raw)
    && !BAR_WORDS.test(raw)) tune.remove = true;
  return Object.keys(tune).length ? tune : null;
}

/** The knobs behind a finished layer, so the same design can be replayed with one change. */
export function layerDesign(layer) {
  const d = (layer && layer.design) || {};
  return {
    text: d.text || (layer && layer.text) || '',
    position: d.position || (layer && layer.position) || 'bottom',
    style: d.style || (layer && layer.style) || 'auto',
    size: Number(d.size) > 0 ? Number(d.size) : 1,
    bar: d.bar != null ? !!d.bar : !!(layer && layer.bar),
    offset: Number.isFinite(d.offset) ? d.offset : 0,
    tone: d.tone || (layer && layer.tone) || 'mixed',
    weight: d.weight || (layer && layer.weight) || 600,
  };
}

/** Hop the block to the next anchor in that direction, or null when it is already at the edge. */
const HOP = { up: ['bottom', 'middle', 'top'], down: ['top', 'middle', 'bottom'] };
const hopTo = (position, dir) => {
  const next = HOP[dir].indexOf(position) + 1;
  return HOP[dir][next] || null;
};

/**
 * Replay the remembered design with one change. Pure: same frame size in, a new layout out, so the
 * worker only has to render and send. A hop at the edge of the frame becomes a small nudge instead of
 * doing nothing, and a hop back to an anchor forgets the nudge.
 */
export function applyTune(layer, tune) {
  if (!layer || !tune) return layer;
  const next = layerDesign(layer);
  if (tune.text) next.text = tune.text;
  if (tune.style) next.style = tune.style;
  if (tune.bar !== undefined) next.bar = tune.bar;
  if (tune.size) next.size = Math.min(1.6, Math.max(0.6, Math.round(next.size * tune.size * 100) / 100));
  if (tune.position) { next.position = tune.position; next.offset = 0; }
  else if (tune.move || tune.nudge) {
    const dir = tune.move || tune.nudge;
    const hop = tune.move ? hopTo(next.position, tune.move) : null;
    if (hop) { next.position = hop; next.offset = 0; }
    else {
      const step = dir === 'up' ? -0.06 : 0.06; // the offset is a fraction of the height, positive = down
      next.offset = Math.min(0.10, Math.max(-0.10, Math.round((next.offset + step) * 100) / 100));
    }
  }
  const touched = tune.text || tune.position || tune.move || tune.nudge || tune.style
    || tune.size || tune.bar !== undefined;
  if (tune.remove || !touched) return layer;
  const out = textLayout(designSpec({ ...next, width: layer.width, height: layer.height }));
  const stuck = !!(tune.move || tune.nudge) && out.position === layer.position
    && Math.abs(layerDesign(out).offset - layerDesign(layer).offset) < 0.005;
  return stuck ? { ...out, stuck: true } : out;
}

/** What the user reads after a tune: what changed, then the state of the layer. */
export function tuneCaption(prev, layer, tune, { composed = false } = {}) {
  if (tune && tune.remove) {
    return ['🔧 متن از روی عکس برداشته شد.', composed ? 'عکس بدون متن در همین پیام است.' :
      'برای دیدن نسخهٔ بدون متن، عکس را در اپ باز کن (یا دوباره بفرست).'].join('\n');
  }
  const bits = [];
  if (tune && tune.text) bits.push(`متن عوض شد به «${layer.text}»`);
  if (tune && tune.nudge) bits.push(tune.nudge === 'up' ? 'کمی بالاتر رفت' : 'کمی پایین‌تر رفت');
  else if (tune && tune.move) bits.push(tune.move === 'up' ? 'رفت بالاتر' : 'رفت پایین‌تر');
  if (tune && tune.position) bits.push(`رفت ${POSITION_LABEL[tune.position] || tune.position}`);
  if (tune && tune.style) bits.push(`رنگش ${STYLE_FA[tune.style] || tune.style} شد`);
  if (tune && tune.size) bits.push(tune.size > 1 ? 'بزرگ‌تر شد' : 'کوچک‌تر شد');
  if (tune && tune.bar === true) bits.push('نوار پشت متن روشن شد');
  if (tune && tune.bar === false) bits.push('نوار برداشته شد');
  const head = `🔧 ${bits.join(' · ') || 'لایهٔ متن به‌روز شد'}.`;
  const edge = layer && layer.stuck ? ['ℹ️ بیشتر از این جابه‌جا نمی‌شود (به لبهٔ کادر رسید).'] : [];
  return [head, ...edge, layerCaption(layer, { composed })].join('\n');
}

const LAYER_TTL = 3600;         // the layer is editable for an hour, like the rest of the edit memory
const LAYER_MAX = 4_500_000;    // base64 characters; a bigger picture is simply not remembered

/**
 * Remember the layer (and the clean picture under it) so the words can be moved by a chat message
 * without the user sending the photo again.
 */
export async function rememberTextLayer(env, key, { image, mime, layer }) {
  if (!env || !env.MEMORY || !key || !image || !layer) return false;
  if (image.length > LAYER_MAX) return false;
  const payload = JSON.stringify({ image, mime: mime || 'image/jpeg', width: layer.width,
    height: layer.height, design: layerDesign(layer) });
  try {
    await env.MEMORY.put(`edit:text:${key}`, payload, { expirationTtl: LAYER_TTL });
    return true;
  } catch (err) {
    console.error('[Hermes] rememberTextLayer failed:', err.message);
    return false;
  }
}

/** The remembered layer, rebuilt into a full layout, or null. */
export async function recallTextLayer(env, key) {
  if (!env || !env.MEMORY || !key) return null;
  try {
    const raw = await env.MEMORY.get(`edit:text:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.image !== 'string' || !parsed.design) return null;
    return { image: parsed.image, mime: parsed.mime || 'image/jpeg',
      layer: textLayout(designSpec({ ...parsed.design, width: parsed.width || 1024, height: parsed.height || 1024 })) };
  } catch { return null; }
}

/** Drop the remembered layer (the words were taken off, or the picture was edited again). */
export async function forgetTextLayer(env, key) {
  if (!env || !env.MEMORY || !key) return false;
  try { await env.MEMORY.delete(`edit:text:${key}`); return true; } catch { return false; }
}

/** The layer as a list of drawing operations (plain data: testable, and portable to any canvas). */
export function displayList(layer, position = null) {
  const pos = position || layer.position;
  const centre = layer.positions[pos];
  const top = centre - layer.firstLineOffset;
  const ops = [];
  if (layer.bar) {
    ops.push({ op: 'bar', x: 0, y: centre - Math.round(layer.barBox.height / 2), width: layer.width,
      height: layer.barBox.height, fill: layer.bar_fill });
  }
  layer.lines.forEach((line, i) => {
    ops.push({ op: 'text', text: line, x: layer.x, y: top + i * layer.lineHeight, font: layer.font,
      weight: layer.weight, fontSize: layer.fontSize, align: layer.align, direction: layer.direction,
      fill: layer.fill, stroke: layer.stroke, strokeWidth: layer.strokeWidth, shadow: layer.shadow });
  });
  return ops;
}

/** The same layer as a standalone SVG document (a designer can open it in any tool). */
export function svgOverlay(layer, position = null) {
  const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pos = position || layer.position;
  const centre = layer.positions[pos];
  const top = centre - layer.firstLineOffset;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layer.width}" height="${layer.height}" viewBox="0 0 ${layer.width} ${layer.height}">`,
    `<defs><style>@import url('https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css');</style></defs>`,
  ];
  if (layer.bar) parts.push(`<rect x="0" y="${Math.round(centre - layer.barBox.height / 2)}" width="${layer.width}" height="${layer.barBox.height}" fill="${layer.bar_fill}"/>`);
  parts.push(`<g font-family="${escape(layer.font)}" font-weight="${layer.weight}" font-size="${layer.fontSize}" text-anchor="middle" direction="${layer.direction}">`);
  for (let i = 0; i < layer.lines.length; i++) {
    const line = layer.lines[i];
    const y = top + i * layer.lineHeight;
    parts.push(`<text x="${layer.x}" y="${y}" fill="none" stroke="${layer.stroke}" stroke-width="${layer.strokeWidth}" paint-order="stroke">${escape(line)}</text>`);
    parts.push(`<text x="${layer.x}" y="${y}" fill="${layer.fill}">${escape(line)}</text>`);
  }
  parts.push('</g></svg>');
  return parts.join('\n');
}

/** The same layer as HTML, for Cloudflare Browser Rendering (optional server-side compositing). */
export function composeHtml(layer, imageDataUrl, position = null) {
  const pos = position || layer.position;
  const centre = layer.positions[pos];
  const top = centre - layer.firstLineOffset;
  const lines = layer.lines.map((line, i) => {
    const y = top + i * layer.lineHeight;
    return `<div class="l" style="top:${Math.round(y - layer.lineHeight / 2)}px;height:${layer.lineHeight}px;line-height:${layer.lineHeight}px;` +
      `font-size:${layer.fontSize}px;font-weight:${layer.weight};color:${layer.fill};-webkit-text-stroke:${layer.strokeWidth}px ${layer.stroke};` +
      `text-shadow:0 ${layer.shadow.dy}px ${layer.shadow.blur}px ${layer.shadow.color}">${String(line).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</div>`;
  }).join('');
  const bar = layer.bar ? `<div class="bar" style="top:${Math.round(centre - layer.barBox.height / 2)}px;height:${layer.barBox.height}px;background:${layer.bar_fill}"></div>` : '';
  return '<!doctype html><html><head><meta charset="utf-8">' +
    "<style>@import url('https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css');" +
    'html,body{margin:0;padding:0;background:#000} .w{position:relative;width:' + layer.width + 'px;height:' + layer.height + 'px;overflow:hidden}' +
    'img{width:100%;height:100%;display:block;object-fit:cover}' +
    `.l{position:absolute;left:0;width:100%;text-align:center;direction:${layer.direction};font-family:${layer.font}}` +
    '.bar{position:absolute;left:0;width:100%}</style></head>' +
    `<body><div class="w"><img src="${imageDataUrl}">${bar}${lines}</div></body></html>`;
}

/**
 * Server-side compositing through Cloudflare Browser Rendering, when the account has the BROWSER
 * binding. Optional by design: without it the app still draws the layer (and Telegram says so).
 */
export async function renderTextLayer(env, image, mime, layer, position = null) {
  if (!env || !env.BROWSER || typeof env.BROWSER.quickAction !== 'function') return null;
  const info = imageInfo(base64Bytes(image));
  const html = composeHtml({ ...layer, width: (info && info.width) || layer.width, height: (info && info.height) || layer.height },
    `data:${mime || 'image/jpeg'};base64,${image}`, position);
  const shot = await env.BROWSER.quickAction('screenshot', {
    html,
    viewport: { width: layer.width, height: layer.height },
    screenshotOptions: { type: 'png' },
  });
  let bytes = null;
  if (shot instanceof Uint8Array) bytes = shot;
  else if (shot instanceof ArrayBuffer) bytes = new Uint8Array(shot);
  else if (typeof (shot && shot.getReader) === 'function') bytes = new Uint8Array(await new Response(shot).arrayBuffer());
  if (!bytes) return null;
  const out = imageInfo(bytes);
  if (!out) return null;
  return { image: bytesToBase64(bytes), mime: out.mime, info: out, model: 'Browser Rendering', provider: 'browser' };
}

const STYLE_FA = { gold: 'طلایی', white: 'سفید', dark: 'تیره' };

/** What the user reads after the layer was set: words, place, style, and where it can be edited. */
export function layerCaption(layer, { composed = false, position = null } = {}) {
  const pos = POSITION_LABEL[position || layer.position] || POSITION_LABEL.bottom;
  const styleFa = STYLE_FA[layer.style] || 'سفید';
  const where = 'متن با فونت واقعی (وزیرمتن) نوشته شد، نه با مدل تصویر — پس فارسی سالم و خوانا است.';
  return [
    `✍️ «${layer.text}»`,
    `${pos} · رنگ ${styleFa}${layer.bar ? ' · با نوار پشت متن' : ''} · ${faDigits(layer.lines.length)} خط`,
    where,
    composed ? 'خروجی متن‌دار در همین پیام است.'
      : 'برای نشستن متن روی عکس: در اپ هر عکس دکمهٔ «متن را بگذار» دارد (بالا/وسط/پایین و ذخیرهٔ PNG).',
    'جابه‌جایی با پیام: «بالاتر ببر» · «کمی پایین‌تر» · «سفیدش کن» · «بدون نوار» · «متن رو بردار».',
  ].join('\n');
}
