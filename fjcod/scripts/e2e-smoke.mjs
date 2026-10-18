// End-to-end smoke test: every position logs in, the cashier sells, the consultant
// queues a cart. Fails on any console error. Usage: npm run build && npm run e2e
//
// The browser is NOT bundled: `playwright-core` ships no binary. The runner therefore
//  1. locates an existing Chromium (CHROMIUM_PATH, PLAYWRIGHT_BROWSERS_PATH, the Playwright
//     cache, /opt/pw-browsers, or a system Chrome/Chromium on PATH),
//  2. and, when there is none, prints the one command that fixes it and exits 0 (skipped)
//     so `npm run e2e` never fails a fresh checkout with an opaque Playwright banner.
// Set E2E_STRICT=1 (or pass --strict) to turn a missing browser into a hard failure (code 2).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const SHOTS = 'e2e-shots';
const STRICT = process.env.E2E_STRICT === '1' || process.argv.includes('--strict');
mkdirSync(SHOTS, { recursive: true });

const RELATIVE = ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe'];

/** Every Chromium we can reasonably reuse, cheapest check first. */
function findChromium() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), '.cache', 'ms-playwright'), '/opt/pw-browsers'].filter(Boolean);
  const found = [];
  if (process.env.CHROMIUM_PATH) found.push(process.env.CHROMIUM_PATH);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      for (const rel of RELATIVE) found.push(join(root, dir, rel));
    }
    for (const rel of RELATIVE) found.push(join(root, rel));
  }
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    try { found.push(execFileSync('which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch { /* not installed */ }
  }
  for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) found.push(p);
  return found.filter((p) => p && existsSync(p))[0] || null;
}

const executablePath = findChromium();
if (!executablePath) {
  const lines = [
    'E2E skipped: no Chromium/Chrome binary found (playwright-core does not ship one).',
    'Enable it with any of:',
    '  npx playwright install chromium        # downloads into ~/.cache/ms-playwright',
    '  CHROMIUM_PATH=/path/to/chrome npm run e2e',
    '  E2E_STRICT=1 npm run e2e               # fail instead of skipping',
  ];
  console.log(lines.join('\n'));
  process.exit(STRICT ? 2 : 0);
}
console.log(`E2E browser: ${executablePath}`);

// Launch vite directly (not via npx) so server.kill() stops the real process.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
// Never leave the preview port occupied, whatever ends this script (exit, signal or throw).
const stopServer = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopServer(); process.exit(130); });

try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('preview server timeout')), 20000);
    server.stdout.on('data', (d) => String(d).includes(String(PORT)) && (clearTimeout(t), resolve()));
  });
} catch (e) {
  stopServer();
  console.error(`E2E failed: ${e.message}. Run \`npm run build\` first, then retry.`);
  process.exit(1);
}

const browser = await chromium.launch({ executablePath });
const errors = [];
let failed = false;
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${name}\n  ${e.message.split('\n')[0]}`);
  }
};

async function newPage(viewport = { width: 1440, height: 900 }, colorScheme = 'light') {
  const ctx = await browser.newContext({ viewport, colorScheme, locale: 'fa-IR' });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return page;
}

// First-login passwords are random per fresh browser profile and shown once on the login screen,
// so each page records them on its first visit and later logins look them up by account id.
const issued = new WeakMap();
async function open(page) {
  await page.goto(BASE);
  await page.waitForSelector('input[name="password"]');
  if (issued.has(page)) return;
  const cells = await page.locator('[data-initial-password]').evaluateAll((els) => els.map((e) => [e.dataset.initialPassword, e.textContent.trim()]));
  if (!cells.length) throw new Error('first visit must show the one-time passwords');
  issued.set(page, Object.fromEntries(cells));
}

async function login(page, account) {
  await open(page);
  const password = issued.get(page)[account] ?? account; // unknown account = literal (wrong-password check)
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

async function setNewPassword(page, pwd) {
  await page.fill('input[name="new-password"]', pwd);
  await page.fill('input[name="repeat-password"]', pwd);
  await page.getByRole('button', { name: 'ذخیرهٔ رمز' }).click();
  await page.waitForSelector('.modal', { state: 'detached' });
}

const page = await newPage();

await step('login screen shows only the password field and the one-time passwords', async () => {
  await open(page);
  if (await page.locator('input').count() !== 1) throw new Error('login must have exactly one input');
  await page.screenshot({ path: `${SHOTS}/01-login.png` });
});

await step('wrong password shows an error', async () => {
  await login(page, 'wrong-pass');
  await page.getByRole('alert').waitFor();
});

await step('owner logs in by password, must change it, sees owner panel', async () => {
  await login(page, 'u-owner');
  await setNewPassword(page, 'owner-2026');
  await page.getByRole('heading', { name: 'داشبورد' }).waitFor();
  await page.waitForSelector('[data-nav="system"]'); // owner-only navigation proves the position
  await page.waitForSelector('.chart .bar');
  await page.screenshot({ path: `${SHOTS}/02-dashboard-owner.png`, fullPage: true });
});

for (const nav of ['growth', 'customers', 'reports', 'products', 'staff', 'settings', 'system', 'sales', 'shifts']) {
  await step(`owner opens ${nav}`, async () => {
    await page.click(`[data-nav="${nav}"]`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}/03-${nav}.png`, fullPage: true });
  });
}

