// Router accuracy evaluation against the labelled gold set.
//
// The corpus (tests/fixtures/routing-corpus.json) is a *behaviour* fixture: routing-golden.mjs
// pins its exact output so that no change slips through unnoticed. It carries no expectations,
// so on its own it cannot answer the roadmap question "is the router accurate enough?"
// (target: >= 80% on the golden set). This script adds that measurement.
//
// Labels live in tests/fixtures/routing-labels.json:
//   expect[]               domain a human reviewer would rank first
//   accept[]               further domains that are still a correct answer
//   safety: must-not-match the query must return zero selections (empty / stop-words / noise)
//
// A case passes when its TOP-1 result is in expect+accept (top-1 metric) or when any of the
// first N results is (top-N metric). Safety cases pass when nothing is selected at all.
//
// Usage:
//   node scripts/routing-accuracy.mjs                  # human report, exit 1 below the floor
//   node scripts/routing-accuracy.mjs --top=5          # widen the window
//   node scripts/routing-accuracy.mjs --json           # machine-readable summary
//   node scripts/routing-accuracy.mjs --min-top3=0.8   # override the floor
// No network. Reads only the bundled registry, verified SKILL.md bodies and the two fixtures.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadBundledRegistry, loadCorpus} from './routing-golden.mjs';
import {routeSkills} from '../engine/router.mjs';

export const TOP3_FLOOR = 0.8; // roadmap acceptance: >= 80% of labelled cases answered in the top three

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const labelsFile = path.join(root, 'tests', 'fixtures', 'routing-labels.json');

/** Read the labelled expectations. */
export function loadLabels(file = labelsFile) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (doc.schema !== 1 || !Array.isArray(doc.cases)) throw new Error('unsupported routing labels');
  return doc.cases;
}

/** Cross-check corpus <-> labels so a new corpus case cannot land without a label. */
export function checkCoverage(cases, labels) {
  const corpusIds = new Set(cases.map((c) => c.id));
  const labelIds = new Set(labels.map((c) => c.id));
  const missing = [...corpusIds].filter((id) => !labelIds.has(id));
  const orphan = [...labelIds].filter((id) => !corpusIds.has(id));
  return {missing, orphan, ok: missing.length === 0 && orphan.length === 0};
}

/** Grade one query. Pure: routing output in, verdict out. */
export function gradeCase(query, label, registry, {top = 3} = {}) {
  const routed = routeSkills(registry, query, {limit: top});
  const domains = routed.selected.slice(0, top).map((s) => s.domain);
  const allowed = [...(label.expect || []), ...(label.accept || [])];
  if (label.safety === 'must-not-match') {
    return {domains, selected: routed.selected.length, passTop1: routed.selected.length === 0,
      passTopN: routed.selected.length === 0, note: routed.selected.length ? 'unexpected matches' : ''};
  }
  return {domains, selected: routed.selected.length, passTop1: allowed.includes(domains[0]),
    passTopN: domains.some((d) => allowed.includes(d)),
    note: allowed.includes(domains[0]) ? '' : (domains.some((d) => allowed.includes(d)) ? 'only below top-1' : 'missed')};
}

const rate = (list, key) => (list.length ? list.filter((r) => r[key]).length / list.length : 1);

/** Aggregate rows into the headline numbers plus a per-language breakdown. */
export function summarize(rows) {
  const scored = rows.filter((r) => !r.safety);
  const safety = rows.filter((r) => r.safety);
  const perLang = {};
  for (const lang of [...new Set(scored.map((r) => r.lang))]) {
    const group = scored.filter((r) => r.lang === lang);
    perLang[lang] = {cases: group.length, top1: rate(group, 'passTop1'), topN: rate(group, 'passTopN')};
  }
  return {total: rows.length, scored: scored.length, safety: safety.length,
    top1: rate(scored, 'passTop1'), topN: rate(scored, 'passTopN'),
    safetyPass: rate(safety, 'passTopN'), perLang};
}

/** Convenience wrapper used by the CLI and by tests. */
export function evaluate(registry, cases, labels, {top = 3} = {}) {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const rows = cases.map((c) => {
    const label = byId.get(c.id) || {id: c.id, expect: [], accept: []};
    return {id: c.id, lang: c.lang || '?', query: c.query, safety: label.safety === 'must-not-match',
      ...gradeCase(c.query, label, registry, {top})};
  });
  return {rows, summary: summarize(rows), coverage: checkCoverage(cases, labels)};
}

// --- CLI ---------------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argOf = (name, dflt) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : dflt;
  };
  const top = Math.min(Math.max(Number(argOf('top', 3)) || 3, 1), 25);
  const floor = Number(argOf('min-top3', TOP3_FLOOR));

  const {rows, summary, coverage} = evaluate(loadBundledRegistry(), loadCorpus(), loadLabels(), {top});

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({floor, top, coverage, summary,
      misses: rows.filter((r) => !r.passTopN).map((r) => ({id: r.id, query: r.query, got: r.domains, note: r.note}))}, null, 1));
  } else {
    const pct = (x) => `${(x * 100).toFixed(1)}%`;
    if (!coverage.ok) {
      console.error(`gold set out of sync: unlabelled ${coverage.missing.join(', ') || '-'} | orphan ${coverage.orphan.join(', ') || '-'}`);
    }
    console.log(`router accuracy - ${summary.scored} labelled cases, ${summary.safety} safety cases, window top-${top}`);
    console.log(`  top-1 hit        : ${pct(summary.top1)}`);
    console.log(`  top-${top} hit        : ${pct(summary.topN)}   (floor ${pct(floor)})`);
    console.log(`  safety (no match): ${pct(summary.safetyPass)}`);
    for (const [lang, s] of Object.entries(summary.perLang)) {
      console.log(`    ${lang.padEnd(6)} ${String(s.cases).padStart(3)} cases   top-1 ${pct(s.top1).padStart(6)}   top-${top} ${pct(s.topN).padStart(6)}`);
    }
    const misses = rows.filter((r) => !r.passTopN);
    if (misses.length) {
      console.log(`  misses (${misses.length}):`);
      for (const m of misses) {
        console.log(`    ${m.id.padEnd(7)}${m.safety ? '[safety] ' : ''}${m.query.slice(0, 44).padEnd(46)} got: ${m.domains.join(', ') || '(none)'}`);
      }
    }
  }
  process.exit(summary.topN >= floor && coverage.ok ? 0 : 1);
}
