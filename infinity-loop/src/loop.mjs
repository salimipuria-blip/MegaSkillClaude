// The loop: an independent model (your local DeepSeek) hardens a plan and inspects a diff, under
// the same rule as claudex-loop — whoever built it never grades it. This module is pure: the model
// `client` and the `now` clock are injected, so every rule here is tested offline with a fake model.
//
// Contract with the grader (see prompts.mjs): the reply ends with a line
//   VERDICT: APPROVED | REVISE | BLOCKED   (review)   /   VERDICT: PASS | FAIL   (inspect)
// A missing or unreadable verdict is the UNSAFE outcome (BLOCKED / FAIL), never silent approval.

import { createHash } from 'node:crypto';
import { REVIEW_SYSTEM, INSPECT_SYSTEM } from './prompts.mjs';

export const DEFAULTS = { maxRounds: 5, maxInspectionRounds: 2 };
const SEVERITIES = ['BLOCKER', 'MAJOR', 'MINOR', 'NIT'];

/** SHA256 of the exact plan text — approval is bound to this, so any edit invalidates it. */
export function planHash(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/** Pull findings and the final VERDICT out of a grader reply. Unsafe-by-default. */
export function parseVerdict(text, { kind } = { kind: 'review' }) {
  const allowed = kind === 'inspect' ? ['PASS', 'FAIL'] : ['APPROVED', 'REVISE', 'BLOCKED'];
  const unsafe = kind === 'inspect' ? 'FAIL' : 'BLOCKED';
  const lines = String(text || '').split('\n').map((l) => l.trim());
  const findings = lines
    .filter((l) => /^-\s*\[(BLOCKER|MAJOR|MINOR|NIT)\]/i.test(l))
    .map((l) => {
      const sev = l.match(/^-\s*\[(BLOCKER|MAJOR|MINOR|NIT)\]/i)[1].toUpperCase();
      return { severity: sev, text: l.replace(/^-\s*\[[A-Za-z]+\]\s*/, '') };
    });
  let verdict = null;
  for (const l of lines) {
    const m = l.match(/^VERDICT:\s*([A-Z]+)/i);
    if (m && allowed.includes(m[1].toUpperCase())) verdict = m[1].toUpperCase(); // last valid wins
  }
  return { verdict: verdict || unsafe, verdictFound: Boolean(verdict), findings };
}

const blocking = (findings) => findings.filter((f) => f.severity === 'BLOCKER' || f.severity === 'MAJOR');

/** One review pass over a plan. */
export async function reviewOnce({ client, planText }) {
  const { content } = await client({
    messages: [
      { role: 'system', content: REVIEW_SYSTEM },
      { role: 'user', content: `Plan to review:\n\n${planText}` },
    ],
    temperature: 0,
  });
  return { ...parseVerdict(content, { kind: 'review' }), raw: content };
}

/** One inspection pass over a diff. */
export async function inspectOnce({ client, planText, diff }) {
  const { content } = await client({
    messages: [
      { role: 'system', content: INSPECT_SYSTEM },
      { role: 'user', content: `Plan the change claims to implement:\n\n${planText}\n\n---\nUnified diff to inspect:\n\n${diff}` },
    ],
    temperature: 0,
  });
  return { ...parseVerdict(content, { kind: 'inspect' }), raw: content };
}

/**
 * Review a plan across up to maxRounds. The plan can change between rounds (the host edits it after
 * each REVISE); approval is bound to the hash of the plan that earned it. Stops on APPROVED, BLOCKED,
 * the round cap, or an error. Never treats an error or a missing verdict as approval.
 *
 * @param {object} o
 * @param {(round:number, prev:object)=>Promise<string>|string} [o.revisePlan] returns the revised plan text for the next round
 * @returns {Promise<{approved:boolean, verdict:string, rounds:number, planSha:string|null, ledger:object[]}>}
 */
export async function reviewLoop({ client, planText, revisePlan = null, limits = {}, now = () => Date.now() }) {
  const cfg = { ...DEFAULTS, ...limits };
  const ledger = [];
  let plan = planText;
  let round = 0;
  let last = null;
  while (round < cfg.maxRounds) {
    round += 1;
    let r;
    try {
      r = await reviewOnce({ client, planText: plan });
    } catch (err) {
      ledger.push({ phase: 'review', round, error: String(err?.message || err), at: now() });
      return { approved: false, verdict: 'BLOCKED', rounds: round, planSha: null, ledger };
    }
    last = r;
    const sha = planHash(plan);
    ledger.push({ phase: 'review', round, verdict: r.verdict, verdictFound: r.verdictFound, findings: r.findings, planSha: sha, at: now() });
    if (r.verdict === 'APPROVED' && blocking(r.findings).length === 0) {
      return { approved: true, verdict: 'APPROVED', rounds: round, planSha: sha, ledger };
    }
    if (r.verdict === 'BLOCKED') return { approved: false, verdict: 'BLOCKED', rounds: round, planSha: sha, ledger };
    if (!revisePlan) break; // REVISE but no reviser supplied: stop and report
    plan = String(await revisePlan(round, r));
  }
  return { approved: false, verdict: last?.verdict || 'BLOCKED', rounds: round, planSha: planHash(plan), ledger };
}

/**
 * Inspect a built change across up to maxInspectionRounds. `rebuild` (optional) is called after a
 * FAIL to produce the next diff (the builder fixes); approval requires a PASS with no blocking finding.
 */
export async function inspectLoop({ client, planText, diff, rebuild = null, limits = {}, now = () => Date.now() }) {
  const cfg = { ...DEFAULTS, ...limits };
  const ledger = [];
  let current = diff;
  let round = 0;
  while (round < cfg.maxInspectionRounds) {
    round += 1;
    let r;
    try {
      r = await inspectOnce({ client, planText, diff: current });
    } catch (err) {
      ledger.push({ phase: 'inspect', round, error: String(err?.message || err), at: now() });
      return { passed: false, verdict: 'FAIL', rounds: round, ledger };
    }
    ledger.push({ phase: 'inspect', round, verdict: r.verdict, verdictFound: r.verdictFound, findings: r.findings, at: now() });
    if (r.verdict === 'PASS' && blocking(r.findings).length === 0) {
      return { passed: true, verdict: 'PASS', rounds: round, ledger };
    }
    if (!rebuild) break;
    current = String(await rebuild(round, r));
  }
  return { passed: false, verdict: 'FAIL', rounds: round, ledger };
}

export { SEVERITIES };