await step('owner logs out', async () => {
  await page.click('[data-testid="logout"]');
  await page.waitForSelector('input[name="password"]');
});

await step('consultant builds a cart and sends it to the register', async () => {
  await login(page, 'u-cons-1');
  await setNewPassword(page, 'sara-2026');
  if (await page.locator('[data-nav="staff"]').count()) throw new Error('consultant must not see staff management');
  await page.click('[data-nav="pos"]');
  await page.locator('[data-testid="product-tile"]').first().click();
  await page.locator('[data-testid="product-tile"]').nth(1).click();
  await page.click('[data-testid="hold"]');
  await page.locator('.modal input').fill('پرو خانم احمدی');
  await page.getByRole('button', { name: 'ارسال', exact: true }).click();
  await page.waitForSelector('.toast');
  await page.click('[data-testid="logout"]');
});

await step('cashier opens shift, loads queued cart, pays and prints receipt', async () => {
  await login(page, 'u-cashier-1');
  await setNewPassword(page, 'cash-2026');
  await page.click('[data-nav="pos"]');
  await page.fill('input[inputmode="numeric"]', '۵۰۰۰۰۰');
  await page.click('[data-testid="open-shift"]');
  await page.getByRole('button', { name: 'بارگذاری' }).click();
  await page.screenshot({ path: `${SHOTS}/04-pos.png`, fullPage: true });
  await page.click('[data-testid="pay"]');
  await page.click('[data-testid="confirm-pay"]');
  await page.waitForSelector('[data-testid="receipt"]');
  await page.screenshot({ path: `${SHOTS}/05-receipt.png` });
  await page.getByRole('button', { name: 'فروش بعدی' }).click();
});

await step('cashier scans a barcode (Enter) and sells with cash change', async () => {
  const barcode = await page.evaluate(() => JSON.parse(localStorage.getItem('cham.db.v1')).products.find((p) => p.stock > 2 && p.price < 2000000).barcode);
  await page.fill('[data-testid="pos-search"]', barcode);
  await page.press('[data-testid="pos-search"]', 'Enter');
  await page.click('[data-testid="pay"]');
  await page.getByRole('button', { name: 'همه با نقد' }).click();
  const cash = page.locator('.modal .pay-grid input').nth(1);
  const v = await cash.inputValue();
  await cash.fill(String(Number(v) + 100000));
  await page.getByText('باقی پول نقد مشتری').waitFor();
  await page.click('[data-testid="confirm-pay"]');
  await page.waitForSelector('[data-testid="receipt"]');
  await page.getByRole('button', { name: 'فروش بعدی' }).click();
});

await step('cashier closes the shift', async () => {
  await page.click('[data-nav="shifts"]');
  await page.click('[data-testid="close-shift"]');
  await page.locator('.modal input').first().fill('1');
  await page.getByRole('button', { name: 'ثبت و بستن شیفت' }).click();
  await page.waitForSelector('.modal', { state: 'detached' });
  await page.click('[data-testid="logout"]');
});

await step('manager, deputy logins + dark mode + mobile layout', async () => {
  await login(page, 'u-manager');
  await setNewPassword(page, 'mgr-2026x');
  await page.click('[data-nav="system"]');
  await page.getByText('مدیریت اشتراک چام').waitFor({ state: 'detached', timeout: 1000 }).catch(() => {});
  if (await page.getByText('مدیریت اشتراک چام').count()) throw new Error('manager must not see license controls');
  await page.click('[data-testid="logout"]');
  await login(page, 'u-deputy');
  await setNewPassword(page, 'dep-2026x');
  await page.click('[data-testid="logout"]');

  const dark = await newPage({ width: 1440, height: 900 }, 'dark');
  await open(dark);
  await dark.evaluate(() => localStorage.setItem('cham.theme', 'dark'));
  await login(dark, 'u-owner');
  await setNewPassword(dark, 'owner-2026');
  await dark.waitForSelector('.chart .bar');
  await dark.screenshot({ path: `${SHOTS}/06-dashboard-dark.png`, fullPage: true });

  const mobile = await newPage({ width: 390, height: 844 });
  await open(mobile);
  await mobile.screenshot({ path: `${SHOTS}/07-login-mobile.png`, fullPage: true });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('horizontal overflow on mobile login');
  await login(mobile, 'u-owner');
  await setNewPassword(mobile, 'owner-2026');
  await mobile.waitForSelector('.chart .bar');
  const overflow2 = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await mobile.screenshot({ path: `${SHOTS}/08-dashboard-mobile.png`, fullPage: true });
  if (overflow2) throw new Error('horizontal overflow on mobile dashboard');
});

await step('no console errors', async () => {
  const real = errors.filter((e) => !/favicon/.test(e));
  if (real.length) throw new Error(real.join(' | '));
});

await browser.close();
stopServer();
console.log(failed ? '\nE2E FAILED' : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
