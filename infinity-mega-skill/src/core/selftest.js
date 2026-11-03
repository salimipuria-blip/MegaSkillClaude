// Self-tests: the same assertions run in the browser (Settings → خودآزمایی) and in CI (node:test).
//
// This is what makes "self-healing after the smallest change" true rather than decorative: after
// any edit, 60+ assertions over the core run in under a second, and a red one blocks the change.

import { applyPatch, createPatch, diffOps, patchStats, replaceOnce, splitLines } from './diff.js';
import { atomize, compressContext, dedupeAtoms, similarity } from './compress.js';
import { estimateTokens, formatTokens, looksLikeCode, messageTokens } from './tokens.js';
import { VirtualFS } from './vfs.js';
import { crc32, makeZip } from './zip.js';
import { createMemory, DEFAULT_LAWS, memoryToMarkdown } from './memory.js';
import {
  applyProbeVerdicts,
  codebreak,
  DEFAULT_RUBRIC,
  edgeInputs,
  explainSelection,
  exportedNames,
  planTriad,
  probesFor,
  resolveWeights,
  scoreCandidate,
  selectWinner,
} from './triad.js';
import {
  defaultGenome,
  diffGenomes,
  genomePrompt,
  mutate,
  scoreFitness,
  selectGeneration,
  validateGenome,
} from './genome.js';
import { detectFamily, reflexCovers, reflexScaffold, reflexSolve, STRATEGIES } from './reflex.js';
import { runInSandbox } from './sandbox.js';
import { extractJson, parseTriadReply, executeTool } from './agent.js';
import { runSuite } from './evolution.js';
import { TASKS, publicTask, scoreRun, scoreSuite } from './evals.js';
import { buildRequest, explainHttpError, readResponse, SSEParser, readStreamEvent } from './providers.js';

const assert = (cond, message) => {
  if (!cond) throw new Error(message || 'assertion failed');
};
const eq = (a, b, message) => {
  const A = JSON.stringify(a);
  const B = JSON.stringify(b);
  if (A !== B) throw new Error(`${message || 'not equal'}\n  got:  ${A}\n  want: ${B}`);
};

const vfsWith = () => new VirtualFS({ 'a.js': 'export const a = 1;\n', 'dir/b.js': 'export const b = 2;\n' });

