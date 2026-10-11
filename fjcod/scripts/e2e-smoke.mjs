// End-to-end smoke test: every position logs in, the cashier sells, the consultant
// queues a cart. Fails on any console error. Usage: npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const SHOTS = 'e2e-shots';
mkdirSync(SHOTS, { recursive: true });

const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

// Launch vite directly (not via npx) so server.kill() stops the real process.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server timeout')), 20000);
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && (clearTimeout(t), resolve()));
});

const browser = await chromium.launch(executablePath ? { executablePath } : {});
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

async function login(page, password) {
  await page.goto(BASE);
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

await step('login screen shows only the password field', async () => {
  await page.goto(BASE);
  await page.waitForSelector('input[name="password"]');
  if (await page.locator('input').count() !== 1) throw new Error('login must have exactly one input');
  await page.screenshot({ path: `${SHOTS}/01-login.png` });
});

await step('wrong password shows an error', async () => {
  await login(page, 'wrong-pass');
  await page.getByRole('alert').waitFor();
});

await step('owner logs in by password, must change it, sees owner panel', async () => {
  await login(page, 'fjcod1405');
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
  await login(page, '444441');
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
  await login(page, '333331');
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
  await login(page, '111111');
  await setNewPassword(page, 'mgr-2026x');
  await page.click('[data-nav="system"]');
  await page.getByText('مدیریت اشتراک چام').waitFor({ state: 'detached', timeout: 1000 }).catch(() => {});
  if (await page.getByText('مدیریت اشتراک چام').count()) throw new Error('manager must not see license controls');
  await page.click('[data-testid="logout"]');
  await login(page, '222222');
  await setNewPassword(page, 'dep-2026x');
  await page.click('[data-testid="logout"]');

  const dark = await newPage({ width: 1440, height: 900 }, 'dark');
  await dark.goto(BASE);
  await dark.evaluate(() => localStorage.setItem('cham.theme', 'dark'));
  await login(dark, 'fjcod1405');
  await setNewPassword(dark, 'owner-2026');
  await dark.waitForSelector('.chart .bar');
  await dark.screenshot({ path: `${SHOTS}/06-dashboard-dark.png`, fullPage: true });

  const mobile = await newPage({ width: 390, height: 844 });
  await mobile.goto(BASE);
  await mobile.screenshot({ path: `${SHOTS}/07-login-mobile.png`, fullPage: true });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('horizontal overflow on mobile login');
  await login(mobile, 'fjcod1405');
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
server.kill();
console.log(failed ? '\nE2E FAILED' : '\nE2E PASSED');
process.exit(failed ? 1 : 0);
