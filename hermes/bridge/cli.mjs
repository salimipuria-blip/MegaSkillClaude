#!/usr/bin/env node
// Local runner for one job file (P0). The job is read from a file, never from argv,
// so its content does not end up in shell history.
//   node bridge/cli.mjs --root /path/to/MegaSkillClaude --job job.json
import { readFileSync } from 'node:fs';
import { BridgeError } from './paths.mjs';
import { createContext, runJob } from './dispatcher.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (key === '--root' || key === '--job') out[key.slice(2)] = argv[i + 1];
    else throw new BridgeError('BAD_ARGS', `unknown option ${key}`);
  }
  if (!out.root || !out.job) throw new BridgeError('BAD_ARGS', 'usage: --root <dir> --job <file.json>');
  return out;
}

async function main() {
  try {
    const { root, job } = parseArgs(process.argv.slice(2));
    const ctx = createContext(root);
    const parsed = JSON.parse(readFileSync(job, 'utf8'));
    const out = await runJob(ctx, parsed);
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } catch (err) {
    const code = err instanceof BridgeError ? err.code : 'INTERNAL';
    const message = err instanceof BridgeError ? err.message : 'unexpected error';
    process.stdout.write(`${JSON.stringify({ ok: false, code, message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

main();
