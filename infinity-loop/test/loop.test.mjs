// The loop's rules are the whole point, so they are pinned with a fake model (no network, no DeepSeek).
// Each test injects a `client` that returns scripted grader replies and asserts the loop's decision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict, planHash, reviewLoop, inspectLoop } from '../src/loop.mjs';

const clientReturning = (replies) => {
  let i = 0;
  return async () => ({ content: replies[Math.min(i++, replies.length - 1)] });
};

test('parseVerdict reads the final VERDICT and the findings', () => {
  const r = parseVerdict('- [MAJOR] no acceptance criteria\n- [NIT] typo\nVERDICT: REVISE', { kind: 'review' });
  assert.equal(r.verdict, 'REVISE');
  assert.equal(r.verdictFound, true);
  assert.deepEqual(r.findings.map((f) => f.severity), ['MAJOR', 'NIT']);
});

test('a missing or malformed verdict is unsafe-by-default, never silent approval', () => {
  assert.equal(parseVerdict('looks good to me!', { kind: 'review' }).verdict, 'BLOCKED');
  assert.equal(parseVerdict('all fine', { kind: 'inspect' }).verdict, 'FAIL');
  assert.equal(parseVerdict('VERDICT: LGTM', { kind: 'review' }).verdictFound, false);
});

test('an echoed "VERDICT: PASS / FAIL" line is not an approval (exact final line only)', () => {
  const r = parseVerdict('No issues.\nVERDICT: PASS / FAIL', { kind: 'inspect' });
  assert.equal(r.verdictFound, false);
  assert.equal(r.verdict, 'FAIL');
});

test('an earlier valid verdict never survives a malformed final line', () => {
  const r = parseVerdict('VERDICT: PASS\n\nactually, let me reconsider…', { kind: 'inspect' });
  assert.equal(r.verdictFound, false);
  assert.equal(r.verdict, 'FAIL');
});

test('APPROVED with a lingering blocking finding is not an approval', async () => {
  const client = clientReturning(['- [BLOCKER] data loss on retry\nVERDICT: APPROVED']);
  const r = await reviewLoop({ client, planText: 'plan', now: () => 0 });
  assert.equal(r.approved, false);
});

test('review approves a clean plan and binds approval to its sha256', async () => {
  const client = clientReturning(['Looks sound.\nVERDICT: APPROVED']);
  const r = await reviewLoop({ client, planText: 'the plan', now: () => 0 });
  assert.equal(r.approved, true);
  assert.equal(r.planSha, planHash('the plan'));
  assert.equal(r.rounds, 1);
});

test('REVISE then APPROVED across rounds; the hash follows the plan that earned approval', async () => {
  const client = clientReturning(['- [MAJOR] vague\nVERDICT: REVISE', 'Better.\nVERDICT: APPROVED']);
  const r = await reviewLoop({
    client, planText: 'v1', now: () => 0,
    revisePlan: () => 'v2-hardened',
    limits: { maxRounds: 5 },
  });
  assert.equal(r.approved, true);
  assert.equal(r.rounds, 2);
  assert.equal(r.planSha, planHash('v2-hardened'));
});

test('the round cap stops the review and does not approve', async () => {
  const client = clientReturning(['- [MAJOR] still vague\nVERDICT: REVISE']);
  const r = await reviewLoop({ client, planText: 'v', revisePlan: () => 'again', limits: { maxRounds: 3 }, now: () => 0 });
  assert.equal(r.approved, false);
  assert.equal(r.rounds, 3);
});

test('a grader error never counts as approval', async () => {
  const client = async () => { throw new Error('connection refused'); };
  const r = await reviewLoop({ client, planText: 'p', now: () => 0 });
  assert.equal(r.approved, false);
  assert.equal(r.verdict, 'BLOCKED');
  assert.match(r.ledger[0].error, /connection refused/);
});

test('inspect passes a clean diff and fails one with a blocker', async () => {
  const pass = await inspectLoop({ client: clientReturning(['No issues.\nVERDICT: PASS']), planText: 'p', diff: 'd', now: () => 0 });
  assert.equal(pass.passed, true);
  const fail = await inspectLoop({ client: clientReturning(['- [BLOCKER] SQL injection\nVERDICT: PASS']), planText: 'p', diff: 'd', now: () => 0 });
  assert.equal(fail.passed, false, 'a blocking finding overrides a PASS verdict');
});

test('inspect retries up to the cap when a rebuild is supplied', async () => {
  const client = clientReturning(['- [MAJOR] off-by-one\nVERDICT: FAIL', 'Fixed.\nVERDICT: PASS']);
  const r = await inspectLoop({ client, planText: 'p', diff: 'd0', rebuild: () => 'd1', limits: { maxInspectionRounds: 2 }, now: () => 0 });
  assert.equal(r.passed, true);
  assert.equal(r.rounds, 2);
});

test('the ledger records every round with a timestamp', async () => {
  const client = clientReturning(['VERDICT: APPROVED']);
  const r = await reviewLoop({ client, planText: 'p', now: () => 123 });
  assert.equal(r.ledger.length, 1);
  assert.equal(r.ledger[0].at, 123);
  assert.equal(r.ledger[0].phase, 'review');
});
