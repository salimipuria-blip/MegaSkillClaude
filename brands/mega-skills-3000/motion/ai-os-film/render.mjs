// Frame-exact render: seek the GSAP master timeline per frame, screenshot, then ffmpeg (video + music).
// node render.mjs [outDir] [--frames 2.0,6.4,...]   (the second form writes only those stills for review)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || `${here}/out`);
const only = process.argv.includes('--frames') ? process.argv[process.argv.indexOf('--frames') + 1].split(',').map(Number) : null;
const FPS = 30, DUR = 37;
mkdirSync(`${out}/frames`, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.addInitScript(() => { window.__odMotionRender = true; });
await p.goto(`file://${here}/index.html?render`);
await p.evaluate(() => window.ready);
const times = only || Array.from({ length: FPS * DUR }, (_, f) => f / FPS);
for (const [i, t] of times.entries()) {
  await p.evaluate((x) => window.seek(x), t);
  await p.screenshot({ path: only ? `${out}/still-${t.toFixed(2)}.jpg` : `${out}/frames/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 93 });
}
await b.close();
if (!only) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${out}/frames/%04d.jpg`, '-i', `${here}/assets/music.wav`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `${out}/mega-skills-ai-os.mp4`]);
  console.log(`${out}/mega-skills-ai-os.mp4`);
}
