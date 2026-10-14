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
const SMALL_WORDS = /(?:کوچک|ریز|small|tiny)/iu;
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

/**
 * Read a "put text on this photo" request. Returns the words plus the design hints, or null when the
 * message is not about setting text (a logo/watermark request is deliberately not text).
 */
export function textRequest(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 300) return null;
  if (!/(?:متن|نوشته|بنویس|بنویسی|تیتر|کپشن|شعار|write|text|title|caption|تیتراژ)/iu.test(raw)) return null;
  if (LOGO_WORDS.test(raw) && !/(?:متن|نوشته|بنویس|تیتر)/u.test(raw)) return null;
  let body = quoted(raw) || afterColon(raw) || afterVerb(raw);
  body = body.replace(STYLE_TAIL, '').replace(/^[\s:：،,.«»"'“”-]+|[\s:：،,.«»"'“”-]+$/gu, '').trim();
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
export function designSpec({ text, width = 1024, height = 1024, position = 'bottom', style = 'auto', size = 1, bar = false, tone = 'mixed', weight = 600 }) {
  const W = Math.max(64, Math.round(width || 1024));
  const H = Math.max(64, Math.round(height || 1024));
  const words = String(text || '').trim();
  const rtl = /[\u0600-\u06ff]/.test(words);
  const chosen = style !== 'auto' ? style : tone === 'light' ? 'dark' : 'white';
  const palette = PALETTES[chosen] || PALETTES.white;
  const margin = Math.round(H * 0.045);
  const maxWidth = Math.round(W * 0.88);
  // Start from a headline size for the frame and shrink until the longest word fits on one line.
  const base = Math.min(H * 0.085, W * 0.12) * size;
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
    position: LAYER_POSITIONS.includes(position) ? position : 'bottom',
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
  const centres = {
    top: spec.margin + Math.round(blockHeight / 2),
    middle: Math.round(spec.height / 2) - Math.round(spec.height * 0.02),
    bottom: spec.height - spec.margin - Math.round(blockHeight / 2),
  };
  return {
    ...spec, lines, fontSize, lineHeight, blockHeight,
    positions: centres, x: Math.round(spec.width / 2),
    barBox: { x: 0, width: spec.width, height: blockHeight + pad * 2, pad, radius: 0 },
    firstLineOffset: Math.round(((lines.length - 1) * lineHeight) / 2),
  };
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

/** What the user reads after the layer was set: words, place, style, and where it can be edited. */
export function layerCaption(layer, { composed = false, position = null } = {}) {
  const pos = POSITION_LABEL[position || layer.position] || POSITION_LABEL.bottom;
  const styleFa = { gold: 'طلایی', white: 'سفید', dark: 'تیره' }[layer.style] || 'سفید';
  const where = 'متن با فونت واقعی (وزیرمتن) نوشته شد، نه با مدل تصویر — پس فارسی سالم و خوانا است.';
  return [
    `✍️ «${layer.text}»`,
    `${pos} · رنگ ${styleFa}${layer.bar ? ' · با نوار پشت متن' : ''} · ${faDigits(layer.lines.length)} خط`,
    where,
    composed ? 'خروجی متن‌دار در همین پیام است.'
      : 'برای نشستن متن روی عکس: در اپ هر عکس دکمهٔ «متن را بگذار» دارد (بالا/وسط/پایین و ذخیرهٔ PNG).',
  ].join('\n');
}
