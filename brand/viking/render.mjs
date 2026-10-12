// Render the Viking templates to PNG: node brand/viking/render.mjs [story|post] [outDir]
// Needs Playwright + Chromium (in Claude Code cloud: /opt/node-tools, /opt/pw-browsers).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const pw = process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright';
const { chromium } = require(pw);
const here = dirname(fileURLToPath(import.meta.url));
const [which = 'post', out = join(here, 'out')] = process.argv.slice(2);
const fs = await import('node:fs');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const story = which === 'story';
const page = await browser.newPage({ viewport: story ? { width: 1080, height: 1920 } : { width: 1080, height: 1350 } });
await page.goto('file://' + join(here, story ? 'story.html' : 'post.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
if (story) await page.locator('#st').screenshot({ path: join(out, 'story.png') });
else for (const el of await page.locator('section.sl').all()) await el.screenshot({ path: join(out, `post-${(await el.getAttribute('id')).slice(1)}.png`) });
await browser.close();
console.log(`rendered ${which} → ${out}`);
