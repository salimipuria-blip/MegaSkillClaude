// Static contract for the BISON brand book. Vite only fails the build on a broken *module* import;
// a wrong asset path, a dead anchor or a mixed relative/root-absolute convention builds green and
// breaks on the served site. This file is that missing gate. No dependencies, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const css = readFileSync(root + 'src/styles.css', 'utf8');
const js = readFileSync(root + 'src/main.js', 'utf8');

const attributes = (name) =>
  [...html.matchAll(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, 'g'))].map((m) => m[1]);

test('local asset references are root-absolute, the Vite public/ convention', () => {
  // A bare "BISON-Brand-Book.zip" resolves against the *current* path, so it survives at "/" and
  // 404s the moment the page is served from a sub-path. One convention: /asset.
  const local = [...attributes('src'), ...attributes('href')].filter(
    (u) => !u.startsWith('#') && !u.startsWith('http') && !u.startsWith('mailto:') && !u.startsWith('/'),
  );
  assert.deepEqual(local, [], `relative references found: ${local.join(', ')}`);
});

test('every referenced public asset exists on disk', () => {
  const missing = [...attributes('src'), ...attributes('href')]
    .filter((u) => u.startsWith('/'))
    .filter((u) => u !== '/src/main.js' && u !== '/src/styles.css')
    .filter((u) => !existsSync(root + 'public' + u.split('?')[0]));
  assert.deepEqual(missing, [], `missing files under public/: ${missing.join(', ')}`);
});

test('the downloadable ZIP is present and is a real archive', () => {
  const zip = root + 'public/BISON-Brand-Book.zip';
  assert.ok(existsSync(zip), 'public/BISON-Brand-Book.zip is referenced by the page');
  assert.equal(readFileSync(zip).subarray(0, 2).toString('latin1'), 'PK', 'not a ZIP archive');
});

test('in-page anchors all resolve to an id', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const dead = [...new Set(attributes('href').filter((h) => h.startsWith('#')))].filter(
    (h) => h !== '#' && !ids.has(h.slice(1)),
  );
  assert.deepEqual(dead, [], `anchors without a target: ${dead.join(', ')}`);
});

test('the source entry points exist and are wired to the page', () => {
  assert.ok(existsSync(root + 'src/main.js') && existsSync(root + 'src/styles.css'));
  assert.match(html, /src="\/src\/main\.js"/);
  assert.match(html, /href="\/src\/styles\.css"/);
});

test('no secret or service key is committed to the front end', () => {
  for (const file of [html, js, css]) {
    assert.doesNotMatch(file, /service_role|sb_secret_|SUPABASE_SERVICE|sk-[A-Za-z0-9]{16,}/);
  }
});

test('scroll experience degrades with reduced motion', () => {
  // GSAP + Lenis drive the whole page; without a guard the site is unusable for motion-sensitive
  // readers. The CSS must also carry a reduced-motion block.
  assert.match(css, /prefers-reduced-motion/);
  assert.match(js, /prefers-reduced-motion|matchMedia/);
});

test('every logo and image asset is under a tracked public folder', () => {
  for (const dir of ['public/images', 'public/logos']) {
    assert.ok(existsSync(root + dir), `${dir} must exist`);
  }
  const images = readdirSync(root + 'public/images').filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  assert.ok(images.length >= 5, `expected the brand imagery, found ${images.length}`);
});
