#!/usr/bin/env node
// Real-browser render and smoke test. Everything else in this repo runs in Node or jsdom; this is
// the one place the actual Chromium engine looks at the page, so it is the only proof that the CSS,
// the font, the RTL layout and the sandboxed worker behave in a browser.
//
// One-time setup (each sandbox/session; node_modules is not persisted):
//   npm i --no-save puppeteer-core @sparticuz/chromium
// and a system without Chromium libraries needs the bundled AL2023 libs, which this script extracts
// by itself (see ensureBrowser). Then:
//   node tools/render.mjs --out ../docs/screenshots
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
// Evidence lives in the repository docs, not in the deployable folder: a 2 MB screenshot does not
// belong in the Netlify bundle.
const OUT = path.resolve(ROOT, argOf('out', '../docs/screenshots'));
const KEEP = argv.includes('--keep');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** The headers the real hosts send (vercel.json is the source of truth). */
function deploymentHeaders() {
  try {
    const conf = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const block = (conf.headers || []).find((h) => (h.headers || []).some((x) => x.key.toLowerCase() === 'content-security-policy'));
    return Object.fromEntries((block?.headers || []).map((h) => [h.key, h.value]));
  } catch {
    return {};
  }
}

function serve() {
  const extra = deploymentHeaders();
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = url === '/' ? '/index.html' : url;
    const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      ...extra,
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Load puppeteer-core + a Chromium build, and make its shared libraries findable. */
async function ensureBrowser() {
  let puppeteer;
  let chromium;
  try {
    puppeteer = (await import('puppeteer-core')).default;
    chromium = (await import('@sparticuz/chromium')).default;
  } catch {
    throw new Error(
      'مرورگر نصب نیست. یک‌بار اجرا کن: npm i --no-save puppeteer-core @sparticuz/chromium',
    );
  }
  const exe = await chromium.executablePath();
  // The package only unpacks its shared libraries on Amazon Linux. Everywhere else the dynamic
  // loader needs them on LD_LIBRARY_PATH, so unpack al2023.tar.br ourselves once.
  const libDir = path.join(process.env.TMPDIR || '/tmp', 'al2023', 'lib');
  if (!existsSync(path.join(libDir, 'libnspr4.so'))) {
    const packed = path.join(ROOT, 'node_modules/@sparticuz/chromium/bin/al2023.tar.br');
    if (existsSync(packed)) {
      const tar = path.join(process.env.TMPDIR || '/tmp', 'al2023.tar');
      writeFileSync(tar, zlib.brotliDecompressSync(readFileSync(packed)));
      mkdirSync(libDir, { recursive: true });
      spawnSync('tar', ['-xf', tar, '-C', path.dirname(libDir)], { stdio: 'ignore' });
    }
  }
  process.env.LD_LIBRARY_PATH = [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  return { puppeteer, chromium, exe, libDir };
}

const report = { checks: [], errors: [], screenshots: [], requests: [] };
const check = (name, ok, detail = '') => {
  report.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) report.errors.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

/** Scroll an element to the middle of the viewport, then click it. A fixed status bar or mobile nav
 *  can otherwise swallow the click while Puppeteer reports success. */
async function click(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`missing ${sel}`);
    el.scrollIntoView({ block: 'center', inline: 'center' });
  }, selector);
  await new Promise((r) => setTimeout(r, 60));
  await page.click(selector);
}

