// Deployment contract: the two hosts must serve the same security headers, the app must reference
// nothing outside its own folder, and the proxy must exist on both platforms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const netlifyCsp = () => {
  const toml = read('netlify.toml');
  const match = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
  assert.ok(match, 'netlify.toml has no CSP');
  return match[1].trim();
};

const vercelCsp = () => {
  const conf = JSON.parse(read('vercel.json'));
  for (const block of conf.headers || []) {
    for (const header of block.headers || []) {
      if (header.key.toLowerCase() === 'content-security-policy') return header.value.trim();
    }
  }
  assert.fail('vercel.json has no CSP');
};

test('both hosts serve the same CSP and the same hard headers', () => {
  const a = netlifyCsp();
  const b = vercelCsp();
  assert.equal(a, b, 'the two hosts drifted apart; a deployment must not be weaker than the other');

  for (const directive of ["default-src 'self'", "script-src 'self' blob:", "worker-src 'self' blob:", "img-src 'self' data: blob:", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'self'"]) {
    assert.ok(a.includes(directive), `the CSP lost ${directive}`);
  }
  assert.ok(!/unsafe-eval/.test(a), 'the CSP must not allow eval');

  const vercel = read('vercel.json');
  for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.ok(vercel.includes(header), `vercel.json is missing ${header}`);
    assert.ok(read('netlify.toml').includes(header), `netlify.toml is missing ${header}`);
  }
});

test('the proxy exists on both platforms and is one implementation', async () => {
  assert.ok(existsSync(path.join(ROOT, 'netlify/functions/llm.mjs')), 'netlify function missing');
  assert.ok(existsSync(path.join(ROOT, 'api/llm.js')), 'vercel edge function missing');
  const shim = read('api/llm.js');
  assert.match(shim, /runtime:\s*'edge'/, 'the Vercel function must declare the edge runtime');
  assert.match(shim, /from '\.\.\/netlify\/functions\/llm\.mjs'/, 'it must reuse the Netlify handler');

  const mod = await import('../../api/llm.js');
  assert.equal(mod.config.runtime, 'edge');
  assert.equal(typeof mod.default, 'function', 'the Vercel entry point is the shared handler');
});

test('the page references nothing outside itself', () => {
  const html = read('index.html');
  const external = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((url) => /^(https?:)?\/\//.test(url) || /^data:text\/html/.test(url));
  assert.deepEqual(external, [], 'a third-party URL crept into the page');

  // Every local script/style/font/icon the page names must actually ship.
  const local = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((url) => !url.startsWith('#') && !url.startsWith('data:') && !url.startsWith('blob:'))
    .map((url) => url.replace(/^\.\//, '').split('?')[0]);
  for (const url of local) {
    assert.ok(existsSync(path.join(ROOT, url)), `index.html points at a file that is not shipped: ${url}`);
  }

  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.lang, 'fa');
  assert.equal(manifest.dir, 'rtl');
  assert.match(manifest.start_url, /^\.?\//, 'start_url must be relative to the deployment root');
  assert.ok(manifest.icons.length >= 1);
  for (const icon of manifest.icons) {
    const file = icon.src.replace(/^\.\//, '');
    assert.ok(existsSync(path.join(ROOT, file)), `manifest icon missing: ${file}`);
    assert.ok(/svg|png/.test(icon.type), `unknown icon type: ${icon.type}`);
  }
  assert.ok(/^#[0-9a-f]{6}$/i.test(manifest.theme_color), 'the manifest needs a real theme color');
});
