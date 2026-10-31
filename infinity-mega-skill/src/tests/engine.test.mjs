// The engine: the agent loop, its tools, the sandbox it runs code in, and the memory it writes to.
// Everything here runs the real code — no mocks of the modules under test, only of the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent, executeTool, TOOL_SPECS, extractJson } from '../core/agent.js';
import { runInSandbox, stripModuleSyntax, bundleFiles } from '../core/sandbox.js';
import { VirtualFS } from '../core/vfs.js';
import { createMemory, memoryToMarkdown, DEFAULT_LAWS } from '../core/memory.js';
import { TASKS } from '../core/evals.js';
import { defaultGenome } from '../core/genome.js';

const genome = defaultGenome({ seed: 3 });
const vfsWith = (files = {}) => new VirtualFS(files);

test('tools do what they say, and refuse what they cannot do', async () => {
  const vfs = vfsWith();
  const ctx = { vfs, sandbox: runInSandbox, memory: createMemory() };

  const SOURCE = 'export const sum = (a, b) => a + b;\n';
  const wrote = await executeTool('write_file', { path: 'src/sum.js', content: SOURCE }, ctx);
  assert.equal(wrote.ok, true, wrote.text);
  assert.equal(vfs.read('src/sum.js'), SOURCE);

  const read = await executeTool('read_file', { path: 'src/sum.js' }, ctx);
  assert.equal(read.ok, true);
  assert.match(read.text, /export const sum/);

  const missing = await executeTool('read_file', { path: 'src/nope.js' }, ctx);
  assert.equal(missing.ok, false, 'reading a file that is not there must fail loudly');
  assert.match(missing.text, /no such file/);

  const patched = await executeTool(
    'apply_patch',
    {
      path: 'src/sum.js',
      patch: '--- a/src/sum.js\n+++ b/src/sum.js\n@@ -1 +1,2 @@\n export const sum = (a, b) => a + b;\n+export const mul = (a, b) => a * b;\n',
    },
    ctx,
  );
  assert.equal(patched.ok, true, patched.text);
  assert.match(vfs.read('src/sum.js'), /export const mul/);

  const patchMissing = await executeTool('apply_patch', { path: 'src/ghost.js', patch: 'x' }, ctx);
  assert.equal(patchMissing.ok, false, 'patching a missing file must say so, not crash');
  assert.match(patchMissing.text, /no such file|hunks/i);

  const unknown = await executeTool('teleport', {}, ctx);
  assert.equal(unknown.ok, false);
  assert.match(unknown.text, /unknown tool/);

  const finished = await executeTool('finish', { summary: 'تمام' }, ctx);
  assert.equal(finished.finish, true);

  // The model supplies these paths. None may leave the workspace or reach the zip with a leading
  // slash, which extractors can honour outside the target folder.
  for (const path of ['../../etc/passwd', '/etc/passwd', 'a/../../b.js', '..\\win.js', 'C:/x.js']) {
    const res = await executeTool('write_file', { path, content: 'x' }, ctx);
    assert.equal(res.ok, false, `unsafe path was accepted: ${path} -> ${res.text}`);
    assert.match(res.text, /نسبی|traversal|empty/i, `unclear refusal for ${path}: ${res.text}`);
  }
  for (const file of vfs.list()) {
    assert.ok(!file.path.includes('..'), `traversal survived: ${file.path}`);
    assert.ok(!file.path.startsWith('/') && !/^[a-zA-Z]:/.test(file.path), `absolute path survived: ${file.path}`);
  }
});

test('the sandbox runs code, reports failures, and kills a spinner', async () => {
  const good = await runInSandbox({
    files: {},
    entry: 'export function sum(n){ return n.reduce((a,b)=>a+b, 0); }',
    cases: [
      { name: 'adds', fn: 'sum', args: [[1, 2, 3]], expect: 6 },
      { name: 'empty', fn: 'sum', args: [[]], expect: 0 },
    ],
    entries: ['sum'],
    timeoutMs: 2000,
  });
  assert.equal(good.ok, true, JSON.stringify(good).slice(0, 200));
  assert.equal(good.results.length, 2);
  assert.ok(good.results.every((r) => r.pass));

  const wrong = await runInSandbox({
    entry: 'export function sum(n){ return n.length; }',
    cases: [{ name: 'adds', fn: 'sum', args: [[1, 2, 3]], expect: 6 }],
    entries: ['sum'],
    timeoutMs: 2000,
  });
  assert.equal(wrong.ok, false, 'a wrong answer must never be reported as green');
  assert.equal(wrong.results[0].pass, false);

  const broken = await runInSandbox({ entry: 'export function sum( { ', cases: [], entries: ['sum'], timeoutMs: 1000 });
  assert.equal(broken.ok, false);
  assert.match(String(broken.error), /SyntaxError/i, 'a syntax error is explained');

  const started = Date.now();
  const spinner = await runInSandbox({
    entry: 'export function sum(){ while (true) {} }',
    cases: [{ name: 'hangs', fn: 'sum', args: [], expect: 1 }],
    entries: ['sum'],
    timeoutMs: 200,
  });
  const spent = Date.now() - started;
  assert.equal(spinner.ok, false, 'an infinite loop must fail');
  assert.ok(spent < 5000, `the spinner was not killed in time (${spent} ms)`);

  // Module syntax is stripped before the code is run as a plain script.
  assert.doesNotMatch(stripModuleSyntax('import x from "y";\nexport const a = 1;'), /^\s*(import|export)\b/m);
  const bundled = bundleFiles({ 'a.js': 'export const a = 1;', 'b.js': 'export const b = a + 1;' });
  assert.match(bundled, /const a = 1/);
});

