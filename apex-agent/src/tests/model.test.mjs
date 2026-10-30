// The model path, exercised end to end against a real HTTP server — no vendor, no key, no browser.
//
// What this proves: the request the app builds is the request a provider receives (headers, model,
// system prompt, stream flag), the reply is parsed into three candidates, the trio is verified in the
// sandbox, the winner is written, and a broken provider degrades instead of dying.
// What it does not prove: that a specific vendor accepts it today (needs a live key; see PROGRESS.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chat } from '../core/providers.js';
import { createAgent } from '../core/agent.js';
import { VirtualFS, DEFAULT_FILES } from '../core/vfs.js';
import { defaultGenome } from '../core/genome.js';
import { TASKS, publicTask } from '../core/evals.js';

const SUM = TASKS.find((t) => t.id === 'sum');

const MINIMAL = `export function sum(numbers) {
  return numbers.reduce((total, n) => total + n, 0);
}
`;

const DEFENSIVE = `export function sum(numbers) {
  if (!Array.isArray(numbers)) throw new TypeError('numbers must be an array');
  return numbers.reduce((total, n) => total + (Number.isFinite(n) ? n : 0), 0);
}
`;

const STRUCTURAL = `function total(values) {
  return values.reduce((acc, n) => acc + n, 0);
}

export function sum(numbers) {
  if (!numbers.length) return 0;
  return total(numbers);
}
`;

const triadReply = () =>
  JSON.stringify({
    plan: ['فایل را بخوان', 'سه نامزد بساز', 'تست کن'],
    candidates: [
      { strategy: 'minimal', path: 'src/sum.js', content: MINIMAL, tests: null, why: 'کوچک‌ترین دیف' },
      { strategy: 'defensive', path: 'src/sum.js', content: DEFENSIVE, tests: null, why: 'ورودی بد را رد می‌کند' },
      { strategy: 'structural', path: 'src/sum.js', content: STRUCTURAL, tests: null, why: 'تابع کوچک و خوانا' },
    ],
  });

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function agentFor(port, { onEvent = () => {}, providerId = 'openai' } = {}) {
  const vfs = new VirtualFS(DEFAULT_FILES);
  const llm = {
    available: true,
    complete: (opts) =>
      chat({
        providerId,
        model: 'mock-coder',
        key: 'test-key',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        ...opts,
      }),
  };
  const agent = createAgent({ vfs, llm, genome: defaultGenome({ seed: 5 }), onEvent });
  return { vfs, agent };
}

test('the model path: one request in, three verified candidates out', async () => {
  const seen = [];
  await withServer(
    async (req, res) => {
      const body = await readBody(req);
      seen.push({ url: req.url, auth: req.headers.authorization, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'mock-1',
          choices: [{ index: 0, message: { role: 'assistant', content: triadReply() }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 240, completion_tokens: 380, total_tokens: 620 },
        }),
      );
    },
    async (port) => {
      const events = [];
      const { vfs, agent } = agentFor(port, { onEvent: (e) => events.push(e) });
      const result = await agent.run({ goal: 'یک تابع جمع با تست بنویس', task: publicTask(SUM) });

      assert.equal(result.ok, true, 'the applied winner must verify green');
      assert.equal(result.mode, 'model');
      assert.equal(result.scored.length, 3, 'three candidates must be scored');
      assert.equal(new Set(result.scored.map((s) => s.strategy)).size, 3, 'three distinct strategies');
      assert.ok(result.selection.winner, 'a winner is selected');
      assert.doesNotMatch(vfs.read('src/sum.js'), /TODO/, 'the workspace received real code');

      // The request itself is the contract: what the provider sees is what we assert here.
      assert.equal(seen.length, 1, 'one call, three candidates');
      const [call] = seen;
      assert.equal(call.url, '/v1/chat/completions');
      assert.equal(call.auth, 'Bearer test-key');
      assert.equal(call.body.model, 'mock-coder');
      assert.equal(call.body.stream, true);
      assert.ok(
        JSON.stringify(call.body.messages).includes('سه نامزد'),
        'the system prompt still asks for exactly three candidates',
      );

      // Usage from the provider reaches the agent, so the context meter is not decorative.
      assert.ok(events.some((e) => e.type === 'usage'), 'usage event is emitted');
      assert.ok(events.some((e) => e.type === 'verify'), 'verify event is emitted');
    },
  );
});

test('the stream path reassembles the reply from server-sent events', async () => {
  await withServer(
    async (req, res) => {
      await readBody(req);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const text = triadReply();
      // Split mid-codepoint-safe, at arbitrary boundaries: the parser must not care.
      for (let i = 0; i < text.length; i += 40) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 40) } }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    },
    async (port) => {
      const deltas = [];
      const { agent } = agentFor(port, { onEvent: (e) => e.type === 'delta' && deltas.push(e) });
      const result = await agent.run({ goal: 'تابع جمع', task: publicTask(SUM) });
      assert.equal(result.ok, true, 'a streamed reply verifies the same as a buffered one');
      assert.equal(result.scored.length, 3);
      assert.ok(deltas.length > 0, 'onDelta fires while the model is still talking');
    },
  );
});

test('a 401 surfaces a readable error instead of a fake green', async () => {
  await withServer(
    async (req, res) => {
      await readBody(req);
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
    },
    async (port) => {
      const events = [];
      const { agent } = agentFor(port, { onEvent: (e) => events.push(e) });
      const result = await agent.run({ goal: 'تابع جمع', task: publicTask(SUM) });
      // A rejected key must never look like a finished job: ok stays false and the reason is readable.
      assert.equal(result.ok, false, 'a 401 is not a green run');
      assert.match(result.error, /401|کلید|key/i, `unhelpful error: ${result.error}`);
      assert.ok(events.some((e) => e.type === 'error'), 'the failure is announced, not swallowed');
    },
  );
});

test('a 429 is retried once before giving up', async () => {
  let calls = 0;
  await withServer(
    async (req, res) => {
      await readBody(req);
      calls += 1;
      if (calls === 1) {
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end('{"error":{"message":"rate limited"}}');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: triadReply() } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
    },
    async (port) => {
      const { agent } = agentFor(port);
      const result = await agent.run({ goal: 'تابع جمع', task: publicTask(SUM) });
      assert.equal(calls, 2, 'exactly one retry');
      assert.equal(result.ok, true);
    },
  );
});

test('an unparseable reply falls back to the local trio instead of crashing', async () => {
  await withServer(
    async (req, res) => {
      await readBody(req);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'متأسفم، نمی‌توانم.' } }] }));
    },
    async (port) => {
      const { agent, vfs } = agentFor(port);
      const result = await agent.run({ goal: 'تابع جمع', task: publicTask(SUM) });
      assert.equal(result.ok, true, 'the local trio still proves the change');
      assert.equal(result.scored.length, 3);
      assert.doesNotMatch(vfs.read('src/sum.js'), /TODO/);
    },
  );
});
