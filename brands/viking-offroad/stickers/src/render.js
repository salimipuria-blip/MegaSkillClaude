const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const dir = __dirname;
const out0 = path.join(__dirname, '..', 'packs');
const which = process.argv[2];
const vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'packs.js'), 'utf8') + ';this.PACKS=PACKS;', ctx);
const PACKS = ctx.PACKS;
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  const sheet = await browser.newPage({ viewport: { width: 1652, height: 1200 } });
  for (const p of [page, sheet]) p.on('pageerror', e => console.error('ERR', e.message));
  const packIdx = which === 'all' || !which ? PACKS.map((_, i) => i) : which.split(',').map(Number);
  const sheetsOnly = process.argv.includes('--sheets');
  for (const pi of packIdx) {
    const pack = PACKS[pi];
    const out = path.join(out0, `pack-${pack.id}`);
    fs.mkdirSync(out, { recursive: true });
    if (!sheetsOnly) {
      for (let i = 0; i < pack.items.length + 6; i++) {
        await page.goto(`file://${dir}/stickers.html#one,${pi},${i}`);
        await page.reload();
        await page.waitForSelector('body[data-ready="1"]');
        await page.screenshot({ path: path.join(out, `${String(i + 1).padStart(2, '0')}.png`), omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
      }
    }
    await sheet.goto(`file://${dir}/stickers.html#sheet,${pi}`);
    await sheet.reload();
    await sheet.waitForSelector('body[data-ready="1"]');
    await sheet.screenshot({ path: path.join(out0, `preview-${pack.id}.png`), fullPage: true });
  }
  await browser.close();
})();
