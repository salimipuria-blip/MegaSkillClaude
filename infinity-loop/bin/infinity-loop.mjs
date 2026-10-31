#!/usr/bin/env node
// infinity-loop — run your LOCAL DeepSeek as an independent plan reviewer and code inspector.
// Whoever built it never grades it: you (or Claude) write the plan and the code; DeepSeek grades.
//
//   infinity-loop doctor                         # find your local DeepSeek endpoint + model
//   infinity-loop review --plan PLAN.md          # DeepSeek hardens the plan (exit 0 = APPROVED)
//   infinity-loop inspect --base origin/main     # DeepSeek inspects the diff (exit 0 = PASS)
//   git diff | infinity-loop inspect --plan PLAN.md   # inspect a diff from stdin
//
// Endpoints default to Ollama (:11434) then LM Studio (:1234); override with env
// INFINITY_LOOP_BASE_URL / INFINITY_LOOP_MODEL. Exit: 0 pass/approved, 1 revise/fail, 2 usage/setup.
import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { probe, resolveConfig, makeClient } from '../src/client.mjs';
import { reviewLoop, inspectLoop } from '../src/loop.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : (argv.includes(`--${name}`) ? true : dflt);
};
const log = (line) => {
  const file = flag('log', 'LOOP-LEDGER.jsonl');
  try { appendFileSync(file, `${JSON.stringify({ ...line, ts: new Date().toISOString() })}\n`); } catch { /* ledger is best-effort */ }
};
// Only read stdin when something is piped in. On an interactive terminal readFileSync(0) would block
// waiting for EOF, so `inspect --base <ref>` would hang before reaching the git-diff fallback.
const readStdin = () => {
  if (process.stdin.isTTY) return '';
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
};

async function resolveClient() {
  const found = await probe();
  if (!found) {
    console.error('✗ no local model endpoint answered (tried Ollama :11434 and LM Studio :1234).');
    console.error('  start your DeepSeek server, or set INFINITY_LOOP_BASE_URL / INFINITY_LOOP_MODEL.');
    process.exit(2);
  }
  return { found, client: makeClient({ ...resolveConfig(), baseUrl: found.baseUrl, model: found.model }) };
}

function printResult(title, r) {
  console.log(`\n${title}: ${r.verdict}  (${r.rounds} round${r.rounds === 1 ? '' : 's'})`);
  const last = [...r.ledger].reverse().find((e) => e.findings);
  for (const f of last?.findings || []) console.log(`  - [${f.severity}] ${f.text}`);
  if (last && !last.verdictFound) console.log('  ! grader gave no machine-readable VERDICT line → treated as the unsafe outcome');
}

async function main() {
  if (cmd === 'doctor') {
    const found = await probe();
    if (!found) { console.error('✗ no local DeepSeek endpoint found (Ollama :11434 / LM Studio :1234).'); return 2; }
    console.log(`✓ endpoint: ${found.endpoint}  (${found.baseUrl})`);
    console.log(`✓ model:    ${found.model}`);
    if (found.models?.length) console.log(`  available: ${found.models.join(', ')}`);
    return 0;
  }

  if (cmd === 'review') {
    const planPath = flag('plan', 'PLAN.md');
    let planText;
    try { planText = readFileSync(planPath, 'utf8'); } catch { console.error(`✗ cannot read plan: ${planPath}`); return 2; }
    const { found, client } = await resolveClient();
    console.log(`reviewing ${planPath} with ${found.model} (${found.endpoint}) …`);
    const r = await reviewLoop({ client, planText, limits: { maxRounds: Number(flag('rounds', 1)) } });
    for (const e of r.ledger) log({ cmd: 'review', ...e });
    printResult('plan review', r);
    console.log(`plan sha256: ${r.planSha}`);
    return r.approved ? 0 : 1;
  }

  if (cmd === 'inspect') {
    const planPath = flag('plan', 'PLAN.md');
    let planText = '';
    try { planText = readFileSync(planPath, 'utf8'); } catch { planText = '(no plan file supplied)'; }
    const base = flag('base', null);
    let diff = readStdin();
    if (!diff && base) {
      try { diff = execFileSync('git', ['diff', `${base}...HEAD`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
      catch (e) { console.error(`✗ git diff ${base}...HEAD failed: ${e.message}`); return 2; }
    }
    if (!diff.trim()) { console.error('✗ no diff: pipe one in, or pass --base <ref>.'); return 2; }
    const { found, client } = await resolveClient();
    console.log(`inspecting diff (${diff.length} bytes) with ${found.model} (${found.endpoint}) …`);
    const r = await inspectLoop({ client, planText, diff, limits: { maxInspectionRounds: Number(flag('rounds', 1)) } });
    for (const e of r.ledger) log({ cmd: 'inspect', ...e });
    printResult('inspection', r);
    return r.passed ? 0 : 1;
  }

  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  return cmd ? 2 : 0;
}

main().then((code) => { process.exitCode = code; }).catch((err) => { console.error(`✗ ${err?.message || err}`); process.exitCode = 2; });
