// Renders caption.html to an MP4: node render.mjs [out.mp4] [fps]
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const dir = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || 'caption-demo.mp4');
const fps = Number(process.argv[3] || 30);
const frames = resolve(dir, 'frames');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + resolve(dir, 'caption.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
const dur = await page.evaluate(() => window.DURATION);
for (let f = 0; f < Math.round(dur * fps); f++) {
  await page.evaluate(t => window.seek(t), f / fps);
  await page.screenshot({ path: `${frames}/${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
}
await browser.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${frames}/%04d.jpg`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', out]);
rmSync(frames, { recursive: true, force: true });
console.log(out);
