// Accuracy gate for the router. The golden snapshot (tests/routing-contract.test.mjs) proves the
// output did not change by accident; this file proves it is *good* - the roadmap acceptance metric
// is >= 80% of the labelled gold set answered inside the top three, measured by
// scripts/routing-accuracy.mjs against tests/fixtures/routing-labels.json.
//
// Floors are deliberately below today's measured values so ordinary tuning has room, while a real
// regression (a domain signal breaking, a token filter misfiring) fails the build.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluate, checkCoverage, loadLabels, TOP3_FLOOR} from '../scripts/routing-accuracy.mjs';
import {loadBundledRegistry, loadCorpus} from '../scripts/routing-golden.mjs';

const TOP1_FLOOR = 0.9; // measured 0.95 on 2026-10-14
const registry = loadBundledRegistry();
const cases = loadCorpus();
const labels = loadLabels();
const {rows, summary, coverage} = evaluate(registry, cases, labels, {top: 3});
const pct = (x) => `${(x * 100).toFixed(1)}%`;

test('every corpus case has exactly one label and no label is orphaned', () => {
  assert.deepEqual(coverage, {missing: [], orphan: [], ok: true});
  assert.equal(labels.length, cases.length);
  const seen = new Set(labels.map((l) => l.id));
  assert.equal(seen.size, labels.length, 'duplicate label id');
  for (const label of labels) {
    const domains = new Set([...(label.expect || []), ...(label.accept || [])]);
    assert.ok(label.safety === 'must-not-match' || domains.size > 0, `${label.id} has no expectation`);
  }
});

test('labelled domains are real registry domains', () => {
  const known = new Set(registry.records.map((r) => r.domain));
  for (const label of labels) {
    for (const domain of [...(label.expect || []), ...(label.accept || [])]) {
      assert.ok(known.has(domain), `${label.id} expects unknown domain ${domain}`);
    }
  }
});

test(`at least ${pct(TOP3_FLOOR)} of labelled cases are answered inside the top three`, () => {
  const misses = rows.filter((r) => !r.passTopN)
    .map((r) => `${r.id} "${r.query}" -> ${r.domains.join(', ') || '(none)'}`);
  assert.ok(summary.topN >= TOP3_FLOOR,
    `top-3 accuracy ${pct(summary.topN)} is below the floor ${pct(TOP3_FLOOR)}\n${misses.join('\n')}`);
});

test(`top-1 accuracy stays at or above ${pct(TOP1_FLOOR)}`, () => {
  const misses = rows.filter((r) => !r.safety && !r.passTop1)
    .map((r) => `${r.id} "${r.query}" -> ${r.domains.join(', ') || '(none)'}`);
  assert.ok(summary.top1 >= TOP1_FLOOR,
    `top-1 accuracy ${pct(summary.top1)} is below the floor ${pct(TOP1_FLOOR)}\n${misses.join('\n')}`);
});

test('safety cases (blank, stop-words, numbers, noise) select nothing at all', () => {
  const safety = rows.filter((r) => r.safety);
  assert.ok(safety.length >= 8, 'the corpus must keep its edge cases');
  for (const row of safety) {
    assert.equal(row.selected, 0, `${row.id} selected ${row.selected} skills for "${row.query}"`);
  }
});
