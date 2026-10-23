import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';
const dir = process.argv[2], fps = 60, dur = 10;
mkdirSync(dir + '/frames', { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file://' + dir + '/index.html');
await p.evaluate(() => document.fonts.ready);
await p.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
for (let f = 0; f < fps * dur; f++) {
  await p.evaluate(t => window.seek(t), f / fps);
  await p.screenshot({ path: `${dir}/frames/${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
}
await b.close();