test('the offline brain only claims success when the tests are green', async () => {
  const task = TASKS.find((t) => t.id === 'sum');
  const vfs = vfsWith();
  const memory = createMemory();
  const events = [];
  const agent = createAgent({ vfs, genome, memory, onEvent: (e) => events.push(e.type) });
  const result = await agent.run({ goal: 'یک تابع جمع بنویس که تست داشته باشد', task });

  assert.equal(result.ok, true, result.selection?.reason || 'reflex run failed');
  assert.equal(result.mode, 'reflex');
  assert.ok(events.includes('start') && events.includes('done'), 'the loop announces start and done');
  assert.equal(result.reflect.ok, true);
  assert.ok(result.reflect.elapsed >= 0);
  assert.equal(memory.journal.length, 1, 'the run is journaled');
  assert.ok(vfs.list().length >= 1, 'a file was actually written');

  // No family match: the honest answer is a scaffold and a false result, never a fake green.
  const vague = await createAgent({ vfs: vfsWith(), genome }).run({ goal: 'یک نقاشی بکش' });
  assert.equal(vague.ok, false, 'an impossible goal must not be reported as done');
  assert.ok(vague.scaffold || vague.reason, 'the failure explains itself');
});

test('a model that fails its own tests never ends the run with a success', async () => {
  const badTriad = JSON.stringify({
    plan: ['بنویس'],
    candidates: [
      { strategy: 'minimal', path: 'src/sum.js', content: 'export const sum = () => 0;', tests: null, why: 'غلط' },
      { strategy: 'defensive', path: 'src/sum.js', content: 'export const sum = () => 1;', tests: null, why: 'غلط' },
      { strategy: 'structural', path: 'src/sum.js', content: 'export const sum = () => 2;', tests: null, why: 'غلط' },
    ],
  });
  let calls = 0;
  const llm = {
    available: true,
    async complete() {
      calls += 1;
      return { text: badTriad, usage: { in: 10, out: 5 }, toolCalls: [] };
    },
  };
  const vfs = vfsWith();
  const agent = createAgent({ vfs, llm, genome, sandbox: runInSandbox });
  const task = TASKS.find((t) => t.id === 'sum');
  const result = await agent.run({ goal: 'جمع', task });

  assert.equal(result.ok, false, 'three wrong candidates must not be green');
  assert.ok(calls >= 1);
  assert.ok(calls <= 1 + genome.genes.retryOnFail, `repairs are bounded (calls=${calls})`);
  assert.match(result.selection?.reason || '', /./, 'the rejection explains itself');
});

test('a good model answer is applied, verified and reported', async () => {
  const goodTriad = JSON.stringify({
    plan: ['جمع'],
    candidates: [
      { strategy: 'minimal', path: 'src/sum.js', content: 'export function sum(n){ return n.reduce((a,b)=>a+b,0); }', tests: null, why: 'ساده' },
      { strategy: 'defensive', path: 'src/sum.js', content: 'export function sum(n){ let t=0; for (const x of n) t+=x; return t; }', tests: null, why: 'حلقه' },
      { strategy: 'structural', path: 'src/sum.js', content: 'export function sum(n){ return n.length ? n[0] + sum(n.slice(1)) : 0; }', tests: null, why: 'بازگشتی' },
    ],
  });
  const llm = { available: true, async complete() { return { text: goodTriad, usage: { in: 20, out: 10 }, toolCalls: [] }; } };
  const vfs = vfsWith();
  const agent = createAgent({ vfs, llm, genome, sandbox: runInSandbox });
  const task = TASKS.find((t) => t.id === 'sum');
  const result = await agent.run({ goal: 'جمع', task });

  assert.equal(result.ok, true, result.selection?.reason || 'good triad rejected');
  assert.equal(result.mode, 'model');
  assert.match(vfs.read('src/sum.js'), /sum/);
  assert.ok(result.applied?.verification?.ok, 'the applied code was verified');
  assert.ok(result.reflect.tokensIn >= 20, 'token usage is tracked, not guessed');
});

