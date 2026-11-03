// Supervised evolution loop: run generations "forever" — but under a watchdog that can never let
// the agent regress, run away, or lie about progress. "Infinite" here means "until there is nothing
// left to gain", not "until something breaks". The supervisor is the oversight: every tick passes a
// hard gate, every decision is written to a ledger, and the retained champion is monotonic.
//
// This module is pure core: no DOM, no window, no dependency. The loop body is injected (default
// `evolveOnce`) and so is the clock (`now`), so the whole watchdog is deterministic under test.
//
//   import { superviseEvolution, createController } from './supervisor.js';
//   const run = await superviseEvolution({ champion, limits: { maxMs: 10_000, patience: 3 } });
//   run.stopReason  // 'converged' | 'time-budget' | 'max-generations' | 'token-budget'
//                   // | 'error-budget' | 'aborted'

import { evolveOnce } from './evolution.js';
import { validateGenome } from './genome.js';
import { TASKS } from './evals.js';

/**
 * Loop-level guards. The per-generation ε gate lives in `selectGeneration`; these bound the loop
 * itself so it is safe to leave running.
 */
export const SUPERVISOR_DEFAULTS = {
  maxGenerations: Infinity, // keep going…
  maxMs: 60_000, // …but never past this wall-clock budget,
  maxTokens: Infinity, // …or this measured-token budget,
  patience: 3, // stop after this many consecutive non-improvements (plateau = converged),
  maxErrors: 2, // stop after this many consecutive throwing generations,
};

/** A halt handle the caller can trip from outside the loop (a Stop button, a timeout, a signal). */
export function createController() {
  let aborted = false;
  return {
    get aborted() {
      return aborted;
    },
    abort() {
      aborted = true;
    },
  };
}

const scoreOf = (genome) => (genome && genome.fitness && Number.isFinite(genome.fitness.score) ? genome.fitness.score : null);

/** Tokens a single generation is known to have spent, from whatever evidence the runner returned. */
function tokensOfGeneration(gen) {
  let spent = gen?.championRun?.tokensUsed || 0;
  for (const c of gen?.challengers || []) spent += c?.run?.tokensUsed || 0;
  return spent;
}

/**
 * Run the evolution loop under supervision.
 *
 * Invariants the supervisor enforces, no matter what the loop body claims:
 *  1. Non-regression — the retained champion's fitness is monotonic non-decreasing. An "accepted"
 *     generation whose champion scores lower than the best so far is refused and recorded as a
 *     `regression-blocked` violation (defense-in-depth behind `selectGeneration`).
 *  2. Bounded — the loop stops on maxGenerations, maxMs, maxTokens, plateau (patience), an external
 *     abort, or an error budget. It cannot run truly forever.
 *  3. Fault-contained — a throwing generation never corrupts the champion; the best so far is kept.
 *  4. Auditable — every tick is appended to `ledger` and streamed to `onTick`; nothing is hidden.
 *
 * @returns {Promise<{champion:object, best:object, stopReason:string, generations:number,
 *   accepted:number, tokens:number, ms:number, ledger:object[]}>}
 */
export async function superviseEvolution({
  champion,
  tasks = TASKS,
  limits = {},
  evolve = evolveOnce,
  now = () => Date.now(),
  onTick = () => {},
  controller = createController(),
  sandbox = undefined,
  seed = null,
} = {}) {
  const cfg = { ...SUPERVISOR_DEFAULTS, ...limits };
  let best = validateGenome(champion); // best-so-far; never allowed to regress
  const start = now();
  const ledger = [];

  let generations = 0;
  let accepted = 0;
  let tokens = 0;
  let stalls = 0;
  let errors = 0;
  let stopReason = null;

  const record = (entry) => {
    const full = { ...entry, championScore: scoreOf(best), stalls, tokens, ms: now() - start };
    ledger.push(full);
    onTick(full);
    return full;
  };

  while (stopReason === null) {
    // Budget checks happen before work, so a tripped budget never does one extra generation.
    if (controller.aborted) {
      stopReason = 'aborted';
      break;
    }
    if (generations >= cfg.maxGenerations) {
      stopReason = 'max-generations';
      break;
    }
    if (now() - start >= cfg.maxMs) {
      stopReason = 'time-budget';
      break;
    }
    if (tokens >= cfg.maxTokens) {
      stopReason = 'token-budget';
      break;
    }

    generations += 1;
    let gen;
    try {
      gen = await evolve({
        champion: best,
        tasks,
        sandbox,
        signal: controller,
        seed: seed == null ? null : seed + generations,
      });
    } catch (err) {
      errors += 1;
      record({ generation: generations, action: 'error', violation: null, error: String(err?.message || err), candidateScore: null, reason: null });
      if (errors >= cfg.maxErrors) {
        stopReason = 'error-budget';
        break;
      }
      continue; // champion untouched; try the next generation
    }
    errors = 0;

    // If this generation measured the champion for the first time, adopt that measured fitness as
    // the baseline: the same genome, now scored. This is the floor, not an acceptance, so it gives
    // the ledger and the non-regression gate a real number without counting as progress.
    if (scoreOf(best) === null && gen?.championRun?.genome?.fitness) {
      best = validateGenome(gen.championRun.genome);
    }

    const candidate = validateGenome(gen?.champion ?? best);
    const prev = scoreOf(best);
    const next = scoreOf(candidate);

    let action;
    let violation = null;
    if (gen?.accepted && (prev === null || (next !== null && next + 1e-9 >= prev))) {
      best = candidate;
      accepted += 1;
      stalls = 0;
      action = 'accept';
    } else if (gen?.accepted) {
      // The loop body said accept, but it would lower the retained score. The supervisor refuses.
      violation = 'regression-blocked';
      stalls += 1;
      action = 'rollback';
    } else {
      stalls += 1;
      action = 'reject';
    }

    tokens += tokensOfGeneration(gen);
    record({
      generation: generations,
      action,
      violation,
      candidateScore: next,
      improved: gen?.record?.improved ?? 0,
      reason: gen?.record?.reason ?? null,
    });

    if (stalls >= cfg.patience) {
      stopReason = 'converged';
      break;
    }
  }

  return { champion: best, best, stopReason, generations, accepted, tokens, ms: now() - start, ledger };
}

/** One-line human summary of a finished supervised run, for a toast or a CLI line. */
export function summariseRun(run) {
  if (!run) return '';
  const why = {
    converged: 'به فلات رسید (بهبودی نماند)',
    'time-budget': 'سقف زمان',
    'token-budget': 'سقف توکن',
    'max-generations': 'سقف نسل‌ها',
    'error-budget': 'سقف خطا',
    aborted: 'توقف دستی',
  }[run.stopReason] || run.stopReason;
  return `${run.generations} نسل · ${run.accepted} پذیرش · امتیاز ${scoreOf(run.best) ?? '—'} · توقف: ${why}`;
}
