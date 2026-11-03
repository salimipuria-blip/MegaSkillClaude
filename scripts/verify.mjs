#!/usr/bin/env node
// Local CI gate: run what .github/workflows/ci.yml will run on the pull request, before the push.
// The workflow file is the single source of truth: every `run:` step is read from it, so a step
// added to CI is verified here the same day, and a job this gate cannot place fails loudly instead
// of being silently left out. One branch, one pull request: verify, then push to the same PR.
//
//   node scripts/verify.mjs                 # jobs touched by this branch + the repo-wide jobs
//   node scripts/verify.mjs --all           # every job (still skips heavy ones without --full)
//   node scripts/verify.mjs --full          # also run heavy jobs (real browser e2e)
//   node scripts/verify.mjs --strict        # a locally skipped step (missing tool) is a failure
//   node scripts/verify.mjs --plan [--json] # what would run and why; executes nothing
//   node scripts/verify.mjs --jobs=router,infinity
//   node scripts/verify.mjs --pr-title "…" --pr-body-file body.md   # also check the PR text
//   node scripts/verify.mjs --base=main     # base branch (default: main)
//
// Exit: 0 every selected step passed (skips listed) · 1 a step failed · 2 the gate itself is broken.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CI_PATH = '.github/workflows/ci.yml';

/** Jobs that check the repository as a whole: they run on every pull request. */
export const REPO_WIDE = new Set(['repo-health', 'router', 'commit-identity']);
/** Jobs that need a real browser download; local runs need --full. */
export const HEAVY = new Set(['fjcod-e2e']);

// ---------------------------------------------------------------- workflow parsing (YAML subset)

const indentOf = (line) => line.length - line.trimStart().length;

