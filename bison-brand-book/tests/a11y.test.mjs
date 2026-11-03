// Static accessibility and delivery contract. Each test pins a defect that once shipped green:
// gold labels at 1.84:1 on bone, a half-built ARIA tablist, a dialog that let focus escape,
// and a "Download ZIP" button pointing at a private repo (HTTP 403 for every visitor).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const css = readFileSync(root + 'src/styles.css', 'utf8');
const js = readFileSync(root + 'src/main.js', 'utf8');

// WCAG 2.x relative luminance and contrast ratio.
const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1).slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `token --${name} is defined`);
  return m[1];
};
const rule = (selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`${esc}\\s*[,{][^}]*}`));
  return m ? m[0] : '';
};

// Color of the last rule block whose selector list contains `sel` (cascade order, same specificity).
const finalColor = (sel) => {
  let color = null;
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = m[1].split(',').map((x) => x.trim());
    const c = m[2].match(/(?:^|;|\s)color:\s*([^;]+);/);
    if (selectors.includes(sel) && c) color = c[1].trim();
  }
  return color;
};

test('smooth scroll drives Lenis through raf(); Lenis 1.x has no tick() (threw every frame)', () => {
  assert.match(js, /lenis\.raf\(time \* 1000\)/);
  assert.doesNotMatch(js, /lenis\.tick\(/);
});

test('document language and title are set', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<a class="skip" href="#main">/);
});

test('every image has an alt attribute (empty only when decorative)', () => {
  const missing = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/\balt="/.test(t));
  assert.deepEqual(missing, []);
});

test('small labels on bone and the chapter list meet WCAG AA (4.5:1)', () => {
  const bone = token('bone');
  const ink = token('ember-ink');
  assert.ok(contrast(ink, bone) >= 4.5, `ember-ink on bone is ${contrast(ink, bone).toFixed(2)}:1`);
  // The bug: .kicker is gold everywhere, and gold on bone is 1.84:1.
  assert.ok(contrast(token('gold'), bone) < 4.5, 'premise: gold is not readable on bone');
  // Equal specificity means the LAST rule naming a selector wins, so check the final color it gets
  // (a browser run caught an earlier override silently losing to the original .chapter-list .num rule).
  for (const sel of ['.section.on-bone .kicker', '.chapters .kicker', '.chapter-list .num']) {
    assert.equal(finalColor(sel), 'var(--ember-ink)', `${sel} ends up with --ember-ink`);
  }
  // Pairs used on dark grounds stay readable.
  assert.ok(contrast(token('gold'), token('iron')) >= 4.5);
  assert.ok(contrast(token('dust'), token('hide')) >= 4.5);
});

test('device switch is a toggle-button group, not a tablist without tabpanels', () => {
  assert.doesNotMatch(html, /role="tab(list)?"/);
  assert.match(html, /class="device-switch" role="group" aria-label="[^"]+"/);
  const tabs = [...html.matchAll(/<button class="device-tab[^>]*>/g)].map((m) => m[0]);
  assert.equal(tabs.length, 3);
  for (const t of tabs) assert.match(t, /aria-pressed="(true|false)"/);
  assert.match(js, /setAttribute\("aria-pressed"/);
  assert.doesNotMatch(js, /aria-selected/);
});

test('aria-label is only used on elements with a role or native semantics', () => {
  const bad = [...html.matchAll(/<(div|span)\b[^>]*aria-label=[^>]*>/g)].map((m) => m[0]).filter((t) => !/\brole="/.test(t));
  assert.deepEqual(bad, []);
});

test('live demo dialog is modal for keyboard and screen readers', () => {
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="overlay-title"/);
  assert.match(html, /id="overlay-title"/);
  assert.match(js, /setAttribute\("inert", ""\)/, 'background becomes inert while open');
  assert.match(js, /removeAttribute\("inert"\)/, 'and is restored on close');
  assert.match(js, /opener\?\.focus\(\)/, 'focus returns to the button that opened the dialog');
  assert.match(js, /event\.key === "Escape"/);
});

test('download links stay on this site (the old repo raw URL returns 403)', () => {
  const external = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1])
    .filter((u) => !u.startsWith('https://fonts.googleapis.com') && !u.startsWith('https://fonts.gstatic.com'));
  assert.deepEqual(external, []);
  const zips = [...html.matchAll(/href="([^"]*\.zip)"/g)].map((m) => m[1]);
  assert.ok(zips.length >= 2);
  for (const z of zips) assert.equal(z, '/BISON-Brand-Book.zip');
});

test('fonts load from <head> with preconnect, not a render-blocking CSS @import chain', () => {
  assert.doesNotMatch(css, /@import/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>/);
  assert.match(html, /href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+display=swap"/);
  for (const v of ['--font-display', '--font-body', '--font-mono']) {
    assert.match(css, new RegExp(`${v}:[^;]+,\\s*[^;]+;`), `${v} has a system fallback`);
  }
});

test('only the LCP hero loads eagerly with high priority; below-the-fold images are lazy', () => {
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const high = imgs.filter((t) => /fetchpriority="high"/.test(t));
  assert.equal(high.length, 1);
  assert.match(high[0], /hero-bison\.jpg/);
  const eager = imgs.filter((t) => !/loading="lazy"/.test(t)).map((t) => t.match(/src="([^"]+)"/)[1]);
  // loader mark, nav mark, hero: all visible on first paint.
  assert.deepEqual(eager.sort(), ['/images/hero-bison.jpg', '/images/mark-bison.png', '/images/mark-body.png'].sort());
});

test('every button declares its type', () => {
  const untyped = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/\btype="button"/.test(t));
  assert.deepEqual(untyped, []);
});

test('rule helper sanity: focus ring is defined', () => {
  assert.match(rule(':focus-visible'), /outline:\s*2px solid var\(--gold\)/);
});
