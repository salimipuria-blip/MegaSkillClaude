// The downloadable ZIP must open from disk (file://). Chrome blocks module scripts and crossorigin
// stylesheets from origin "null", and the old ZIP also used /assets/ paths: it opened unstyled with
// no JavaScript. Rebuild with `npm run zip` (scripts/build-zip.mjs) after changing the site.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const zip = fileURLToPath(new URL('../public/BISON-Brand-Book.zip', import.meta.url));
const unzip = (...args) => execFileSync('unzip', args, {encoding: 'utf8', maxBuffer: 1 << 26});
const entries = unzip('-Z1', zip).split('\n').filter(Boolean);
const html = unzip('-p', zip, 'index.html');

test('ZIP has the site at its root and nothing recursive', () => {
  for (const f of ['index.html', 'favicon.svg', 'docs/brand-guidelines.md']) assert.ok(entries.includes(f), f);
  assert.ok(entries.some((e) => /^assets\/index-[\w-]+\.js$/.test(e)));
  assert.ok(entries.some((e) => /^assets\/index-[\w-]+\.css$/.test(e)));
  assert.ok(!entries.some((e) => e.endsWith('.zip') || e === 'download.html'));
});

test('offline index.html has no module script, local crossorigin or root-absolute path', () => {
  assert.doesNotMatch(html, /type="module"/);
  assert.doesNotMatch(html, /crossorigin (src|href)="\.\//);
  assert.doesNotMatch(html, /\b(src|href)="\/(?!\/)/);
  assert.match(html, /<script defer src="\.\/assets\/index-[\w-]+\.js"><\/script>/);
});

test('every local file the offline page references is inside the ZIP', () => {
  const refs = [...html.matchAll(/\b(?:src|href)="\.\/([^"#?]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  const missing = refs.filter((r) => !entries.includes(r));
  assert.deepEqual(missing, []);
});

test('the bundled script is wrapped so it runs as a classic script', () => {
  const js = entries.find((e) => /^assets\/index-[\w-]+\.js$/.test(e));
  const code = unzip('-p', zip, js);
  assert.ok(code.startsWith('(()=>{'));
  assert.doesNotMatch(code, /lenis\.tick\(|\.tick\(\w+\*1e3\)/, 'ZIP carries the fixed smooth-scroll loop');
});
