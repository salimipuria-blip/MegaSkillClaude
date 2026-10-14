// Repeatable, offline benchmark for registry/index load and routing.
//   node scripts/bench-routing.mjs [--load-iterations=15] [--route-rounds=50] [--warmup=3] [--label=text]
// Prints one JSON document to stdout. Inputs are the bundled registry, the bundled verified
// skill files and the fixed corpus in tests/fixtures/routing-corpus.json. No network, no writes.
// `outputDigest` is a SHA-256 over every routing output: identical digests before and after a
// change prove that the routing contract (order, scores, tokens, statuses) did not move.
import crypto from 'node:crypto';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {routeSkills} from '../engine/router.mjs';
import {LIMIT, loadBundledRegistry, loadCorpus, routingSnapshot} from './routing-golden.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
}));
const LOAD_N = Number(args['load-iterations'] ?? 15);
const ROUNDS = Number(args['route-rounds'] ?? 50);
const WARMUP = Number(args.warmup ?? 3);
if (![LOAD_N, ROUNDS, WARMUP].every((n) => Number.isInteger(n) && n >= 1)) throw new Error('bad benchmark options');

const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  const pick = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {n: s.length, min: round(s[0]), p50: round(pick(50)), p95: round(pick(95)), max: round(s[s.length - 1]), mean: round(mean)};
}

const cases = loadCorpus();

// 1) Load / index build (cold-start path). Each call re-reads and re-verifies every SKILL.md.
for (let i = 0; i < WARMUP; i++) loadBundledRegistry();
const loadMs = [];
let registry = null;
for (let i = 0; i < LOAD_N; i++) {
  const t0 = performance.now();
  registry = loadBundledRegistry();
  loadMs.push(performance.now() - t0);
}

// 2) Routing per request, timed per call, grouped by language class.
const groups = {};
const callUs = {all: []};
const roundTotalsMs = [];
for (let r = 0; r < WARMUP + ROUNDS; r++) {
  let roundMs = 0;
  for (const c of cases) {
    const t0 = process.hrtime.bigint();
    routeSkills(registry, c.query, {limit: LIMIT});
    const dt = Number(process.hrtime.bigint() - t0) / 1000; // µs
    if (r < WARMUP) continue;
    roundMs += dt / 1000;
    (callUs[c.lang] ??= []).push(dt);
    callUs.all.push(dt);
  }
  if (r >= WARMUP) roundTotalsMs.push(roundMs);
}
const routing = Object.fromEntries(Object.entries(callUs).map(([k, v]) => [k, {unit: 'us', ...stats(v)}]));

// 3) Output fingerprint over the whole corpus (contract evidence, not timing).
const snapshot = routingSnapshot(registry, cases);
const outputDigest = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

// 4) Handler overhead with telemetry off vs on (same request, sink discarded, no network).
const {default: skillsHandler} = await import('../api/skills.js');
function fakeRes() {
  return {statusCode: null, headers: {}, setHeader() { return this; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; }};
}
async function handlerUs(enabled) {
  const savedEnv = process.env.PSK_TELEMETRY, savedLog = console.log;
  const savedToken = process.env.ENGINE_TOKEN;
  process.env.ENGINE_TOKEN ??= 'bench-only-token-0123456789abcdef';
  const auth = 'Bearer ' + process.env.ENGINE_TOKEN;
  if (enabled) process.env.PSK_TELEMETRY = '1'; else delete process.env.PSK_TELEMETRY;
  console.log = () => {};
  const request = {method: 'GET', headers: {authorization: auth}, query: {q: 'سه استوری برای اینستاگرام طراحی کن'}};
  const samples = [];
  try {
    for (let i = 0; i < WARMUP + ROUNDS; i++) {
      const t0 = process.hrtime.bigint();
      skillsHandler(request, fakeRes());
      const dt = Number(process.hrtime.bigint() - t0) / 1000;
      if (i >= WARMUP) samples.push(dt);
    }
  } finally {
    console.log = savedLog;
    if (savedEnv === undefined) delete process.env.PSK_TELEMETRY; else process.env.PSK_TELEMETRY = savedEnv;
    if (savedToken === undefined) delete process.env.ENGINE_TOKEN; else process.env.ENGINE_TOKEN = savedToken;
  }
  return {unit: 'us', ...stats(samples)};
}
const handlerOff = await handlerUs(false);
const handlerOn = await handlerUs(true);

const cpu = os.cpus();
const report = {
  label: args.label ?? null,
  date: new Date().toISOString(),
  node: process.version,
  platform: `${os.platform()} ${os.arch()}`,
  cpu: cpu[0]?.model ?? 'unknown',
  cores: cpu.length,
  memoryGiB: round(os.totalmem() / 2 ** 30, 1),
  method: {loadIterations: LOAD_N, routeRounds: ROUNDS, warmupRounds: WARMUP, cases: cases.length, limit: LIMIT, timer: 'performance.now / process.hrtime.bigint'},
  registry: {skills: registry.records.length, indexTerms: registry.index.size, content: registry.content},
  loadMs: stats(loadMs),
  routingPerRoundMs: stats(roundTotalsMs),
  routing,
  handlerSkillsGet: {telemetryOff: handlerOff, telemetryOn: handlerOn},
  outputDigest,
};
console.log(JSON.stringify(report, null, 2));
