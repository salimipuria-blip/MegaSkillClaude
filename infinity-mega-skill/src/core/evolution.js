// Evolution runner: benchmark the champion, measure three mutants, keep the winner — honestly.
//
// The benchmark is executable code, not a prompt that says "you are better now". A generation that
// cannot beat the champion by EPSILON is rejected and recorded as rejected. That is the whole point.

import { STRATEGIES, reflexSolve } from './reflex.js';
import { publicTask, scoreRun, scoreSuite, TASKS } from './evals.js';
import { runInSandbox } from './sandbox.js';
import { estimateTokens } from './tokens.js';
import { evaluateTriad, prepareCandidate } from './evaluate.js';
import { DEFAULT_GENES, EPSILON, mutate, selectGeneration, validateGenome } from './genome.js';

const LETTERS = ['A', 'B', 'C', 'D'];

/** Default solver: Reflex (deterministic, offline, real execution). */
export function reflexSolver(task, strategy) {
  const solved = reflexSolve(task, strategy);
  return solved.ok ? solved : null;
}

/**
 * Run the benchmark for one genome.
 * @param {object} input
 * @param {object} input.genome
 * @param {Array} [input.tasks]
 * @param {object} [input.sandbox]
 * @param {(solverTask:object, strategy:string)=>object|null} [input.solver]
 * @param {(row:object)=>void} [input.onTask]
 */
export async function runSuite({
  genome,
  tasks = TASKS,
  sandbox = runInSandbox,
  solver = reflexSolver,
  onTask = () => {},
  signal = null,
} = {}) {
  const g = validateGenome(genome);
  const results = [];
  let tokensUsed = 0;

  for (const task of tasks) {
    if (signal?.aborted) break;
    const candidates = [];
    for (let i = 0; i < STRATEGIES.length; i += 1) {
      const strategy = STRATEGIES[i].key;
      const solved = solver(publicTask(task), strategy);
      if (!solved?.content) continue;
      const prepared = prepareCandidate(
        { id: LETTERS[i], strategy, path: solved.path || `src/${task.id}.js`, content: solved.content },
        (task.files && Object.values(task.files).find((_, idx) => idx === 0)) || '',
      );
      candidates.push(prepared);
      tokensUsed += estimateTokens(solved.content);
    }

    let row;
    if (!candidates.length) {
      row = { id: task.id, title: task.title, score: { score: 0, solved: false }, winner: null, ms: 0, probes: 0 };
    } else {
      const { scored, selection } = await evaluateTriad({
        candidates,
        task,
        sandbox,
        genome: g,
        baselineOf: (path) => candidates.find((c) => c.path === path)?.baseline || '',
      });
      const best = selection.winner;
      const perTask = best
        ? scoreRun({ publicResults: best.publicRun?.results || [], hiddenResults: best.hiddenRun?.results || [] })
        : { score: 0, solved: false };
      row = {
        id: task.id,
        title: task.title,
        level: task.level,
        score: perTask,
        winner: best ? { id: best.id, strategy: best.strategy, total: best.total } : null,
        candidates: scored.map((s) => ({ id: s.id, strategy: s.strategy, total: s.total, churn: s.churn })),
        confirmed: best?.confirmed || 0,
        ms: (best?.publicRun?.ms || 0) + (best?.hiddenRun?.ms || 0),
        probes: (best?.probeRun?.results || []).length,
        tokens: candidates.reduce((s, c) => s + estimateTokens(c.content), 0),
      };
    }
    results.push(row);
    onTask(row);
  }

  return { results, suite: scoreSuite(results), tokensUsed, genomeId: g.id, at: Date.now() };
}

/** Attach a fitness to a genome using measured evidence. */
export async function evaluateGenome({ genome, ...opts } = {}) {
  const run = await runSuite({ genome, ...opts });
  const budget = (opts.tasks?.length || TASKS.length) * (opts.expectedTokens || 400);
  const { scoreFitness } = await import('./genome.js');
  const fitness = scoreFitness({
    suite: run.suite,
    tokensUsed: run.tokensUsed,
    budget: Math.max(1, budget),
    regressionFree: true,
  });
  return { ...run, genome: { ...validateGenome(genome), fitness }, fitness };
}

/**
 * One full generation: evaluate the champion if needed, then exactly three mutants, then select.
 * @returns {Promise<{champion:object, accepted:boolean, record:object, note:string, championRun:object, challengers:Array}>}
 */
export async function evolveOnce({
  champion,
  tasks = TASKS,
  sandbox = runInSandbox,
  onPhase = () => {},
  signal = null,
  seed = null,
} = {}) {
  const base = validateGenome(champion);
  let championWithFitness = base;
  let championRun;

  if (!base.fitness) {
    onPhase({ phase: 'champion', text: 'قهرمان فعلی هنوز سنجیده نشده؛ اول بنچمارک می‌شود.' });
    championRun = await evaluateGenome({ genome: base, tasks, sandbox, signal });
    championWithFitness = championRun.genome;
  }

  const mutants = mutate(championWithFitness, seed == null ? undefined : { seed });
  onPhase({ phase: 'mutants', text: `سه جهش‌یافته ساخته شد: ${mutants.map((m) => m.label).join('، ')}`, mutants });

  const challengers = [];
  for (const mutant of mutants) {
    if (signal?.aborted) break;
    onPhase({ phase: 'measure', text: `سنجش «${mutant.label}» با همان بنچمارک…`, mutant });
    const evaluated = await evaluateGenome({ genome: mutant.genome, tasks, sandbox, signal });
    challengers.push({ mutant, fitness: evaluated.fitness, suite: evaluated.suite, run: evaluated });
    onPhase({
      phase: 'measured',
      text: `«${mutant.label}»: ${evaluated.fitness.score} (${evaluated.suite.solved}/${evaluated.suite.total} حل‌شده)`,
      mutant,
      fitness: evaluated.fitness,
      suite: evaluated.suite,
    });
  }

  const selection = selectGeneration({ champion: championWithFitness, challengers, epsilon: EPSILON });
  onPhase({ phase: 'select', ...selection });
  return {
    ...selection,
    championRun,
    challengers,
    champion: selection.champion,
  };
}

/** Human-readable note for a rejected generation, used in the UI toast. */
export function generationNote(record) {
  if (!record) return '';
  return record.accepted
    ? `نسل ${record.generation} پذیرفته شد (+${record.improved}).`
    : `نسل ${record.generation} رد شد (${record.reason}).`;
}

/** Guard: a genome may never request more than the sandbox can prove in reasonable time. */
export function safeStepBudget(genome) {
  const g = validateGenome(genome);
  return Math.min(g.genes.maxSteps, 12);
}

export const BENCHMARK_SIZE = TASKS.length;
export const DEFAULT_GENE_KEYS = Object.keys(DEFAULT_GENES);