test('the tool loop writes a file through a tool call and stops on finish', async () => {
  const script = [
    { text: '', toolCalls: [{ id: '1', name: 'write_file', args: { path: 'src/a.js', content: 'export const a = 1;\n' } }] },
    { text: '', toolCalls: [{ id: '2', name: 'finish', args: { summary: 'نوشتم' } }] },
  ];
  let i = 0;
  const llm = {
    available: true,
    async complete() {
      const reply = script[Math.min(i, script.length - 1)];
      i += 1;
      return { ...reply, usage: { in: 1, out: 1 } };
    },
  };
  const vfs = vfsWith();
  const agent = createAgent({ vfs, llm, genome, sandbox: runInSandbox });
  const out = await agent.toolLoop({ goal: 'فایل بساز', maxSteps: 4 });
  assert.equal(out.ok, true, out.text);
  assert.equal(vfs.read('src/a.js'), 'export const a = 1;\n');
  assert.ok(i <= 4, 'the loop respected its step ceiling');

  // A model that only ever calls tools must be stopped by the ceiling.
  let stuck = 0;
  const looping = {
    available: true,
    async complete() {
      stuck += 1;
      return { text: '', toolCalls: [{ id: 'x', name: 'list_files', args: {} }], usage: { in: 1, out: 1 } };
    },
  };
  const capped = await createAgent({ vfs, llm: looping, genome }).toolLoop({ goal: 'لوپ', maxSteps: 3 });
  assert.equal(capped.ok, false);
  assert.match(capped.text, /سقف/);
  assert.ok(stuck <= 3, `maxSteps was not enforced (${stuck} calls)`);
});

test('memory keeps laws, dedupes notes and stays bounded', () => {
  const memory = createMemory();
  assert.equal(memory.laws.length, DEFAULT_LAWS.length);

  const first = memory.remember('تست قبل از ادعا');
  const again = memory.remember('تست قبل از ادعا');
  assert.equal(first.id, again.id, 'the same note is stored once');
  assert.equal(memory.notes.length, 1);

  assert.equal(memory.remember('   '), null, 'empty notes are refused');

  for (let i = 0; i < 600; i += 1) memory.remember(`یادداشت ${i}`);
  assert.equal(memory.notes.length, 500, 'notes are capped at 500');

  for (let i = 0; i < 400; i += 1) memory.journalEntry({ ok: true, goal: `g${i}` });
  assert.equal(memory.journal.length, 300, 'the journal is capped at 300');

  const law = memory.addLaw('هیچ کلیدی در خروجی نیست');
  assert.ok(law.id.startsWith('law-'));
  assert.ok(memory.search('کلید').laws.some((l) => l.text.includes('کلیدی')), 'search finds the law');

  const md = memoryToMarkdown(memory);
  assert.match(md, /هیچ کلیدی در خروجی نیست/, 'the markdown export carries the laws');

  const clone = createMemory();
  clone.import(memory.export());
  assert.deepEqual(clone.export().laws.map((l) => l.text), memory.export().laws.map((l) => l.text));
  assert.equal(clone.import(null), false, 'importing junk is refused, not thrown');

  const removed = memory.notes[0].id;
  assert.equal(memory.removeNote(removed), true);
  assert.equal(memory.removeNote('nope'), false);
});

test('extractJson survives fences, prose and garbage', () => {
  const payload = { plan: ['a'], candidates: [] };
  assert.deepEqual(extractJson(JSON.stringify(payload)), payload);
  assert.deepEqual(extractJson('```json\n' + JSON.stringify(payload) + '\n```'), payload);
  assert.deepEqual(extractJson('خب، این هم خروجی:\n' + JSON.stringify(payload) + '\nتمام.'), payload);
  assert.equal(extractJson('هیچ JSONی نیست'), null);
  assert.equal(extractJson(''), null);
  assert.equal(extractJson('{"plan": [}'), null, 'broken JSON is null, not a crash');
  assert.ok(TOOL_SPECS.length >= 8);
  assert.equal(new Set(TOOL_SPECS.map((t) => t.name)).size, TOOL_SPECS.length, 'tool names are unique');
});
