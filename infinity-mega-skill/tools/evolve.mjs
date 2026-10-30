#!/usr/bin/env node
// Headless demonstration of the supervised evolution loop against the real benchmark, the real
// reflex solver, and the real node:vm sandbox — so the loop is seen, not asserted. Bounded on
// purpose: a few generations, a short wall-clock, a small patience. Prints the decision ledger.
//
//   npm run evolve                 # defaults below
//   node tools/evolve.mjs --generations 5 --patience 3 --ms 20000
import { superviseEvolution, summariseRun } from '../src/core/supervisor.js';
import { defaultGenome } from '../src/core/genome.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};

const limits = {
  maxGenerations: arg('generations', 3),
  patience: arg('patience', 2),
  maxMs: arg('ms', 30_000),
};

console.log(`supervised evolution — limits: ${JSON.stringify(limits)}\n`);

const run = await superviseEvolution({
  champion: defaultGenome(),
  limits,
  seed: 1,
  onTick: (e) => {
    const mark = { accept: '✓', reject: '·', rollback: '⟲', error: '✗' }[e.action] || '?';
    const score = e.championScore == null ? '—' : e.championScore.toFixed(3);
    const extra = e.violation ? ` [${e.violation}]` : e.reason ? ` (${e.reason})` : '';
    console.log(`  ${mark} gen ${e.generation}: ${e.action} · champion ${score} · ${Math.round(e.ms)}ms${extra}`);
  },
});

console.log(`\n${summariseRun(run)}`);
console.log(`ledger entries: ${run.ledger.length}`);
process.exit(0);
