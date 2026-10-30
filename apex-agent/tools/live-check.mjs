#!/usr/bin/env node
// The live check: does the *real* model path work end to end?
//
// Everything else in this repo is offline on purpose. This script is the one place that talks to a
// real provider, and it is the only honest way to turn "NOT RUN — no key" into a measured result.
//
//   APEX_BASE_URL=https://openrouter.ai/api/v1 APEX_MODEL=deepseek/deepseek-v3.2 APEX_KEY=... \
//     npm run live
//
//   npm run live -- --provider openai --model gpt-5.2 --key-file ~/.apex-key
//   npm run live -- --provider ollama --model qwen3:8b --base-url http://127.0.0.1:11434/v1
//   npm run live -- --mock        # proves the harness itself, no network, no key
//
// Exit codes: 0 = the model produced a verified patch, 1 = the model ran but verification failed,
// 2 = nothing was run because there are no credentials (this is a real, reportable outcome).
import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const redact = (value) => {
  const s = String(value || '');
  if (!s) return '';
  return s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-4)}`;
};
const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url || '(none)';
  }
};

function keyFromFile(file) {
  if (!file) return '';
  const full = file.startsWith('~') ? path.join(os.homedir(), file.slice(1)) : path.resolve(ROOT, file);
  if (!existsSync(full)) return '';
  return readFileSync(full, 'utf8').trim().split(/\r?\n/)[0].trim();
}

function resolveCredentials() {
  const providerId = arg('provider', process.env.APEX_PROVIDER || 'custom');
  const baseUrl = arg('base-url', process.env.APEX_BASE_URL || '');
  const model = arg('model', process.env.APEX_MODEL || '');
  const key =
    arg('key', '') ||
    process.env.APEX_KEY ||
    keyFromFile(arg('key-file', '.apex-key')) ||
    keyFromFile('.apex-key');
  return { providerId, baseUrl, model, key };
}

const goal = arg(
  'goal',
  'تابع palindrome را کامل کن: فاصله، بزرگ/کوچکی حروف و اعداد فارسی را نادیده بگیر و تست‌ها را سبز کن.',
);

/** A local, OpenAI-compatible server used only by --mock: real HTTP, real SSE, no network. */
async function startMock() {
  const { TASKS } = await import('../src/core/evals.js');
  const { reflexSolve } = await import('../src/core/reflex.js');
  const { STRATEGIES } = await import('../src/core/reflex.js');
  const task = TASKS.find((t) => t.id === 'palindrome') || TASKS[0];
  const reply = {
    plan: ['خواندن تست‌ها', 'سه نامزد', 'اجرا در سندباکس'],
    candidates: STRATEGIES.map((s) => {
      const solved = reflexSolve(task, s.key);
      return { strategy: s.key, path: solved.path, content: solved.content, tests: null, why: solved.note };
    }),
  };
  const server = createServer((req, res) => {
    if (!/\/chat\/completions$/.test(req.url || '')) {
      res.writeHead(404).end('not found');
      return;
    }
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      const wantsStream = (() => {
        try {
          return JSON.parse(body).stream !== false;
        } catch {
          return true;
        }
      })();
      if (!wantsStream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: JSON.stringify(reply) } }],
            usage: { prompt_tokens: 120, completion_tokens: 420 },
          }),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      // Stream it in the shape real providers use, one delta per chunk.
      const text = JSON.stringify(reply);
      for (let i = 0; i < text.length; i += 240) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 240) } }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ choices: [{ finish_reason: 'stop' }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'mock-triad' };
}

async function main() {
  const { VirtualFS } = await import('../src/core/vfs.js');
  const { createAgent } = await import('../src/core/agent.js');
  const { defaultGenome } = await import('../src/core/genome.js');
  const { TASKS, publicTask } = await import('../src/core/evals.js');
  const { taskForPrompt } = await import('../src/core/reflex.js');
  const { chat } = await import('../src/core/providers.js');
  const { runInSandbox } = await import('../src/core/sandbox.js');

  const mock = has('mock');
  let creds = resolveCredentials();
  let mockServer = null;
  let mode = 'live';

  if (mock) {
    const started = await startMock();
    mockServer = started.server;
    creds = { providerId: 'custom', baseUrl: started.baseUrl, model: started.model, key: 'mock-key' };
    mode = 'mock';
  } else if (!creds.key && creds.providerId !== 'ollama') {
    const report = {
      mode: 'not-run',
      at: new Date().toISOString(),
      reason: 'no credentials: set APEX_KEY (or --key-file), APEX_BASE_URL and APEX_MODEL',
      provider: creds.providerId,
      baseUrlHost: hostOf(creds.baseUrl),
      model: creds.model || null,
    };
    mkdirSync(path.join(ROOT, 'release'), { recursive: true });
    writeFileSync(path.join(ROOT, 'release/live-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log('NOT RUN — no credentials.');
    console.log('  needed: APEX_BASE_URL, APEX_MODEL and APEX_KEY (env, --key-file, or .apex-key)');
    console.log('  proof that the harness itself works: npm run live -- --mock');
    process.exitCode = 2;
    return;
  }

  const task = taskForPrompt(goal, TASKS);
  const seed = task ? task.files : {};
  const vfs = new VirtualFS(seed);
  const events = [];
  const t0 = Date.now();

  const llm = {
    available: true,
    complete: (opts) =>
      chat({
        providerId: creds.providerId,
        model: creds.model,
        key: creds.key,
        baseUrl: creds.baseUrl,
        ...opts,
      }),
  };

  const agent = createAgent({
    vfs,
    genome: defaultGenome(),
    llm,
    sandbox: runInSandbox,
    onEvent: (event) => {
      events.push({ at: Date.now() - t0, ...event });
      const label =
        event.type === 'verify'
          ? `verify ${event.pass}/${event.total} ${event.ok ? '✓' : '✗'}`
          : event.type === 'generate'
            ? `candidate ${event.candidate?.id} ${event.candidate?.strategy}`
            : event.type === 'phase'
              ? `phase ${event.phase}`
              : event.type;
      console.log(`  +${String(Date.now() - t0).padStart(5)}ms  ${label}`);
    },
  });

  let result = null;
  let error = null;
  try {
    result = await agent.run({ goal, task: task ? publicTask(task) : null });
  } catch (err) {
    error = String(err?.message || err);
  }
  const elapsedMs = Date.now() - t0;

  const report = {
    mode,
    at: new Date().toISOString(),
    goal,
    task: task ? { id: task.id, title: task.title } : null,
    provider: creds.providerId,
    baseUrlHost: hostOf(creds.baseUrl),
    model: creds.model,
    key: redact(creds.key),
    ok: Boolean(result?.ok),
    mode_used: result?.mode || null,
    winner: result?.selection?.winner
      ? {
          id: result.selection.winner.id,
          strategy: result.selection.winner.strategy,
          score: result.selection.winner.total,
          path: result.selection.winner.candidate?.path,
        }
      : null,
    verification: result?.applied?.verification
      ? {
          ok: Boolean(result.applied.verification.ok),
          pass: (result.applied.verification.results || []).filter((r) => r.pass).length,
          total: (result.applied.verification.results || []).length,
          runtime: result.applied.verification.runtime || null,
        }
      : null,
    tokens: { in: agent.state.tokensIn, out: agent.state.tokensOut },
    files: vfs.list().map((f) => f.path),
    elapsedMs,
    error,
    events: events.map((e) => ({ at: e.at, type: e.type, phase: e.phase, ok: e.ok, text: e.text })).slice(-40),
  };

  mkdirSync(path.join(ROOT, 'release'), { recursive: true });
  writeFileSync(path.join(ROOT, 'release/live-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (mockServer) mockServer.close();

  console.log('');
  console.log(`mode: ${mode}${mode === 'mock' ? ' (harness self-check — not a real provider)' : ''}`);
  console.log(`provider: ${creds.providerId} · ${hostOf(creds.baseUrl)} · ${creds.model} · key ${redact(creds.key) || '(none)'}`);
  if (result?.selection?.winner) {
    console.log(`winner: ${result.selection.winner.id} (${result.selection.winner.strategy}) score ${result.selection.winner.total}`);
  }
  if (report.verification) {
    console.log(`verify: ${report.verification.pass}/${report.verification.total} ${report.verification.ok ? 'green' : 'red'}`);
  }
  console.log(`tokens: in ${report.tokens.in} · out ${report.tokens.out} · ${elapsedMs} ms`);
  console.log(`report: release/live-report.json`);
  if (error) console.error(`error: ${error}`);
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(`live check crashed: ${err?.stack || err}`);
  process.exit(2);
});
