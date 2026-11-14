#!/usr/bin/env node
// Render the Autumn Escape contest set.
//
//   node brand/viking/contest/render/render.mjs              # post + all 8 stories + contact sheets
//   node brand/viking/contest/render/render.mjs --only post   # just the 3-slide carousel
//   node brand/viking/contest/render/render.mjs --only stories --from 3 --to 4
//
// Output: brand/viking/contest/out/{post,story,sheets}/…  (generated; never committed)
// Requires @napi-rs/canvas + wawoff2. Playwright and Chromium are NOT needed: the Persian text is
// shaped by Skia/HarfBuzz inside @napi-rs/canvas, so this runs in a headless sandbox.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

import { SIZE, C } from './tokens.mjs';
import { ensureFonts, fa } from './type.mjs';
import { drawPostSlide, POST_COUNT } from './post.mjs';
import { drawStory, STORY_COUNT } from './story.mjs';
import { stories } from './copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'out');

function args() {
  const argv = process.argv.slice(2);
  const get = (flag, fallback = null) => {
    const i = argv.indexOf(flag);
    return i === -1 ? fallback : argv[i + 1];
  };
  return {
    only: get('--only', 'all'),
    outDir: resolve(get('--out', OUT)),
    from: Number(get('--from', 1)),
    to: Number(get('--to', STORY_COUNT)),
    sheets: !argv.includes('--no-sheets'),
  };
}

function frame(width, height) {
  const canvas = createCanvas(width, height);
  return { canvas, ctx: canvas.getContext('2d') };
}

async function save(canvas, path) {
  const buf = await canvas.encode('png');
  writeFileSync(path, buf);
  return buf.length;
}

/** A labelled contact sheet so nine frames can be reviewed in one glance. */
async function contactSheet(path, files, { cols, cell, label }) {
  const pad = 24;
  const rows = Math.ceil(files.length / cols);
  const cw = cell.w;
  const ch = cell.h + 34;
  const sheet = frame(pad * 2 + cols * cw + (cols - 1) * pad, pad * 2 + rows * ch + (rows - 1) * pad + 46);
  const { ctx, canvas } = sheet;
  ctx.fillStyle = '#0d0b0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = C.cream;
  ctx.font = '26px VazirBold';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillText(label, pad, pad + 4);

  let i = 0;
  for (const item of files) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cw + pad);
    const y = pad + 44 + row * ch;
    const img = await loadImage(item.path);
    ctx.drawImage(img, x, y, cw, cell.h);
    ctx.fillStyle = 'rgba(243,154,43,0.9)';
    ctx.font = '22px VazirBold';
    ctx.fillText(item.label, x + 2, y + cell.h + 26);
    i += 1;
  }
  await save(canvas, path);
  return { path, width: canvas.width, height: canvas.height };
}

async function main() {
  const opts = args();
  mkdirSync(opts.outDir, { recursive: true });
  mkdirSync(join(opts.outDir, 'post'), { recursive: true });
  mkdirSync(join(opts.outDir, 'story'), { recursive: true });
  mkdirSync(join(opts.outDir, 'sheets'), { recursive: true });

  await ensureFonts();

  const report = { generated: [], sheets: [] };

  if (opts.only === 'all' || opts.only === 'post') {
    for (let i = 1; i <= POST_COUNT; i += 1) {
      const { canvas, ctx } = frame(SIZE.post.w, SIZE.post.h);
      const meta = await drawPostSlide(ctx, i);
      const path = join(opts.outDir, 'post', `post-${i}-${meta.slug}.png`);
      const bytes = await save(canvas, path);
      report.generated.push({ ...meta, path, bytes, format: 'post' });
      console.log(`post  ${fa?.(i) ?? i}  ${path}  ${SIZE.post.w}×${SIZE.post.h}  ${(bytes / 1024).toFixed(0)} KB`);
    }
  }

  if (opts.only === 'all' || opts.only === 'stories' || opts.only === 'story') {
    for (let slot = Math.max(1, opts.from); slot <= Math.min(STORY_COUNT, opts.to); slot += 1) {
      const { canvas, ctx } = frame(SIZE.story.w, SIZE.story.h);
      const meta = await drawStory(ctx, slot);
      const path = join(opts.outDir, 'story', `story-${String(slot).padStart(2, '0')}-day${meta.day}.png`);
      const bytes = await save(canvas, path);
      report.generated.push({ ...meta, path, bytes, format: 'story' });
      console.log(`story ${slot}  day ${meta.day}  ${path}  ${SIZE.story.w}×${SIZE.story.h}  ${(bytes / 1024).toFixed(0)} KB`);
    }
  }

  if (opts.sheets) {
    const dayGroups = [...new Set(stories.map((s) => s.day))];
    for (const day of dayGroups) {
      const items = report.generated
        .filter((g) => g.format === 'story' && g.day === day)
        .map((g) => ({ path: g.path, label: `day ${day} · ${g.slot}/${STORY_COUNT}` }));
      if (items.length < 2) continue;
      const sheet = await contactSheet(join(opts.outDir, 'sheets', `day-${day}.png`), items, {
        cols: items.length,
        cell: { w: 460, h: 818 },
        label: `Autumn Escape — day ${day}`,
      });
      report.sheets.push(sheet);
      console.log(`sheet day ${day} → ${sheet.path}`);
    }

    const posts = report.generated.filter((g) => g.format === 'post').map((g) => ({ path: g.path, label: `post ${g.index}/${POST_COUNT} · ${g.slug}` }));
    if (posts.length) {
      const sheet = await contactSheet(join(opts.outDir, 'sheets', 'post.png'), posts, {
        cols: posts.length,
        cell: { w: 460, h: 575 },
        label: 'Autumn Escape — feed carousel',
      });
      report.sheets.push(sheet);
      console.log(`sheet post → ${sheet.path}`);
    }
  }

  // Machine-readable manifest: useful for the operator and for the size assertions in tests.
  writeFileSync(join(opts.outDir, 'manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2)}\n`);
  console.log(`\n${report.generated.length} frames + ${report.sheets.length} sheets → ${opts.outDir}`);
}

main().catch((error) => {
  console.error(`render failed: ${error.message}`);
  if (process.env.DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
