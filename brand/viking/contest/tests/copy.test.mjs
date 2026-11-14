// Contract tests for the Autumn Escape contest set.
//
// These run without a browser, a model, or a canvas: they read the copy module and the layout
// sources and assert the rules the owner set out. The two that matter most are the location ban
// (travellers' safety) and the "no invented facts" rule (prices, dates, scarcity).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { campaign, post1, post2, post3, stories, pending } from '../render/copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/** Every string in the copy module, flattened, so the bans can be checked exhaustively. */
function allStrings() {
  const out = [];
  const walk = (value, path) => {
    if (typeof value === 'string') out.push({ path, value });
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    }
  };
  walk({ campaign, post1, post2, post3, stories }, 'copy');
  return out;
}

const norm = (s) => s.replace(/[\u200c\u200e\u200f]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک');

// ---------------------------------------------------------------------------------------------
// 1. The location ban
// ---------------------------------------------------------------------------------------------

// Place names that must never appear: the reference campaign's destination, its province, and the
// kinds of regional marker that would let a reader locate the camp.
const PLACE_NAMES = [
  'سراوان', 'سیستان', 'بلوچستان', 'هیرکانی', 'گیلان', 'مازندران', 'گلستان', 'کردستان',
  'لرستان', 'البرز', 'زاگرس', 'جنگل هیرکانی', 'دریاچه', 'روستا', 'منطقه', 'استان',
];

test('no place name appears anywhere in the copy', () => {
  for (const { path, value } of allStrings()) {
    const flat = norm(value);
    for (const place of PLACE_NAMES) {
      assert.ok(
        !flat.includes(norm(place)),
        `copy${path.replace('copy', '')} contains the place name «${place}»: ${value}`,
      );
    }
  }
});

test('the campaign is named after the season and the brand, not a destination', () => {
  assert.equal(campaign.name, 'پاییز وایکینگ');
  assert.ok(!norm(campaign.name).includes('سراوان'));
  assert.match(post3.cta, /«پاییز»/);
});

test('coordinates, map links and exact meeting points never appear', () => {
  for (const { path, value } of allStrings()) {
    assert.ok(!/\d{2}[.,]\d{3,}/.test(value), `${path} looks like a coordinate: ${value}`);
    assert.ok(!/(maps\.google|goo\.gl\/maps|neshan|balad)/i.test(value), `${path} links a map`);
    assert.ok(!/(کیلومتر|کیلومتری|فرعی|جادهٔ|جاده )/.test(value), `${path} describes a route: ${value}`);
  }
});

// ---------------------------------------------------------------------------------------------
// 2. No invented facts
// ---------------------------------------------------------------------------------------------

test('prices are the owner’s figures and never carry an unconfirmed currency', () => {
  assert.equal(campaign.priceSelf, '۷٬۵۰۰٬۰۰۰');
  assert.equal(campaign.priceGroupExtra, '۲٬۵۰۰٬۰۰۰');
  assert.equal(campaign.currencyPending, true);
  for (const { path, value } of allStrings()) {
    assert.ok(!/تومان|ریال|درهم|دلار/.test(value), `${path} asserts a currency unit: ${value}`);
  }
  // The pending note must be on the artwork so nobody prints a unit by accident.
  assert.match(post3.unitNote, /واحد/);
});

test('the reference campaign’s numbers are not reused', () => {
  // Those frames advertised 7 million, 26/30 Mehr, 1 Aban and a 3.5 million group surcharge.
  const banned = ['۷ میلیون', '۷,۰۰۰,۰۰۰', '۳۰ مهر', '۱ آبان', '۳٫۵ میلیون'];
  for (const { path, value } of allStrings()) {
    for (const b of banned) {
      assert.ok(!norm(value).includes(norm(b)), `${path} copied a reference figure «${b}»`);
    }
  }
  assert.equal(campaign.dates.leave, '۵ آذر');
  assert.equal(campaign.dates.back, '۶ آذر');
});

test('no scarcity or urgency the owner did not state', () => {
  const banned = [/ظرفیت محدود/, /فقط \d+ نفر/, /آخرین فرصت/, /تا امروز/];
  for (const { path, value } of allStrings()) {
    for (const re of banned) assert.ok(!re.test(value), `${path} invents scarcity: ${value}`);
  }
  assert.ok(pending.some((p) => p.key === 'capacityClaim'));
});

// ---------------------------------------------------------------------------------------------
// 3. Structure: the set the owner asked for
// ---------------------------------------------------------------------------------------------

test('one 3-slide post and eight stories, two per day for four days', () => {
  assert.equal(stories.length, 8);
  const byDay = stories.reduce((acc, s) => {
    acc[s.day] = (acc[s.day] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(byDay, { 1: 2, 2: 2, 3: 2, 4: 2 });
  assert.deepEqual(stories.map((s) => s.slot), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(post1 && post2 && post3);
});

test('every story has copy, a photo that exists, and a strip', () => {
  for (const s of stories) {
    assert.ok(s.title && s.title.length > 2, `${s.id} needs a title`);
    assert.ok(s.kicker, `${s.id} needs a ticker line`);
    assert.ok(s.strip, `${s.id} needs a bottom CTA strip`);
    assert.ok(s.photo, `${s.id} needs a photo`);
    const path = resolve(ROOT, 'assets/bg', s.photo);
    assert.ok(existsSync(path), `${s.id} photo missing: ${s.photo}`);
  }
});

test('the eight stories tell one arc: announce, explain, cost, close', () => {
  const ids = stories.map((s) => s.id);
  assert.deepEqual(ids, ['story-1', 'story-2', 'story-3', 'story-4', 'story-5', 'story-6', 'story-7', 'story-8']);
  // day 1 announces the giveaway, day 4 closes with contact details
  assert.ok(stories[0].dates && stories[1].steps, 'day 1 must carry the dates and the mechanic');
  assert.ok(stories[7].contacts && stories[7].contacts.length === 2, 'the last story must give both numbers');
  assert.equal(stories[7].contacts[0].sub, '0912 333 1540');
  assert.equal(stories[7].contacts[1].sub, '0935 555 0774');
});

// ---------------------------------------------------------------------------------------------
// 4. Brand and typography
// ---------------------------------------------------------------------------------------------

test('the templates use the real brand fonts and the sampled palette', () => {
  const tokens = read('render/tokens.mjs');
  assert.match(tokens, /display: 'Lalezar'/);
  assert.match(tokens, /text: 'Vazir'/);
  for (const colour of ['#FF9E27', '#F39A2B', '#141414', '#FFD9A8', '#FF4D3D', '#FFFAF1']) {
    assert.ok(tokens.toLowerCase().includes(colour.toLowerCase()), `missing palette entry ${colour}`);
  }
  const type = read('render/type.mjs');
  assert.match(type, /Lalezar\.woff2/);
  assert.match(type, /Vazirmatn-Bold\.woff2/);
});

test('Persian digits are used for every number rendered on the artwork', () => {
  // Slots are printed ۱/۸ … ۸/۸ and must not fall back to ASCII.
  const story = read('render/story.mjs');
  assert.match(story, /fa\(s\.slot\)/);
  assert.match(story, /fa\(stories\.length\)/);
  const post = read('render/post.mjs');
  assert.match(post, /fa\(index\)/);
});

test('no template draws an emoji or a network asset', () => {
  for (const file of ['render/post.mjs', 'render/story.mjs', 'render/ornaments.mjs']) {
    const src = read(file);
    assert.ok(!/https?:\/\//.test(src), `${file} must not fetch anything`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(src), `${file} must not draw emoji`);
  }
});

// ---------------------------------------------------------------------------------------------
// 5. The renderer's own promises
// ---------------------------------------------------------------------------------------------

test('stories keep critical content out of Instagram’s chrome', () => {
  const story = read('render/story.mjs');
  assert.match(story, /ZONE = \{ top: 360, bottom: 1652 \}/);
  assert.match(story, /strip\(ctx, s\.strip\)/);
});

test('the renderer writes a manifest and never needs Playwright', () => {
  const renderer = read('render/render.mjs');
  assert.match(renderer, /manifest\.json/);
  // The word may only appear in the header comment that explains why it is not needed.
  assert.ok(!/from ['"]playwright/.test(renderer), 'the contest renderer must not import Playwright');
  assert.ok(!/require\(['"]playwright/.test(renderer), 'the contest renderer must not require Playwright');
});
