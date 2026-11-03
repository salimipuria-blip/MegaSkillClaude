// Regression guard for the *intent* signals in engine/router.mjs.
//
// Every signal here was added after a measured miss on the labelled gold set
// (tests/fixtures/routing-labels.json). The accuracy gate (routing-accuracy.test.mjs) would also
// catch a regression, but it reports a percentage: this file names the exact query -> domain pair,
// so a failure points straight at the rule that broke.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBundledRegistry} from '../scripts/routing-golden.mjs';
import {routeSkills} from '../engine/router.mjs';

const registry = loadBundledRegistry();
const top = (query, n = 1) => routeSkills(registry, query, {limit: n}).selected.map((s) => s.domain);

test('campaign intent beats a topic noun that merely shares the season', () => {
  // "ramadan" alone used to win with travel-outdoors/ramadan-travel-etiquette.
  assert.equal(top('ramadan campaign ideas')[0], 'social-media');
});

test('"brand identity" is graphic design, the bare word "brand" stays neutral', () => {
  assert.equal(top('brand identity for a boutique hotel')[0], 'graphic-design');
  assert.equal(top('brand voice sheet for my profile')[0], 'social-media');
});

test('roadmap / startup intent is business planning', () => {
  // No core skill carries the tokens "roadmap"/"startup"; without the signal the Persian
  // phrase "نقشه راه" degraded to skills sharing the token "map".
  assert.equal(top('نقشه راه ۹۰ روزه برای استارتاپ')[0], 'business-sales');
  assert.equal(top('90 day roadmap for a startup')[0], 'business-sales');
});

test('reporting intent lifts spreadsheets/business over an unrelated exact phrase match', () => {
  const domains = top('analytics وبسایت و گزارش هفتگی', 3);
  assert.ok(domains.includes('web-development'), `expected a website answer, got ${domains.join(',')}`);
  assert.ok(!domains.includes('social-media') || domains[0] !== 'social-media');
});

test('a query naming a website surface is not answered by an Instagram-scoped skill', () => {
  const first = routeSkills(registry, 'analytics وبسایت و گزارش هفتگی', {limit: 8}).selected[0];
  assert.ok(!/^ig-|instagram/.test(first.name), `${first.name} is Instagram-scoped`);
});

test('the fallback domain "general" loses near-ties to a specialised domain', () => {
  // general/reels-scripting used to beat video-ai by 0.01 on "reels برای youtube shorts بساز".
  assert.notEqual(top('reels برای youtube shorts بساز')[0], 'general');
});
