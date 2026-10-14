import test from 'node:test';
import assert from 'node:assert/strict';
import {routeSkills} from '../engine/router.mjs';
import {loadBundledRegistry, loadCorpus, readGolden, routingSnapshot} from '../scripts/routing-golden.mjs';

// The golden file was produced from the pre-index-change router (main @ fbdecf96). Every routing output
// for the fixed corpus must stay identical: same candidates, order, scores, trigger hits and content status.
const registry = loadBundledRegistry();
const cases = loadCorpus();
const golden = readGolden();

test('routing output equals the golden snapshot for every corpus case (exact, not just non-empty)', () => {
  const current = routingSnapshot(registry, cases);
  assert.equal(current.cases.length, golden.cases.length);
  assert.deepStrictEqual(current.cases, golden.cases);
});

test('corpus covers Persian, English, mixed and edge requests', () => {
  const by = (lang) => cases.filter((c) => c.lang === lang).length;
  assert.ok(by('fa') >= 40 && by('en') >= 40 && by('mixed') >= 20 && by('edge') >= 6, JSON.stringify({fa: by('fa'), en: by('en'), mixed: by('mixed'), edge: by('edge')}));
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
});

test('selected results are ordered by score, then trigger hits, then name, and capped at the limit', () => {
  for (const c of golden.cases) {
    const s = c.output.selected;
    assert.ok(s.length <= golden.limit, c.id);
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i];
      const ordered = a.score > b.score || (a.score === b.score && (a.triggerHits > b.triggerHits || (a.triggerHits === b.triggerHits && a.name.localeCompare(b.name) <= 0)));
      assert.ok(ordered, `${c.id}: ${a.name} should precede ${b.name}`);
    }
    assert.ok(c.output.matches >= s.length, c.id);
  }
});

test('stop-word-only, separator-only and blank requests select nothing', () => {
  for (const id of ['edge-01', 'edge-02', 'edge-03', 'edge-05', 'edge-06']) {
    const c = golden.cases.find((x) => x.id === id);
    assert.deepStrictEqual(c.output.selected, [], id);
    assert.equal(c.output.matches, 0, id);
  }
});

test('key Persian and English requests keep their expected leading skills', () => {
  const top = (q, n) => routeSkills(registry, q, {limit: 8}).selected.slice(0, n).map((s) => s.name);
  assert.equal(top('سه استوری برای اینستاگرام طراحی کن', 1)[0], 'story-engagement-ideas');
  assert.equal(top('پوستر اینستاگرام', 3).every((name) => name.includes('poster')), true);
  assert.equal(top('create three instagram stories for a coffee shop', 1)[0], 'event-shop-tag-planner');
  assert.equal(top('make a landing page for my coffee shop', 1)[0], 'landing-page-generator');
});

test('limit is clamped to 1..25 exactly as before', () => {
  const wide = routeSkills(registry, 'instagram', {limit: 8});
  assert.ok(wide.matches > 25, `need more than 25 matches, got ${wide.matches}`);
  assert.equal(routeSkills(registry, 'instagram', {limit: 0}).selected.length, 1);
  assert.equal(routeSkills(registry, 'instagram', {limit: 500}).selected.length, 25);
  assert.equal(routeSkills(registry, 'instagram', {limit: 8}).selected.length, 8);
});
