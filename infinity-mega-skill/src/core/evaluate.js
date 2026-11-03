// Shared measurement: candidate → diff → three failure hypotheses → sandbox → score.
// Both the interactive agent and the evolution runner call this, so a score in the chat and a score
// in the benchmark mean exactly the same thing.

import { createPatch, patchStats } from './diff.js';

const round = (v) => Math.round(v * 1000) / 1000;
import { runInSandbox } from './sandbox.js';
import {
  applyProbeVerdicts,
  codebreak,
  probesFor,
  resolveWeights,
  scoreCandidate,
  selectWinner,
} from './triad.js';

/**
 * Prepare a candidate (diff + stats) without running anything.
 * @param {{id:string, strategy:string, path:string, content:string}} candidate
 * @param {string} baseline existing file content
 */
export function prepareCandidate(candidate, baseline) {
  const diff = createPatch(baseline, candidate.content, { path: candidate.path });
  return { ...candidate, diff, baseline, stats: patchStats(diff) };
}

/**
 * Run one candidate: public cases, hidden cases, and the executable failure hypotheses.
 * @returns {Promise<object>} enriched score record
 */
export async function measureCandidate({
  candidate,
  task,
  sandbox = runInSandbox,
  weights = {},
  probeDepth = 2,
  verifyHidden = true,
}) {
  const baseline = candidate.baseline ?? '';
  const prepared = candidate.diff !== undefined ? candidate : prepareCandidate(candidate, baseline);
  const { hypotheses } = codebreak({
    task,
    candidate: prepared,
    baseline,
    policy: { edgeProbes: probeDepth },
  });

  const entries = task?.entry;
  const publicRun = task?.cases?.length
    ? await sandbox({ entry: prepared.content, cases: task.cases, entries })
    : { ok: false, results: [], ms: 0, error: 'no public cases' };
  const hiddenRun = task?.hidden?.length && verifyHidden
    ? await sandbox({ entry: prepared.content, cases: task.hidden, entries })
    : { ok: false, results: [], ms: 0 };

  const probeCases = probesFor(hypotheses);
  const probeRun = probeCases.length
    ? await sandbox({ entry: prepared.content, cases: probeCases, entries })
    : { ok: true, results: [], ms: 0 };
  const withVerdicts = applyProbeVerdicts(hypotheses, probeRun);

  const score = scoreCandidate({
    candidate: prepared,
    publicRun,
    hiddenRun,
    hypotheses: withVerdicts,
    baselineChurn: Math.max(4, String(baseline).split('\n').length, prepared.stats?.churn || 0),
    weights,
  });

  return { ...score, candidate: prepared, hypotheses: withVerdicts, publicRun, hiddenRun, probeRun };
}

/** Measure a whole triad and select a winner. */
export async function evaluateTriad({
  candidates,
  task,
  sandbox = runInSandbox,
  genome,
  baselineOf = () => '',
  onCandidate = () => {},
}) {
  const weights = resolveWeights(genome?.rubric);
  const scored = [];
  for (const candidate of candidates) {
    const baseline = baselineOf(candidate.path);
    const measured = await measureCandidate({
      candidate: { ...candidate, baseline },
      task,
      sandbox,
      weights,
      probeDepth: genome?.genes?.probeDepth ?? 2,
      verifyHidden: genome?.genes?.verifyHidden ?? true,
    });
    // A genome slightly prefers its own strategy weights; the effect is small and explicit.
    const bonus = ((genome?.strategyWeights?.[candidate.strategy] ?? 1) - 1) * 0.02;
    measured.total = round(Math.max(0, Math.min(1, measured.total + bonus)));
    // The same deterministic bonus rides the ranking score, so the winner stays timing-independent.
    if (typeof measured.decisionTotal === 'number') {
      measured.decisionTotal = round(Math.max(0, Math.min(1, measured.decisionTotal + bonus)));
    }
    measured.strategyBonus = round(bonus);
    scored.push(measured);
    onCandidate(measured);
  }
  return { scored, selection: selectWinner(scored) };
}
