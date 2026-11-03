// The supervisor is the oversight on an open-ended loop, so its contract is exactly the set of
// promises it must keep no matter what the loop body does: stop on every budget, converge on a
// plateau, never retain a regression, survive a throwing generation, and write down every decision.
// The loop body (`evolve`) and the clock (`now`) are injected, so these run in milliseconds with no
// sandbox and no randomness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { superviseEvolution, createController, summariseRun, SUPERVISOR_DEFAULTS } from '../core/supervisor.js';
import { defaultGenome } from '../core/genome.js';

const champ = (score) => ({ ...defaultGenome(), fitness: score == null ? null : { score } });

// A scripted loop body: each step says whether it accepts, the champion score it would yield, the
// tokens it spent, or that it throws. A rejected step returns the champion it was handed, unchanged.
function scriptedEvolve(steps) {
  let i = 0;
  return async ({ champion }) => {
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    if (step.throw) throw new Error('generation blew up');
    return {
      champion: step.accepted ? champ(step.score) : champion,
      accepted: Boolean(step.accepted),
      record: { generation: i, improved: step.improved ?? 0, reason: step.accepted ? null : 'no-gain' },
      championRun: null,
      challengers: [{ run: { tokensUsed: step.tokens ?? 0 } }],
    };
  };
}

test('a plateau converges and stops; the champion is untouched', async () => {
  const run = await superviseEvolution({
    champion: champ(0.5),
    limits: { patience: 3, maxMs: Infinity },
    evolve: scriptedEvolve([{ accepted: false }]),
  });
  assert.equal(run.stopReason, 'converged');
  assert.equal(run.generations, 3);
  assert.equal(run.accepted, 0);
  assert.equal(run.best.fitness.score, 0.5);
});

test('it climbs while there is gain, then converges', async () => {
  const run = await superviseEvolution({
    champion: champ(0.5),
    limits: { patience: 3, maxMs: Infinity },
    evolve: scriptedEvolve([
      { accepted: true, score: 0.6 },
      { accepted: true, score: 0.7 },
      { accepted: false },
      { accepted: false },
      { accepted: false },
    ]),
  });
  assert.equal(run.stopReason, 'converged');
  assert.equal(run.accepted, 2);
  assert.equal(run.generations, 5);
  assert.equal(run.best.fitness.score, 0.7);
});

test('non-regression: an "accepted" generation that lowers the score is refused and rolled back', async () => {
  const run = await superviseEvolution({
    champion: champ(0.8),
    limits: { patience: 2, maxMs: Infinity },
    evolve: scriptedEvolve([{ accepted: true, score: 0.6 }]),
  });
  assert.equal(run.best.fitness.score, 0.8, 'the retained champion never drops');
  assert.equal(run.accepted, 0);
  assert.equal(run.ledger[0].action, 'rollback');
  assert.equal(run.ledger[0].violation, 'regression-blocked');
  assert.equal(run.stopReason, 'converged');
});

test('the wall-clock budget halts the loop', async () => {
  let clock = 0;
  const run = await superviseEvolution({
    champion: champ(0.5),
    limits: { patience: 999, maxMs: 60_000 },
    now: () => clock,
    onTick: () => {
      clock += 40_000;
    },
    evolve: scriptedEvolve([{ accepted: false }]),
  });
  assert.equal(run.stopReason, 'time-budget');
  assert.equal(run.generations, 2);
});

test('the generation cap halts the loop', async () => {
  const run = await superviseEvolution({
    champion: champ(0.5),
    limits: { maxGenerations: 2, patience: 999, maxMs: Infinity },
    evolve: scriptedEvolve([{ accepted: true, score: 0.6 }, { accepted: true, score: 0.7 }]),
  });
  assert.equal(run.stopReason, 'max-generations');
  assert.equal(run.generations, 2);
  assert.equal(run.accepted, 2);
});

test('the token budget halts the loop', async () => {
  const run = await superviseEvolution({
    champion: champ(0.5),
    limits: { maxTokens: 100, patience: 999, maxMs: Infinity },
    evolve: scriptedEvolve([{ accepted: true, score: 0.6, tokens: 60 }]),
  });
  assert.equal(run.stopReason, 'token-budget');
  assert.equal(run.generations, 2);
  assert.ok(run.tokens >= 100);
});

test('an external abort stops cleanly at the next boundary', async () => {
  const controller = createController();
  const run = await superviseEvolution({
    champion: champ(0.5),
    controller,
    limits: { patience: 999, maxMs: Infinity },
    onTick: (e) => {
      if (e.generation === 1) controller.abort();
    },
    evolve: scriptedEvolve([{ accepted: false }]),
  });
  assert.equal(run.stopReason, 'aborted');
  assert.equal(run.generations, 1);
});

test('a throwing generation is contained; the error budget eventually halts it; the champion survives', async () => {
  const run = await superviseEvolution({
    champion: champ(0.5),
    limits: { patience: 999, maxMs: Infinity }, // maxErrors defaults to 2
    evolve: scriptedEvolve([{ throw: true }]),
  });
  assert.equal(run.stopReason, 'error-budget');
  assert.equal(run.generations, 2);
  assert.equal(run.accepted, 0);
  assert.equal(run.best.fitness.score, 0.5);
  assert.equal(run.ledger.filter((e) => e.action === 'error').length, 2);
});

test('every tick is written to the ledger and streamed to onTick', async () => {
  const seen = [];
  const run = await superviseEvolution({
    champion: champ(0.5),
    limits: { patience: 2, maxMs: Infinity },
    onTick: (e) => seen.push(e.generation),
    evolve: scriptedEvolve([{ accepted: false }]),
  });
  assert.equal(seen.length, run.ledger.length);
  assert.ok(run.ledger.every((e) => Number.isFinite(e.ms) && 'championScore' in e));
});

test('defaults are bounded in time even when nothing else is set', () => {
  assert.ok(Number.isFinite(SUPERVISOR_DEFAULTS.maxMs));
  assert.ok(SUPERVISOR_DEFAULTS.patience >= 1);
  assert.match(summariseRun({ generations: 3, accepted: 1, best: champ(0.7), stopReason: 'converged' }), /نسل/);
});