async function shoot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.screenshots.push(path.relative(ROOT, file));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { puppeteer, chromium, exe, libDir } = await ensureBrowser();
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/`;

  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1360, height: 900, deviceScaleFactor: 1 },
    executablePath: exe,
    headless: 'shell',
    env: { ...process.env, LD_LIBRARY_PATH: libDir },
  });

  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failed = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err.message || err)));
    page.on('requestfailed', (req) => failed.push(`${req.url()} (${req.failure()?.errorText})`));
    page.on('request', (req) => report.requests.push(req.url()));

    const started = Date.now();
    await page.goto(base, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('#main', { timeout: 20000 });
    await page.waitForFunction(() => window.__apex, { timeout: 20000 });
    const bootMs = Date.now() - started;

    // --- what the browser actually computed ------------------------------------------------
    const facts = await page.evaluate(async () => {
      const html = document.documentElement;
      const brand = document.querySelector('.brand, header h1, #brand') || document.body;
      const fontLoaded = document.fonts ? await document.fonts.ready.then(() => document.fonts.check('16px Vazirmatn')) : false;
      const style = getComputedStyle(document.body);
      return {
        title: document.title,
        lang: html.lang,
        dir: html.dir,
        fontLoaded,
        fontFamily: style.fontFamily,
        brandFont: getComputedStyle(brand).fontFamily,
        scrollWidth: html.scrollWidth,
        clientWidth: html.clientWidth,
        themeColor: document.querySelector('meta[name="theme-color"]')?.content || null,
        appMounted: Boolean(window.__apex),
        fileTreeRows: document.querySelectorAll('#fileTree .tree-file').length,
      };
    });
    check('boot: app mounted', facts.appMounted, 'window.__apex missing');
    check('boot: under 3s', bootMs < 3000, `${bootMs} ms`);
    check('lang/dir', facts.lang === 'fa' && facts.dir === 'rtl', `${facts.lang}/${facts.dir}`);
    check('font: Vazirmatn loaded by the browser', facts.fontLoaded, facts.fontFamily);
    check('font: body really uses it', /Vazirmatn/i.test(facts.fontFamily), facts.brandFont);
    check('layout: no horizontal overflow', facts.scrollWidth <= facts.clientWidth + 1, `${facts.scrollWidth} > ${facts.clientWidth}`);
    check('workspace: file tree rendered', facts.fileTreeRows >= 1, `${facts.fileTreeRows} rows`);

    const external = [...new Set(report.requests)].filter((u) => !u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:'));
    check('network: zero third-party requests', external.length === 0, external.join(', '));

    // An idle page must not look busy: the progress bar is hidden until a run starts.
    const idle = await page.evaluate(() => {
      const el = document.querySelector('#runline');
      return { hidden: el.hasAttribute('hidden'), visible: el.getBoundingClientRect().height > 0 };
    });
    check('idle: the run bar is hidden before anything runs', idle.hidden && !idle.visible, JSON.stringify(idle));

    await shoot(page, 'desktop-01-home');

    // --- a real Reflex run, driven by real clicks ------------------------------------------
    await page.type('#goal', 'تابع palindrome را کامل کن و تست‌ها را سبز کن');
    await click(page, '#btnRun');
    await page.waitForFunction(() => !document.querySelector('#btnRun')?.disabled, { timeout: 90000 });
    const run = await page.evaluate(() => ({
      ok: window.__apex.state.lastRun?.ok,
      mode: window.__apex.state.lastRun?.mode,
      steps: window.__apex.state.steps,
      files: window.__apex.vfs.list().length,
      banned: document.querySelector('#overlayError')?.hidden ?? true,
    }));
    check('run: reflex produced a verified result', run.ok === true, JSON.stringify(run));
    check('run: sandbox worker executed (no error overlay)', run.banned === true);
    check('run: wrote files', run.files >= 1, `${run.files}`);
    await shoot(page, 'desktop-02-after-run');

    // --- views, palette, sandbox worker ----------------------------------------------------
    await click(page, '#btnPalette');
    await page.waitForSelector('#palette:not([hidden])', { timeout: 5000 });
    await shoot(page, 'desktop-03-palette');
    await page.keyboard.press('Escape');

    for (const [view, name] of [
      ['workbench', 'desktop-04-workbench'],
      ['evolve', 'desktop-05-evolve'],
      ['memory', 'desktop-06-memory'],
      ['settings', 'desktop-07-settings'],
    ]) {
      await click(page, `#tab-${view}`);
      await new Promise((r) => setTimeout(r, 350));
      await shoot(page, name);
      const visible = await page.evaluate((v) => document.body.dataset.view === v, view);
      check(`view: ${view} opens`, visible, await page.evaluate(() => document.body.dataset.view));
      // Can a person actually hit every control on this view? Each control is scrolled to the middle
      // of the screen and then hit-tested at its centre — the difference between a button that exists
      // and a button that works.
      const covered = await page.evaluate(async () => {
        const bad = [];
        const els = [...document.querySelectorAll('main button, main input, main select, main textarea, main a[href]')];
        for (const el of els) {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const box = el.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          if (!(top === el || el.contains(top) || top?.contains(el))) {
            bad.push(`${el.id || el.tagName.toLowerCase()} ← ${top?.tagName.toLowerCase()}.${top?.className || ''}`);
          }
        }
        return bad;
      });
      check(`view: ${view} — every control can actually be hit`, covered.length === 0, covered.slice(0, 4).join(' · '));
    }

    // The app ships its own suite; running it *inside the browser* is a different claim from
    // running it in Node, because the sandbox, storage and DOM are all real here.
    await click(page, '#tab-settings');
    await click(page, '#btnSelfTest');
    const selfTest = await page
      .waitForFunction(
        () => {
          const el = document.querySelector('#selfBadge');
          return el && /\b(ok|bad)\b/.test(el.className) ? { text: el.textContent, cls: el.className } : false;
        },
        { timeout: 240000 },
      )
      .then((handle) => handle.jsonValue())
      .catch(() => null);
    check(
      "self-test: the app's own suite passes in the browser",
      Boolean(selfTest) && /\bok\b/.test(selfTest.cls),
      selfTest ? `${selfTest.text} (${selfTest.cls})` : 'badge never settled',
    );
    await shoot(page, 'desktop-08-self-test');

    // The Blob-Worker sandbox is the one thing jsdom cannot run at all.
    const worker = await page.evaluate(async () => {
      // Root-relative: this import resolves inside the page, not in Node.
      const { runInSandbox } = await import('/src/core/sandbox.js');
      const good = await runInSandbox({
        entry: 'export const sum = (n) => n.reduce((a, b) => a + b, 0);',
        cases: [{ name: 'adds', fn: 'sum', args: [[1, 2, 3]], expect: 6 }],
        entries: ['sum'],
      });
      const spin = await runInSandbox({
        entry: 'export const sum = () => { while (true) {} };',
        cases: [{ name: 'hangs', fn: 'sum', args: [], expect: 1 }],
        entries: ['sum'],
        timeoutMs: 400,
      });
      return { good, spin };
    });
    check('sandbox: real Blob Worker ran the code', worker.good?.ok === true, JSON.stringify(worker.good?.error || ''));
    check('sandbox: runtime is the worker', worker.good?.runtime === 'worker', worker.good?.runtime);
    check('sandbox: a spinner is killed', worker.spin?.ok === false, JSON.stringify(worker.spin?.error || ''));

    // --- mobile ---------------------------------------------------------------------------
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluate(() => window.__apex.setView?.('chat'));
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__apex, { timeout: 20000 });
    await page.evaluate(() => window.__apex.setView('chat'));
    await new Promise((r) => setTimeout(r, 400));
    const mobile = await page.evaluate(() => {
      const html = document.documentElement;
      const small = [...document.querySelectorAll('button, [role="button"], input, select, a[href]')]
        // A checkbox is not a 44px square: the label around it is the target, and it is checked below.
        .filter((el) => !(el.tagName === 'INPUT' && /checkbox|radio/.test(el.type)))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return false;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') return false;
          return r.width < 44 || r.height < 44;
        })
        .map((el) => `${el.tagName.toLowerCase()}#${el.id || el.className || '?'} (${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)})`);
      const inputs = [...document.querySelectorAll('input, textarea, select')]
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${el.tagName.toLowerCase()}#${el.id || '?'}`);
      return { overflow: html.scrollWidth - html.clientWidth, small, inputs };
    });
    check('mobile: no horizontal overflow at 390px', mobile.overflow <= 1, `${mobile.overflow}px`);
    check('mobile: every control is at least 44×44', mobile.small.length === 0, mobile.small.slice(0, 6).join(' · '));
    check('mobile: fields are 16px (no iOS zoom)', mobile.inputs.length === 0, mobile.inputs.join(', '));
    const labels = await page.evaluate(() => [...document.querySelectorAll('label')]
      .filter((el) => el.querySelector('input[type=checkbox], input[type=radio]'))
      .map((el) => Math.round(el.getBoundingClientRect().height))
      .filter((h) => h > 0 && h < 40));
    check('mobile: checkbox labels are a real target', labels.length === 0, labels.join(', '));
    await shoot(page, 'mobile-01-home');

    // --- hygiene --------------------------------------------------------------------------
    check('console: no errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('page: no uncaught exceptions', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    check('network: no failed requests', failed.length === 0, failed.slice(0, 3).join(' | '));

    // The static server sends the same CSP as the real hosts, so this page was rendered under the
    // production policy: blob workers, fonts and the sandbox all had to survive it.
    const cspHeader = deploymentHeaders()['Content-Security-Policy'] || '';
    check('csp: page rendered under the production policy', cspHeader.includes("default-src 'self'"), cspHeader.slice(0, 60));
  } finally {
    await browser.close();
    server.close();
  }

  writeFileSync(path.join(OUT, 'render-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const passed = report.checks.filter((c) => c.ok).length;
  console.log(`checks: ${passed}/${report.checks.length} passed`);
  for (const c of report.checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  console.log(`screenshots: ${report.screenshots.length} in ${path.relative(ROOT, OUT)}/`);
  if (report.errors.length) {
    console.error(`\n${report.errors.length} problem(s):`);
    for (const e of report.errors) console.error(` - ${e}`);
    process.exitCode = 1;
  }
  if (!KEEP) {
    try {
      const { rmSync } = await import('node:fs');
      rmSync(path.join(ROOT, 'render-smoke.png'), { force: true });
    } catch {
      /* nothing to clean */
    }
  }
}

main().catch((err) => {
  console.error(`render failed: ${err?.stack || err}`);
  process.exit(1);
});