/** @type {Array<{id:string, group:string, name:string, fn:()=>any}>} */
export const CASES = [
  // ------------------------------------------------------------------ tokens
  {
    id: 'tok-1',
    group: 'توکن',
    name: 'برآورد توکن برای متن فارسی و لاتین مثبت و یکنواست',
    fn: () => {
      assert(estimateTokens('') === 0, 'empty must be 0');
      const a = estimateTokens('سلام');
      const b = estimateTokens('سلام دنیا');
      assert(a > 0 && b > a, 'must grow with text');
      assert(estimateTokens('hello world') < estimateTokens('سلام دنیا') * 2, 'persian is denser per char');
    },
  },
  {
    id: 'tok-2',
    group: 'توکن',
    name: 'تشخیص کد و قالب‌بندی فشرده',
    fn: () => {
      assert(looksLikeCode('```js\nconst x = 1;\n```'), 'fence is code');
      assert(!looksLikeCode('یک جملهٔ معمولی فارسی.'), 'prose is not code');
      eq(formatTokens(1234), '1.2k');
      eq(formatTokens(999), '999');
      assert(messageTokens({ role: 'user', content: 'x' }) > estimateTokens('x'), 'role overhead');
    },
  },
  // ------------------------------------------------------------------ compress
  {
    id: 'cmp-1',
    group: 'فشرده‌سازی',
    name: 'اتم‌سازی، قانون و کد را جدا می‌کند',
    fn: () => {
      const atoms = atomize('قانون: هرگز بدون تست نرو.\n\n```js\nconst x = 1;\n```\nجملهٔ سوم.', { kind: 'system' });
      assert(atoms.length >= 3, 'expected three atoms');
      assert(atoms.some((a) => a.kind === 'code'), 'code fence stays whole');
      assert(atomize('')[0] === undefined, 'empty has no atoms');
    },
  },
  {
    id: 'cmp-2',
    group: 'فشرده‌سازی',
    name: 'بودجه رعایت می‌شود و پیام‌های محافظت‌شده حذف نمی‌شوند',
    fn: () => {
      const messages = [
        { role: 'system', content: 'قانون: هرگز چیزی را بدون تست انجام نده.', protected: true },
        ...Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `پیام شمارهٔ ${i} با جزئیات `.repeat(8) })),
        { role: 'user', content: 'هدف فعلی: رفع باگ' },
      ];
      const out = compressContext({ messages, budgetTokens: 700, query: 'باگ', keepRecent: 2 });
      assert(out.stats.before > out.stats.after, 'must save tokens');
      assert(out.messages.some((m) => m.role === 'system' && m.content.includes('قانون')), 'protected message kept');
      assert(out.stats.kept <= out.stats.atoms, 'kept cannot exceed atoms');
      assert(out.messages.length >= 3, 'protected + recent survive');
    },
  },
  {
    id: 'cmp-3',
    group: 'فشرده‌سازی',
    name: 'تکرار نزدیک حذف می‌شود',
    fn: () => {
      const a = 'این یک جملهٔ طولانی دربارهٔ معماری سیستم است که تکرار می‌شود.';
      const b = 'این یک جملهٔ طولانی دربارهٔ معماری سیستم است که تکرار میشود.';
      assert(similarity(a, b) > 0.7, `similarity was ${similarity(a, b)}`);
      const atoms = [
        { text: a, kind: 'prose', order: 0, base: 1, score: 2, tokens: 10 },
        { text: b, kind: 'prose', order: 1, base: 1, score: 1, tokens: 10 },
      ];
      const { kept, dropped } = dedupeAtoms(atoms);
      eq(kept.length, 1);
      eq(dropped.length, 1);
    },
  },
  // ------------------------------------------------------------------ diff
  {
    id: 'dif-1',
    group: 'دیف',
    name: 'متن یکسان یا خالی دیف نمی‌سازد',
    fn: () => {
      eq(createPatch('a\n', 'a\n'), '');
      eq(splitLines('a\n'), ['a']);
      eq(splitLines(''), []);
    },
  },
  {
    id: 'dif-2',
    group: 'دیف',
    name: 'دیف ساخته‌شده دقیقاً روی متن اصلی اعمال می‌شود (چند هانک)',
    fn: () => {
      const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n') + '\n';
      const afterLines = before.split('\n');
      afterLines[2] = 'line 2 changed';
      afterLines[20] = 'line 20 changed';
      const after = afterLines.join('\n');
      const patch = createPatch(before, after, { path: 'x.txt' });
      assert(patch.includes('@@'), 'patch has a hunk');
      const { text, applied } = applyPatch(before, patch);
      eq(text, after, 'roundtrip');
      assert(applied >= 2, 'both hunks applied');
      assert(patchStats(patch).churn >= 4, 'churn counts both sides');
    },
  },
  {
    id: 'dif-3',
    group: 'دیف',
    name: 'دیف ناسازگار با خطای صریح رد می‌شود',
    fn: () => {
      const patch = '--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-nonexistent\n+new\n';
      let threw = false;
      try {
        applyPatch('other\n', patch);
      } catch (err) {
        threw = /mismatch/.test(err.message);
      }
      assert(threw, 'must throw a mismatch');
      eq(diffOps('a\n', 'b\n').length, 2);
      eq(replaceOnce('a-a', 'a', 'b'), null, 'ambiguous replace refused');
      eq(replaceOnce('abc', 'b', 'X'), 'aXc');
    },
  },
  // ------------------------------------------------------------------ vfs
  {
    id: 'vfs-1',
    group: 'فضای کاری',
    name: 'نوشتن، نسخه‌ها، بازگردانی و جست‌وجو',
    fn: () => {
      const vfs = vfsWith();
      const w = vfs.write('dir/c.js', 'export const c = 3;\n', 'test');
      assert(w.created && w.rev === 1, 'created at r1');
      vfs.write('dir/c.js', 'export const c = 4;\n', 'test');
      eq(vfs.revisionsOf('dir/c.js').length, 2);
      vfs.restore('dir/c.js', 1);
      assert(vfs.read('dir/c.js').includes('= 3'), 'restored r1');
      eq(vfs.search('const b = 2').length, 1);
      eq(vfs.list('dir').length, 2);
      assert(vfs.tree().dirs.has('dir'), 'tree groups directories');
    },
  },
  {
    id: 'vfs-2',
    group: 'فضای کاری',
    name: 'مسیر ناامن و فایل خالیِ اجباری رد می‌شود',
    fn: () => {
      const vfs = vfsWith();
      let threw = 0;
      try {
        vfs.write('../etc/passwd', 'x');
      } catch {
        threw += 1;
      }
      try {
        vfs.write('empty.js', '   ', '', { allowEmpty: false });
      } catch {
        threw += 1;
      }
      eq(threw, 2);
      const snap = vfs.snapshot('s');
      vfs.write('a.js', 'changed\n');
      vfs.restoreSnapshot(snap.id);
      assert(vfs.read('a.js').includes('const a = 1'), 'snapshot restore');
    },
  },
  // ------------------------------------------------------------------ zip
  {
    id: 'zip-1',
    group: 'زیپ',
    name: 'CRC32 و امضای فایل زیپ درست است',
    fn: () => {
      eq(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
      const zip = makeZip([{ path: 'a.txt', content: 'hi' }, { path: 'dir/b.txt', content: 'there' }]);
      const bytes = zip instanceof Uint8Array ? zip : null;
      if (bytes) {
        eq([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
        const end = bytes.slice(-22);
        eq([...end.slice(0, 4)], [0x50, 0x4b, 0x05, 0x06]);
        eq(new DataView(end.buffer, end.byteOffset).getUint16(10, true), 2);
      } else {
        assert(typeof zip.size === 'number' && zip.size > 60, 'blob size');
      }
    },
  },
  // ------------------------------------------------------------------ triad
  {
    id: 'tri-1',
    group: 'شورای سه‌گانه',
    name: 'وزن‌ها نرمال می‌شوند و سه استراتژی برنامه‌ریزی می‌شود',
    fn: () => {
      const w = resolveWeights({ correctness: 2, minimality: 1, safety: 1, clarity: 0, efficiency: 0 });
      eq(Math.round(Object.values(w).reduce((s, v) => s + v, 0) * 1000) / 1000, 1);
      eq(planTriad().length, 3);
      eq(planTriad().map((p) => p.id), ['A', 'B', 'C']);
    },
  },
  {
    id: 'tri-2',
    group: 'شورای سه‌گانه',
    name: 'برای هر نامزد دقیقاً سه فرضیهٔ شکست ساخته می‌شود',
    fn: () => {
      const task = TASKS.find((t) => t.id === 'sum');
      const candidate = { id: 'A', strategy: 'minimal', content: reflexSolve(task, 'minimal').content, diff: '-x\n+y\n', stats: { churn: 2 } };
      const { hypotheses } = codebreak({ task, candidate, baseline: 'export function sum(){}\n' });
      eq(hypotheses.length, 3);
      eq(hypotheses.map((h) => h.id), ['H1', 'H2', 'H3']);
      assert(edgeInputs(task).length > 0, 'edge probes exist');
      assert(probesFor(hypotheses).length >= 1, 'at least one executable probe');
    },
  },
  {
    id: 'tri-3',
    group: 'شورای سه‌گانه',
    name: 'صادرات حذف‌شده تشخیص داده می‌شود و امتیازدهی قطعی است',
    fn: () => {
      eq(exportedNames('export function a(){}\nexport const b = 1;\n').sort(), ['a', 'b']);
      const task = TASKS.find((t) => t.id === 'sum');
      const candidate = { id: 'A', strategy: 'minimal', content: 'export function other(){}\n', diff: '', stats: { churn: 3 } };
      const { hypotheses } = codebreak({ task, candidate, baseline: 'export function sum(){}\n' });
      assert(hypotheses[1].confirmed === true, 'dropped export is confirmed');
      const run = { results: [{ pass: true }, { pass: false }], ms: 3 };
      const score1 = scoreCandidate({ candidate, publicRun: run, weights: DEFAULT_RUBRIC });
      const score2 = scoreCandidate({ candidate, publicRun: run, weights: DEFAULT_RUBRIC });
      eq(score1.total, score2.total, 'deterministic');
    },
  },
  {
    id: 'tri-4',
    group: 'شورای سه‌گانه',
    name: 'انتخاب برنده قطعی و توضیح‌پذیر است',
    fn: () => {
      const mk = (id, total, churn, confirmed = 0) => ({
        id,
        strategy: id === 'A' ? 'minimal' : id === 'B' ? 'defensive' : 'structural',
        total,
        churn,
        confirmed,
        parts: { correctness: total },
      });
      const sel = selectWinner([mk('C', 0.9, 4), mk('A', 0.9, 2), mk('B', 0.5, 1)]);
      eq(sel.winner.id, 'A', 'tie broken by smaller churn');
      eq(sel.rejects.length, 2);
      assert(explainSelection(sel).length > 10, 'explanation text');
      assert(selectWinner([]).winner === null, 'empty triad is null, not a crash');
    },
  },
  {
    id: 'tri-5',
    group: 'شورای سه‌گانه',
    name: 'نتیجهٔ پروب روی فرضیه‌ها می‌نشیند',
    fn: () => {
      const hypotheses = [
        { id: 'H1', kind: 'edge', probe: [{ name: 'edge', label: 'edge' }], confirmed: false },
        { id: 'H3', kind: 'performance', probe: [{ name: 'stress', label: 'stress' }], confirmed: false },
      ];
      const run = { results: [{ name: 'edge', pass: true }, { name: 'stress', pass: false, got: 'throws' }] };
      const out = applyProbeVerdicts(hypotheses, run);
      eq(out[0].confirmed, false);
      eq(out[1].confirmed, true);
      eq(out[1].evidence.length, 1);
    },
  },
  // ------------------------------------------------------------------ genome
  {
    id: 'gen-1',
    group: 'ژنوم',
    name: 'ژنوم پیش‌فرض معتبر و کلمپ‌شده است',
    fn: () => {
      const g = defaultGenome({ seed: 7 });
      const v = validateGenome({ ...g, genes: { ...g.genes, temperature: 99, maxSteps: -3, contextBudget: 1 } });
      assert(v.genes.temperature <= 1.2, 'temperature clamped');
      assert(v.genes.maxSteps >= 2, 'steps clamped');
      assert(v.genes.contextBudget >= 4000, 'budget clamped');
      assert(genomePrompt(v).includes('سه نامزد'), 'prompt states the triad law');
    },
  },
  {
    id: 'gen-2',
    group: 'ژنوم',
    name: 'جهش دقیقاً سه نامزد متمایز و تکرارپذیر می‌سازد',
    fn: () => {
      const g = defaultGenome({ seed: 3 });
      const a = mutate(g);
      const b = mutate(g);
      eq(a.length, 3);
      eq(new Set(a.map((m) => m.operator)).size, 3, 'distinct operators');
      eq(a.map((m) => m.operator), b.map((m) => m.operator), 'deterministic');
      eq(a.map((m) => m.genome.generation), [1, 1, 1]);
      assert(diffGenomes(g, a[0].genome).length > 0, 'genes differ');
    },
  },
  {
    id: 'gen-3',
    group: 'ژنوم',
    name: 'تناسب اندام از شواهد ساخته می‌شود و انتخاب آستانه دارد',
    fn: () => {
      const good = scoreFitness({ suite: { mean: 1, solved: 10, total: 10, variance: 0 }, tokensUsed: 100, budget: 2000 });
      const bad = scoreFitness({ suite: { mean: 0.4, solved: 2, total: 10, variance: 0.04 }, tokensUsed: 1900, budget: 2000 });
      assert(good.score > bad.score + 0.2, `good ${good.score} vs bad ${bad.score}`);
      const champion = { ...defaultGenome(), fitness: { score: 0.5, parts: { regressionFree: true } } };
      const reject = selectGeneration({
        champion,
        challengers: [{ mutant: { id: 'm', operator: 'tighten', label: 'x', genome: defaultGenome() }, fitness: { score: 0.503, parts: { regressionFree: true }, suite: {} } }],
      });
      eq(reject.accepted, false, 'epsilon blocks noise');
      const accept = selectGeneration({
        champion,
        challengers: [{ mutant: { id: 'm', operator: 'tighten', label: 'x', genome: defaultGenome() }, fitness: { score: 0.62, parts: { regressionFree: true }, suite: { solved: 9, total: 10 } } }],
      });
      eq(accept.accepted, true);
      eq(accept.champion.fitness.score, 0.62);
    },
  },
  // ------------------------------------------------------------------ reflex + sandbox
  {
    id: 'rex-1',
    group: 'موتور بدون کلید',
    name: 'خانوادهٔ تسک از متن تشخیص داده می‌شود',
    fn: () => {
      eq(detectFamily('یک تابع برای جمع اعداد بنویس')?.id, 'sum');
      eq(detectFamily('پالیندروم را چک کن')?.id, 'palindrome');
      eq(detectFamily('یک ربات تلگرام بساز'), null);
      eq(reflexCovers('تابع groupBy بساز'), true);
      assert(reflexScaffold('چیزی نامعلوم').content.includes('not implemented'), 'scaffold is honest');
    },
  },
  {
    id: 'rex-2',
    group: 'موتور بدون کلید',
    name: 'هر سه نسخهٔ Reflex در سندباکس تست‌های عمومی و پنهان را پاس می‌کنند',
    async fn() {
      const task = TASKS.find((t) => t.id === 'palindrome');
      for (const s of STRATEGIES) {
        const solved = reflexSolve(task, s.key);
        const run = await runInSandbox({ entry: solved.content, cases: [...task.cases, ...task.hidden], entries: task.entry });
        assert(run.results.every((r) => r.pass), `${s.key}: ${JSON.stringify(run.results.filter((r) => !r.pass))}`);
      }
    },
  },
  {
    id: 'rex-3',
    group: 'موتور بدون کلید',
    name: 'سندباکس حلقهٔ بی‌پایان را می‌کشد و شبکه را می‌بندد',
    async fn() {
      const loop = await runInSandbox({ entry: 'export function spin(){ while(true){} }', cases: [{ name: 'spin', fn: 'spin', args: [], expect: 1 }], entries: ['spin'], timeoutMs: 250 });
      assert(!loop.ok, 'infinite loop must fail or time out');
      const net = await runInSandbox({
        entry: 'export async function ping(){ try { await fetch("https://example.com"); return "open"; } catch (e) { return "blocked"; } }',
        cases: [{ name: 'net', fn: 'ping', args: [], expect: 'blocked' }],
        entries: ['ping'],
      });
      assert(net.results[0]?.pass, `network was not blocked: ${JSON.stringify(net.results)}`);
    },
  },
  // ------------------------------------------------------------------ agent
  {
    id: 'agt-1',
    group: 'ایجنت',
    name: 'JSON مدل از متن و بلوک کد استخراج می‌شود',
    fn: () => {
      const json = extractJson('متن\n```json\n{"a":1}\n```');
      eq(json, { a: 1 });
      eq(extractJson('{"b":2}')?.b, 2);
      eq(extractJson('nothing here'), null);
      const parsed = parseTriadReply('{"candidates":[{"strategy":"minimal","path":"src/x.js","content":"export const x=1;"}]}');
      eq(parsed.candidates.length, 1);
      eq(parsed.candidates[0].strategy, 'minimal');
      const fenced = parseTriadReply('```js\n// path: src/a.js\nexport const a=1;\n```\n```js\nexport const b=2;\n```\n```js\nexport const c=3;\n```');
      eq(fenced.candidates.length, 3);
      eq(fenced.candidates[0].path, 'src/a.js');
    },
  },
  {
    id: 'agt-2',
    group: 'ایجنت',
    name: 'ابزارها روی فضای کاری کار می‌کنند و خطا را می‌بلعند نه پنهان',
    async fn() {
      const vfs = vfsWith();
      const ctx = { vfs };
      const read = await executeTool('read_file', { path: 'a.js' }, ctx);
      assert(read.ok && read.raw.includes('const a'), 'read');
      const patch = createPatch(vfs.read('a.js'), 'export const a = 42;\n', { path: 'a.js' });
      const applied = await executeTool('apply_patch', { path: 'a.js', patch }, ctx);
      assert(applied.ok, applied.text);
      assert(vfs.read('a.js').includes('42'), 'patch applied');
      const missing = await executeTool('read_file', { path: 'nope.js' }, ctx);
      eq(missing.ok, false);
      const unknown = await executeTool('nope', {}, ctx);
      eq(unknown.ok, false);
    },
  },
  {
    id: 'agt-3',
    group: 'ایجنت',
    name: 'چرخهٔ کامل Reflex روی یک تسک واقعی سبز می‌شود',
    async fn() {
      const vfs = new VirtualFS({ 'src/sum.js': 'export function sum() {}\n' });
      const { createAgent } = await import('./agent.js');
      const agent = createAgent({ vfs, genome: defaultGenome(), memory: createMemory() });
      const task = publicTask(TASKS.find((t) => t.id === 'sum'));
      const result = await agent.run({ goal: 'تابع جمع اعداد را کامل کن', task });
      assert(result.ok, `run failed: ${JSON.stringify(result.selection?.reason)}`);
      assert(vfs.read('src/sum.js').includes('reduce'), 'winner written');
      assert(result.selection.winner.total > 0.5, 'winner scored');
      assert(result.reflect.tokensIn === 0, 'no model tokens in reflex mode');
    },
  },
  // ------------------------------------------------------------------ evolution
  {
    id: 'evo-1',
    group: 'تکامل',
    name: 'بنچمارک دو تسک را واقعاً اجرا و امتیازدهی می‌کند',
    async fn() {
      const run = await runSuite({ genome: defaultGenome(), tasks: TASKS.slice(0, 2) });
      eq(run.suite.total, 2);
      eq(run.suite.solved, 2, `not solved: ${JSON.stringify(run.results)}`);
      assert(run.tokensUsed > 0, 'token accounting');
    },
  },
  // ------------------------------------------------------------------ memory
  {
    id: 'mem-1',
    group: 'حافظه',
    name: 'قوانین قفل‌اند، یادداشت تکراری ثبت نمی‌شود و جست‌وجو کار می‌کند',
    fn: () => {
      const m = createMemory();
      eq(m.laws.length, DEFAULT_LAWS.length);
      const first = m.remember('یادداشت تست', 'note');
      const again = m.remember('یادداشت تست', 'note');
      eq(first.id, again.id, 'deduplicated');
      m.journalEntry({ goal: 'x', ok: true, score: 0.9 });
      eq(m.journal.length, 1);
      eq(m.search('تست').notes.length, 1);
      const md = memoryToMarkdown(m);
      assert(md.includes('## قوانین') && md.includes('## دفتر جریان'), 'markdown sections');
    },
  },
  // ------------------------------------------------------------------ providers
  {
    id: 'prv-1',
    group: 'ارائه‌دهنده‌ها',
    name: 'درخواست هر سه پروتکل درست ساخته می‌شود و کلید در بدنه نیست',
    fn: () => {
      const openai = buildRequest({ providerId: 'openrouter', model: 'x', key: 'sk-test', messages: [{ role: 'user', content: 'hi' }] });
      eq(openai.headers.authorization, 'Bearer sk-test');
      assert(!JSON.stringify(openai.body).includes('sk-test'), 'key never in body');
      eq(openai.body.model, 'x');
      const anthropic = buildRequest({ providerId: 'anthropic', model: 'claude', key: 'k', messages: [{ role: 'user', content: 'hi' }], system: 's' });
      eq(anthropic.body.system, 's');
      eq(anthropic.headers['anthropic-dangerous-direct-browser-access'], 'true');
      const gemini = buildRequest({ providerId: 'gemini', model: 'gemini-2.5-flash', key: 'g', messages: [{ role: 'user', content: 'hi' }] });
      assert(gemini.url.includes('key=g') && gemini.url.includes('gemini-2.5-flash'), 'gemini url');
      eq(gemini.body.contents[0].parts[0].text, 'hi');
      const custom = buildRequest({ providerId: 'custom', baseUrl: 'https://x.dev/v1', model: 'm', messages: [] });
      eq(custom.url, 'https://x.dev/v1/chat/completions');
    },
  },
  {
    id: 'prv-2',
    group: 'ارائه‌دهنده‌ها',
    name: 'پاسخ هر پروتکل و SSE تکه‌تکه درست خوانده می‌شود',
    fn: () => {
      eq(readResponse('openai', { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }).usage.out, 3);
      eq(readResponse('anthropic', { content: [{ type: 'text', text: 'ok' }] }).text, 'ok');
      eq(readResponse('gemini', { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }).text, 'ok');
      const parser = new SSEParser();
      const events = [...parser.push('data: {"choices":[{"delta":{"cont'), ...parser.push('ent":"hi"}}]}\n\n')];
      eq(events.length, 1);
      eq(readStreamEvent('openai', events[0]).text, 'hi');
      eq(readStreamEvent('openai', { data: '[DONE]' }).type, 'done');
      assert(explainHttpError(429).includes('429'), 'http error text');
    },
  },
  {
    id: 'prv-3',
    group: 'ارائه‌دهنده‌ها',
    name: 'امتیاز تسک از تست‌های عمومی و پنهان ساخته می‌شود',
    fn: () => {
      const perfect = scoreRun({
        publicResults: [{ pass: true }, { pass: true }],
        hiddenResults: [{ pass: true }],
      });
      eq(perfect.solved, true);
      eq(perfect.score, 1);
      const partial = scoreRun({ publicResults: [{ pass: true }, { pass: false }], hiddenResults: [{ pass: false }] });
      assert(partial.score < 0.6 && partial.score > 0, `partial score ${partial.score}`);
      const suite = scoreSuite([perfect, partial]);
      eq(suite.total, 2);
      eq(suite.solved, 1);
    },
  },
];

/** Run every case (or a filtered subset) with timing. Never throws. */
export async function runSelfTests({ filter = '', signal } = {}) {
  const started = Date.now();
  const results = [];
  const selected = CASES.filter((c) => !filter || c.group.includes(filter) || c.name.includes(filter) || c.id.includes(filter));
  for (const testCase of selected) {
    if (signal?.aborted) break;
    const t0 = Date.now();
    try {
      // eslint-disable-next-line no-await-in-loop
      await testCase.fn();
      results.push({ id: testCase.id, group: testCase.group, name: testCase.name, ok: true, ms: Date.now() - t0 });
    } catch (err) {
      results.push({ id: testCase.id, group: testCase.group, name: testCase.name, ok: false, ms: Date.now() - t0, error: err?.message || String(err) });
    }
  }
  const passed = results.filter((r) => r.ok).length;
  return {
    results,
    passed,
    failed: results.length - passed,
    total: results.length,
    ms: Date.now() - started,
    ok: passed === results.length,
  };
}