/** Read the value of `key:` that starts on lines[i] — plain, `|` literal or `>-` folded. */
function readScalar(lines, i, keyIndent, rest) {
  const value = rest.trim();
  if (value === '|' || value === '|-' || value === '>' || value === '>-') {
    const body = [];
    let j = i + 1;
    let blockIndent = null;
    for (; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '') { body.push(''); continue; }
      if (indentOf(line) <= keyIndent) break;
      if (blockIndent === null) blockIndent = indentOf(line);
      body.push(line.slice(blockIndent));
    }
    while (body.length && body[body.length - 1] === '') body.pop();
    const text = value.startsWith('>') ? body.join(' ').replace(/\s+/g, ' ').trim() : body.join('\n');
    return { text, next: j };
  }
  return { text: value.replace(/^(['"])(.*)\1$/, '$2'), next: i + 1 };
}

/** Parse the `jobs:` map of a workflow into [{ id, block, workingDirectory, steps:[{run, if, env, wd, line}] }]. */
export function parseWorkflow(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start < 0) throw new Error('no jobs: map in workflow');
  const jobs = [];
  let job = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const m = lines[i].match(/^ {2}([\w-]+):\s*$/);
    if (m) {
      job = { id: m[1], startLine: i, lines: [] };
      jobs.push(job);
      continue;
    }
    if (job) job.lines.push(lines[i]);
  }
  for (const j of jobs) {
    j.block = j.lines.join('\n');
    const wd = j.block.match(/^ {4}defaults:\n {6}run:\n {8}working-directory:\s*(\S+)/m);
    j.workingDirectory = wd ? wd[1] : '.';
    j.steps = [];
    const L = j.lines;
    for (let i = 0; i < L.length; i += 1) {
      const stepStart = L[i].match(/^( {6})- (.*)$/);
      if (!stepStart) continue;
      const step = { if: null, env: {}, wd: null, run: null, line: j.startLine + 2 + i };
      // The first key sits on the dash line; the others are indented two past the dash.
      const keyIndent = 8;
      const keyLines = [[i, `${' '.repeat(keyIndent)}${stepStart[2]}`]];
      let k = i + 1;
      while (k < L.length && (L[k].trim() === '' || indentOf(L[k]) >= keyIndent) && !/^ {6}- /.test(L[k])) {
        keyLines.push([k, L[k]]);
        k += 1;
      }
      const local = keyLines.map(([, l]) => l);
      for (let q = 0; q < local.length; q += 1) {
        const km = local[q].match(/^( {8})([\w-]+):(.*)$/);
        if (!km) continue;
        const [, , key, rest] = km;
        if (key === 'env') {
          for (let e = q + 1; e < local.length && indentOf(local[e]) > keyIndent; e += 1) {
            const em = local[e].match(/^\s+([\w]+):\s*(.*)$/);
            if (em) step.env[em[1]] = em[2].replace(/^(['"])(.*)\1$/, '$2');
          }
          continue;
        }
        if (!['run', 'if', 'working-directory'].includes(key)) continue;
        const { text: value } = readScalar(local, q, keyIndent, rest);
        if (key === 'run') step.run = value;
        else if (key === 'if') step.if = value;
        else step.wd = value;
      }
      if (step.run !== null) j.steps.push(step);
      i = k - 1;
    }
  }
  return jobs;
}

/** The folder a project job works in; null when it cannot be placed (the gate then refuses). */
export function jobScope(job) {
  if (REPO_WIDE.has(job.id)) return '.';
  if (job.workingDirectory !== '.') return job.workingDirectory;
  const prefixes = new Set();
  for (const s of job.steps) {
    for (const m of s.run.matchAll(/--prefix\s+([\w./-]+)/g)) prefixes.add(m[1].replace(/\/$/, ''));
  }
  if (prefixes.size) {
    // The common top folder of every --prefix target (hermes, viking-team/motion, …).
    const list = [...prefixes];
    return list.reduce((a, b) => {
      const pa = a.split('/');
      const pb = b.split('/');
      const common = [];
      for (let i = 0; i < Math.min(pa.length, pb.length) && pa[i] === pb[i]; i += 1) common.push(pa[i]);
      return common.join('/') || '.';
    });
  }
  return null;
}

// ---------------------------------------------------------------- GitHub expression handling

/** Evaluate a step `if:` the way a pull_request event would. Unknown expressions run (fail-safe). */
export function evaluateIf(expr) {
  if (!expr) return true;
  const e = expr.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  if (/github\.event_name\s*==\s*'push'/.test(e)) return false;
  if (/github\.event_name\s*==\s*'pull_request'/.test(e)) return true;
  return true;
}

/** Substitute the handful of contexts the workflow uses; null when a value is unavailable locally. */
function substitute(text, ctx) {
  let missing = null;
  const out = text.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    if (/github\.base_ref/.test(expr) || /default_branch/.test(expr)) return ctx.base;
    if (/pull_request\.number/.test(expr)) return ctx.prNumber;
    if (/pull_request\.title/.test(expr)) return ctx.prTitle ?? (missing = 'PR title');
    if (/pull_request\.body/.test(expr)) return ctx.prBody ?? (missing = 'PR body');
    if (/^secrets\./.test(expr)) return (missing = expr);
    missing = expr;
    return '';
  });
  return missing ? { missing } : { text: out };
}

// ---------------------------------------------------------------- git

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

function mergeBase(base) {
  return tryGit('merge-base', 'HEAD', `origin/${base}`) || tryGit('merge-base', 'HEAD', base);
}

function changedFiles(baseSha) {
  const files = new Set();
  if (baseSha) for (const f of (tryGit('diff', '--name-only', `${baseSha}...HEAD`) || '').split('\n')) if (f) files.add(f);
  for (const f of (tryGit('diff', '--name-only', 'HEAD') || '').split('\n')) if (f) files.add(f);
  for (const f of (tryGit('ls-files', '--others', '--exclude-standard') || '').split('\n')) if (f) files.add(f);
  return [...files];
}

/** Jobs whose definition differs between the base and the working tree. */
function changedJobs(baseSha, current) {
  if (!baseSha) return new Set(current.map((j) => j.id));
  const before = tryGit('show', `${baseSha}:${CI_PATH}`);
  if (!before) return new Set(current.map((j) => j.id));
  const old = new Map(parseWorkflow(before).map((j) => [j.id, j.block]));
  return new Set(current.filter((j) => old.get(j.id) !== j.block).map((j) => j.id));
}

// ---------------------------------------------------------------- plan

export function buildPlan({ jobs, files, jobsChanged, opts }) {
  const plan = [];
  const problems = [];
  for (const job of jobs) {
    const scope = jobScope(job);
    if (scope === null) {
      problems.push(`job "${job.id}" has no working-directory and no --prefix target: teach scripts/verify.mjs its scope`);
      continue;
    }
    const touched = scope === '.' ? false : files.some((f) => f === scope || f.startsWith(`${scope}/`));
    let reason = null;
    if (opts.jobs) reason = opts.jobs.has(job.id) ? 'requested' : null;
    else if (REPO_WIDE.has(job.id)) reason = 'repo-wide';
    else if (opts.all) reason = '--all';
    else if (touched) reason = `changes under ${scope}/`;
    else if (jobsChanged.has(job.id)) reason = 'its ci.yml definition changed';
    let skip = null;
    if (reason && HEAVY.has(job.id) && !opts.full) skip = 'heavy (real browser download): run with --full; CI runs it';
    plan.push({ id: job.id, scope, selected: Boolean(reason), reason, skip, steps: job.steps.length, job });
  }
  return { plan, problems };
}

// ---------------------------------------------------------------- execution

const onPath = (bin) => spawnSync('bash', ['-c', `command -v ${JSON.stringify(bin)}`], { stdio: 'ignore' }).status === 0;
const SHELL_WORDS = new Set(['for', 'if', 'set', 'export', 'cd', 'echo', 'test', '!', '(', '{', 'while', 'printf', 'timeout']);

function firstTool(script) {
  for (const raw of script.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const word = line.split(/\s+/)[0].replace(/^\(/, '');
    if (SHELL_WORDS.has(word) || word.includes('=')) return null;
    return word;
  }
  return null;
}

function runStep(job, step, ctx) {
  if (!evaluateIf(step.if)) return { status: 'skip', why: `if: ${step.if} (not true on a pull_request)` };
  const sub = substitute(step.run, ctx);
  if (sub.missing) return { status: 'skip', why: `needs ${sub.missing}, which is only available in CI` };
  const env = { ...process.env };
  for (const [k, v] of Object.entries(step.env)) {
    const ev = substitute(v, ctx);
    if (ev.missing) return { status: 'skip', why: `env ${k} needs ${ev.missing}` };
    env[k] = ev.text;
  }
  const tool = firstTool(sub.text);
  if (tool && !onPath(tool)) return { status: 'skip', why: `\`${tool}\` is not installed here` };
  const cwd = path.join(ROOT, step.wd || job.workingDirectory);
  if (!existsSync(cwd)) return { status: 'fail', why: `working directory ${path.relative(ROOT, cwd) || '.'} does not exist`, output: '' };
  const t0 = Date.now();
  const res = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', sub.text], {
    cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: ctx.timeoutMs,
  });
  const output = `${res.stdout || ''}${res.stderr || ''}`;
  const ms = Date.now() - t0;
  if (res.error?.code === 'ETIMEDOUT') return { status: 'fail', why: `timed out after ${ctx.timeoutMs / 1000}s`, output, ms };
  return { status: res.status === 0 ? 'pass' : 'fail', why: res.status === 0 ? '' : `exit ${res.status}`, output, ms };
}

// ---------------------------------------------------------------- main

function parseArgs(argv) {
  const get = (name) => {
    const eq = argv.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.slice(name.length + 3);
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  const jobs = get('jobs');
  return {
    all: argv.includes('--all'),
    full: argv.includes('--full'),
    strict: argv.includes('--strict'),
    plan: argv.includes('--plan'),
    json: argv.includes('--json'),
    prePush: argv.includes('--pre-push'),
    jobs: jobs ? new Set(jobs.split(',').map((s) => s.trim()).filter(Boolean)) : null,
    base: get('base') || 'main',
    prTitle: get('pr-title'),
    prBodyFile: get('pr-body-file'),
    timeoutMs: Number(get('timeout') || 900) * 1000,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let jobs;
  try {
    jobs = parseWorkflow(readFileSync(path.join(ROOT, CI_PATH), 'utf8'));
  } catch (err) {
    console.error(`verify: cannot read ${CI_PATH}: ${err.message}`);
    return 2;
  }
  if (opts.jobs) {
    const unknown = [...opts.jobs].filter((id) => !jobs.some((j) => j.id === id));
    if (unknown.length) {
      console.error(`verify: unknown job(s): ${unknown.join(', ')} · known: ${jobs.map((j) => j.id).join(', ')}`);
      return 2;
    }
  }
  if (!opts.plan && (opts.prePush || !tryGit('rev-parse', '--verify', `origin/${opts.base}`))) {
    // The range check needs the base; a failed fetch is reported, not hidden.
    if (tryGit('fetch', '--quiet', 'origin', opts.base) === null) console.error(`verify: could not fetch origin/${opts.base}; using what is local`);
  }
  const baseSha = mergeBase(opts.base);
  const files = changedFiles(baseSha);
  const { plan, problems } = buildPlan({ jobs, files, jobsChanged: changedJobs(baseSha, jobs), opts });

  if (opts.plan) {
    const out = {
      base: opts.base, baseSha, changedFiles: files.length, problems,
      jobs: plan.map(({ id, scope, selected, reason, skip, steps }) => ({ id, scope, selected, reason, skip, steps })),
    };
    if (opts.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`plan vs ${opts.base} (${baseSha ? baseSha.slice(0, 8) : 'no merge-base'}), ${files.length} changed file(s)`);
      for (const p of out.jobs) console.log(`  ${p.selected ? (p.skip ? '–' : '▶') : ' '} ${p.id.padEnd(18)} ${p.scope.padEnd(22)} ${p.reason || ''}${p.skip ? ` · ${p.skip}` : ''}`);
      for (const pr of problems) console.error(`  ✗ ${pr}`);
    }
    return problems.length ? 2 : 0;
  }
  if (problems.length) {
    for (const pr of problems) console.error(`verify: ✗ ${pr}`);
    return 2;
  }

  const ctx = {
    base: opts.base,
    prNumber: 'local',
    prTitle: opts.prTitle ?? process.env.PR_TITLE ?? null,
    prBody: opts.prBodyFile ? readFileSync(opts.prBodyFile, 'utf8') : process.env.PR_BODY ?? null,
    timeoutMs: opts.timeoutMs,
  };
  const results = [];
  const t0 = Date.now();
  console.log(`verify vs ${opts.base} (${baseSha ? baseSha.slice(0, 8) : 'no merge-base'}) · ${files.length} changed file(s)`);
  for (const p of plan.filter((x) => x.selected)) {
    if (p.skip) {
      console.log(`\n– ${p.id}: skipped · ${p.skip}`);
      results.push({ job: p.id, step: '(job)', status: 'skip', why: p.skip });
      continue;
    }
    console.log(`\n▶ ${p.id}  (${p.reason})`);
    for (const step of p.job.steps) {
      const label = step.run.split('\n')[0].slice(0, 96);
      const r = runStep(p.job, step, ctx);
      results.push({ job: p.id, step: label, line: step.line, ...r });
      const mark = { pass: '✓', fail: '✗', skip: '–' }[r.status];
      const time = r.ms != null ? ` ${(r.ms / 1000).toFixed(1)}s` : '';
      console.log(`  ${mark} ${label}${time}${r.why ? ` · ${r.why}` : ''}`);
      if (r.status === 'fail') {
        const tail = (r.output || '').trimEnd().split('\n').slice(-25).join('\n');
        if (tail) console.log(tail.replace(/^/gm, '      │ '));
        console.log(`      ↳ ${CI_PATH}:${step.line}`);
      }
    }
  }
  const failed = results.filter((r) => r.status === 'fail');
  const skipped = results.filter((r) => r.status === 'skip');
  const passed = results.filter((r) => r.status === 'pass');
  console.log(`\n${failed.length ? '✗' : '✓'} ${passed.length} passed · ${failed.length} failed · ${skipped.length} skipped locally · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (skipped.length) console.log('  skipped steps are not verified here; CI still runs them (use --strict to refuse them)');
  if (failed.length) {
    console.log('  do not push: fix the failures above, commit, and run the gate again (same branch, same PR)');
    return 1;
  }
  if (opts.strict && skipped.length) return 1;
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
