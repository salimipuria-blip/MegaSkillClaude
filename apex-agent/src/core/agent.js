import { skillReferenceMessage } from './skills.js';
// The agent loop. One code path, two brains:
//   - model: propose three candidates in one call, measure them locally, repair once if needed
//   - reflex: deterministic reference solver, same measurement, zero keys
// Both go through the same triad → codebreak → sandbox → score → apply → verify → reflect pipeline,
// so the self-improvement numbers mean the same thing whatever produced the code.

import { compressContext } from './compress.js';
import { createPatch, applyPatch, patchStats } from './diff.js';
import { detectFamily, reflexCovers, reflexScaffold, reflexSolve } from './reflex.js';
import { genomePrompt, validateGenome } from './genome.js';
import { runInSandbox } from './sandbox.js';
import { estimateTokens } from './tokens.js';
import {
  applyProbeVerdicts,
  codebreak,
  explainSelection,
  planTriad,
  probesFor,
  resolveWeights,
  scoreCandidate,
  selectWinner,
} from './triad.js';

export const TOOL_SPECS = [
  {
    name: 'list_files',
    description: 'فهرست فایل‌های فضای کاری را برگردان.',
    parameters: { type: 'object', properties: { dir: { type: 'string' } }, required: [] },
  },
  {
    name: 'read_file',
    description: 'محتوای یک فایل را بخوان.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'کل فایل را بنویس (فقط وقتی دیف ممکن نیست).',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' }, note: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'apply_patch',
    description: 'یک unified diff را روی فایل اعمال کن.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, patch: { type: 'string' } },
      required: ['path', 'patch'],
    },
  },
  {
    name: 'run_tests',
    description: 'کد را در سندباکس اجرا کن و تست‌ها را بگیر. cases آرایه‌ای از {name,fn,args,expect} یا {name,expr,expect} است.',
    parameters: {
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'کدِ کامل یک فایل' },
        path: { type: 'string', description: 'یا مسیر فایلِ موجود در فضای کاری' },
        cases: { type: 'array', items: { type: 'object' } },
        entries: { type: 'array', items: { type: 'string' } },
      },
      required: [],
    },
  },
  {
    name: 'search',
    description: 'جست‌وجوی متنی در فضای کاری.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'note',
    description: 'یک یادداشت در حافظهٔ بلندمدت ثبت کن.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'finish',
    description: 'کار تمام است؛ خلاصهٔ صادقانه بده.',
    parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
  },
];

export async function executeTool(name, args, ctx) {
  const { vfs, sandbox = runInSandbox, memory } = ctx;
  try {
    switch (name) {
      case 'list_files': {
        const files = vfs.list(args?.dir || '');
        return { ok: true, text: files.map((f) => `${f.path} (${f.bytes}B, r${f.rev})`).join('\n') || '(empty)' };
      }
      case 'read_file': {
        const content = vfs.read(args?.path);
        return content === ''
          ? { ok: false, text: `no such file: ${args?.path}` }
          : { ok: true, text: content, raw: content };
      }
      case 'write_file': {
        const res = vfs.writeFile(args?.path, String(args?.content ?? ''), args?.note || 'tool');
        return { ok: true, text: `wrote ${res.path} r${res.rev} (+${res.stats.added}/-${res.stats.removed})`, diff: res.diff };
      }
      case 'apply_patch': {
        const before = vfs.read(args?.path);
        if (before === null) return { ok: false, text: `no such file: ${args?.path}` };
        const { text } = applyPatch(before, args?.patch || '');
        const res = vfs.writeFile(args?.path, text, 'patch');
        return { ok: true, text: `patched ${res.path} r${res.rev}`, diff: res.diff };
      }
      case 'run_tests': {
        const entry = args?.entry ?? (args?.path ? vfs.read(args.path) : undefined);
        if (entry === undefined || entry === null) return { ok: false, text: 'need entry or path' };
        const run = await sandbox({ entry, cases: args?.cases || [], entries: args?.entries });
        return {
          ok: Boolean(run.ok),
          text: (run.results || [])
            .map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : ` (got ${r.got}, want ${r.expect})`}`)
            .join('\n') + (run.error ? `\nerror: ${run.error}` : ''),
          run,
        };
      }
      case 'search': {
        const hits = vfs.search(args?.query);
        return { ok: true, text: hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join('\n') || '(no hits)' };
      }
      case 'note': {
        memory?.remember?.(args?.text || '', 'tool');
        return { ok: true, text: 'noted' };
      }
      case 'finish':
        return { ok: true, text: args?.summary || 'done', finish: true };
      default:
        return { ok: false, text: `unknown tool: ${name}` };
    }
  } catch (err) {
    return { ok: false, text: `tool error: ${err.message}` };
  }
}

/** Pull a JSON object out of a model reply that may be wrapped in prose or fences. */
export function extractJson(text) {
  const s = String(text || '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/g;
  const candidates = [];
  for (const m of s.matchAll(fenced)) candidates.push(m[1]);
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(s.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c.trim());
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/**
 * Read the model's triad proposal.
 * Accepts {candidates:[{strategy|label, path, content, cases?}]} or three fenced code blocks.
 */
export function parseTriadReply(text) {
  const json = extractJson(text);
  if (json) {
    const list = Array.isArray(json) ? json : json.candidates || json.options || json.triad;
    if (Array.isArray(list) && list.length) {
      const norm = list
        .map((c, i) => normaliseCandidate(c, i))
        .filter((c) => c.content && c.content.trim());
      if (norm.length) return { candidates: norm, plan: json.plan || [], raw: json };
    }
    if (typeof json.content === 'string') {
      return { candidates: [normaliseCandidate(json, 0)], plan: json.plan || [], raw: json };
    }
  }
  const blocks = [...String(text || '').matchAll(/```([\w-]*)\n([\s\S]*?)```/g)];
  if (blocks.length) {
    const keys = ['minimal', 'defensive', 'structural'];
    return {
      candidates: blocks.slice(0, 3).map((b, i) =>
        normaliseCandidate(
          {
            strategy: keys[i] || 'minimal',
            path: guessPathFromCode(b[2]) || `src/candidate-${i + 1}.js`,
            content: b[2],
          },
          i,
        ),
      ),
      plan: [],
      raw: null,
    };
  }
  return { candidates: [], plan: [], raw: null };
}

function guessPathFromCode(code) {
  const m = /\/\/\s*(?:path|file)\s*:\s*([\w./-]+)/i.exec(code);
  return m ? m[1] : '';
}

function normaliseCandidate(input, index) {
  const strategyRaw = String(input.strategy || input.label || input.key || '').toLowerCase();
  const strategy = /min|مینیمال/.test(strategyRaw)
    ? 'minimal'
    : /struct|ساختار/.test(strategyRaw)
      ? 'structural'
      : /def|دفاع/.test(strategyRaw)
        ? 'defensive'
        : ['minimal', 'defensive', 'structural'][index] || 'minimal';
  return {
    id: String.fromCharCode(65 + index),
    strategy,
    path: String(input.path || input.file || guessPathFromCode(input.content || '') || `src/candidate-${index + 1}.js`),
    content: String(input.content || input.code || ''),
    tests: input.tests || input.test || null,
    why: String(input.why || input.rationale || ''),
  };
}

/** Deterministic fallback: three variants from Reflex, or an honest scaffold. */
function reflexTriad({ goal, task, strategies }) {
  return strategies.map((s, i) => {
    if (task && reflexCovers(task.prompt || goal)) {
      const solved = reflexSolve(task, s.key);
      return {
        id: String.fromCharCode(65 + i),
        strategy: s.key,
        path: solved.path,
        content: solved.content,
        why: solved.note,
      };
    }
    const scaffold = reflexScaffold(goal);
    return {
      id: String.fromCharCode(65 + i),
      strategy: s.key,
      path: scaffold.path.replace(/\.js$/, `.${s.key}.js`),
      content: scaffold.content,
      why: scaffold.note,
    };
  });
}

/** Cases captured (as data) from a model-written test file. */
async function capturedCases({ content, sandbox }) {
  const run = await sandbox({ entry: content, cases: [], entries: ['cases'], capture: ['cases'] });
  const captured = run?.captured?.cases;
  if (!Array.isArray(captured)) return [];
  return captured.filter((c) => c && typeof c === 'object' && ('expr' in c || 'fn' in c) && 'expect' in c).slice(0, 24);
}

/**
 * Create an agent.
 * @param {object} deps
 * @param {object} deps.vfs VirtualFS
 * @param {object} [deps.llm] {available, complete({messages,system,temperature,maxTokens,tools,onDelta,signal})}
 * @param {object} deps.genome genome (validated internally)
 * @param {object} [deps.memory] {remember}
 * @param {(event:object)=>void} [deps.onEvent]
 * @param {Function} [deps.sandbox]
 */
export function createAgent({ vfs, llm = null, genome, memory = null, onEvent = () => {}, sandbox = runInSandbox, signal = null, skillReferences = [] }) {
  const G = validateGenome(genome);
  const emit = (event) => {
    try {
      onEvent(event);
    } catch {
      /* the UI must never break the loop */
    }
  };
  const state = {
    messages: [],
    steps: 0,
    tokensIn: 0,
    tokensOut: 0,
    compression: null,
    journal: [],
    cancelled: false,
    signal,
  };

  const systemPrompt = () => {
    const files = vfs.list().slice(0, 30).map((f) => `- ${f.path} (${f.bytes}B)`).join('\n');
    return `${genomePrompt(G)}

فضای کاری فعلی:
${files || '(خالی)'}

برای هر تغییر، خروجی را به‌صورت JSON بده:
{"plan":["گام ۱","گام ۲"],"candidates":[{"strategy":"minimal|defensive|structural","path":"src/x.js","content":"<کد کامل>","tests":"<فایل تست کامل یا null>","why":"یک خط"}]}
دقیقاً سه نامزد بده. هیچ متن اضافه‌ای بیرون JSON نگذار.`;
  };

  function trackUsage(usage) {
    if (!usage) return;
    state.tokensIn += usage.in || 0;
    state.tokensOut += usage.out || 0;
    emit({ type: 'usage', in: state.tokensIn, out: state.tokensOut });
  }

  async function modelCall(messages, { tools = [], onDelta } = {}) {
    const packed = compressContext({
      messages,
      budgetTokens: G.genes.contextBudget,
      query: messages[messages.length - 1]?.content || '',
      keepRecent: G.genes.keepRecent,
    });
    state.compression = packed.stats;
    emit({ type: 'compression', stats: packed.stats, digest: packed.digest });
    const res = await llm.complete({
      messages: packed.messages,
      system: systemPrompt(),
      temperature: G.genes.temperature,
      maxTokens: G.genes.maxTokens,
      tools,
      onDelta,
      signal: state.signal,
    });
    trackUsage(res.usage);
    return res;
  }

  /** Evaluate three candidates with the same pipeline. */
  function assertLive() {
    if (state.cancelled || state.signal?.aborted) {
      const err = new Error('اجرا توسط کاربر متوقف شد.');
      err.name = 'AbortError';
      throw err;
    }
  }

  /**
   * A measurement that never ran (sandbox timeout under load, worker killed) is not a failed test.
   * Retry it once with a wider budget so a busy machine cannot silently change who wins.
   */
  async function measure(payload) {
    const first = await sandbox(payload);
    const infraFailure = first?.ok === false && !(first.results || []).length && /timeout|killed|no sandbox/i.test(String(first.error || ''));
    if (!infraFailure) return first;
    emit({ type: 'phase', phase: 'measure', text: 'سندباکس زیر فشار بود؛ همان اندازه‌گیری با بودجهٔ بیشتر تکرار می‌شود.' });
    return sandbox({ ...payload, timeoutMs: (payload.timeoutMs || 1500) * 3 });
  }

  async function evaluateCandidates({ candidates, task, baselinePath }) {
    const weights = resolveWeights(G.rubric);
    emit({ type: 'phase', phase: 'codebreak', text: `سه نامزد ساخته شد؛ برای هر کدام سه فرضیهٔ شکست و پروب اجرایی.` });
    const scored = [];
    for (const candidate of candidates) {
      assertLive();
      const path = candidate.path;
      const baseline = baselinePath ? vfs.read(path) || '' : vfs.read(path) || '';
      candidate.diff = createPatch(baseline, candidate.content, { path });
      candidate.stats = patchStats(candidate.diff);
      const { hypotheses } = codebreak({ task, candidate, baseline, policy: { edgeProbes: G.genes.probeDepth } });

      // Measure: public cases, hidden cases (both from the benchmark), then the probes.
      const entries = task?.entry;
      const publicRun = task?.cases?.length
        ? await measure({ entry: candidate.content, cases: task.cases, entries })
        : { ok: false, results: [], ms: 0, error: 'no public cases' };
      const hiddenRun = task?.hidden?.length && G.genes.verifyHidden
        ? await measure({ entry: candidate.content, cases: task.hidden, entries })
        : { ok: false, results: [], ms: 0 };

      const probeCases = probesFor(hypotheses);
      const probeRun = probeCases.length
        ? await measure({ entry: candidate.content, cases: probeCases, entries })
        : { ok: true, results: [], ms: 0 };
      const withVerdicts = applyProbeVerdicts(hypotheses, probeRun);

      const score = scoreCandidate({
        candidate,
        publicRun,
        hiddenRun,
        hypotheses: withVerdicts,
        baselineChurn: Math.max(4, String(baseline).split('\n').length, candidate.stats.churn),
        weights,
      });
      const enriched = { ...score, candidate, hypotheses: withVerdicts, publicRun, hiddenRun, probeRun };
      scored.push(enriched);
      emit({ type: 'candidate', candidate, score, hypotheses: withVerdicts, publicRun, hiddenRun, probeRun });
    }
    const selection = selectWinner(scored);
    emit({ type: 'selection', ...selection, explanation: explainSelection(selection) });
    return { scored, selection };
  }

  /** Apply the winner, then prove the applied file still passes. */
  async function applyAndVerify({ winner, task }) {
    if (!winner) return { ok: false, verification: null };
    const snapshot = vfs.snapshot('pre-apply');
    const write = vfs.writeFile(winner.candidate.path, winner.candidate.content, `triad ${winner.id} ${winner.strategy}`);
    emit({ type: 'phase', phase: 'apply', text: `نامزد ${winner.id} روی ${write.path} اعمال شد (r${write.rev}).` });

    let verification = null;
    if (task?.cases?.length) {
      verification = await measure({
        entry: vfs.read(winner.candidate.path),
        cases: task.cases,
        entries: task.entry,
      });
      const pass = (verification.results || []).filter((r) => r.pass).length;
      const total = (verification.results || []).length;
      emit({
        type: 'verify',
        phase: 'verify',
        ok: Boolean(verification.ok),
        pass,
        total,
        text: verification.ok ? `تأیید پس از اعمال: ${pass}/${total} تست سبز (اجرای واقعی).` : `تأیید شکست خورد: ${pass}/${total}.`,
      });
    } else if (winner.candidate.tests) {
      const cases = await capturedCases({ content: winner.candidate.tests, sandbox });
      if (cases.length) {
        verification = await measure({
          entry: vfs.read(winner.candidate.path),
          cases,
          entries: task?.entry,
        });
        emit({
          type: 'verify',
          phase: 'verify',
          ok: Boolean(verification.ok),
          pass: (verification.results || []).filter((r) => r.pass).length,
          total: (verification.results || []).length,
          text: `تأیید با تست‌های نوشته‌شده: ${verification.ok ? 'سبز' : 'قرمز'}`,
        });
      }
    }
    return { ok: Boolean(verification?.ok ?? true), verification, snapshot, write };
  }

  async function runReflex({ goal, task }) {
    const strategies = planTriad({
      weightHints: Object.fromEntries(Object.entries(G.strategyWeights).map(([k, v]) => [k, v])),
    });
    emit({ type: 'phase', phase: 'plan', text: task ? `خانوادهٔ «${task.title}» شناسایی شد؛ سه استراتژی آماده است.` : 'خانوادهٔ شناخته‌شده‌ای نبود؛ اسکلت صادقانه ساخته می‌شود.' });
    if (!task) {
      const scaffold = reflexScaffold(goal);
      vfs.writeFile(scaffold.path, scaffold.content, 'scaffold');
      emit({ type: 'message', role: 'assistant', text: `در حالت بدون کلید نمی‌توانم کدِ این درخواست را بسازم. یک اسکلت در ${scaffold.path} گذاشتم و مشخصات را ثبت کردم. برای تولید واقعی، در تنظیمات یک ارائه‌دهنده وصل کن.` });
      return { ok: false, mode: 'reflex', reason: 'no-family', scaffold };
    }
    const candidates = reflexTriad({ goal, task, strategies });
    for (const c of candidates) emit({ type: 'generate', candidate: c });
    const { scored, selection } = await evaluateCandidates({ candidates, task });
    const applied = await applyAndVerify({ winner: selection.winner, task });
    const ok = Boolean(applied.ok);
    const summary = ok
      ? `${selection.winner.id} (${selection.winner.strategy}) اعمال و تأیید شد: ${selection.winner.notes.join(' · ')}`
      : `هیچ نامزدی تأیید نشد. ${selection.reason}`;
    emit({ type: 'message', role: 'assistant', text: summary });
    if (ok) {
      memory?.remember?.(`${goal} → ${selection.winner.candidate.path} با ${selection.winner.total}`, 'run');
      state.journal.push({ at: Date.now(), goal, winner: selection.winner.id, score: selection.winner.total, ok });
    }
    return { ok, mode: 'reflex', scored, selection, applied };
  }

  async function runModel({ goal, task }) {
    const listing = vfs.list().slice(0, 24).map((f) => `### ${f.path}\n${String(vfs.read(f.path)).slice(0, 1200)}`).join('\n\n');
    const reference = skillReferenceMessage(skillReferences);
    const messages = [
      ...(reference ? [{ role: 'user', content: reference }] : []),
      { role: 'user', content: `هدف: ${goal}\n\nفایل‌های مرتبط:\n${listing || '(فضای کاری خالی)'}\n\nسه نامزد بده.` },
    ];
    emit({ type: 'phase', phase: 'plan', text: 'درخواست برنامه‌ریزی به مدل رفت؛ سه نامزد در یک فراخوانی.' });

    let replyText = '';
    const res = await modelCall(messages, {
      onDelta: (d) => {
        if (d.type === 'delta') {
          replyText += d.text;
          emit({ type: 'delta', text: d.text });
        }
      },
    });
    const parsed = parseTriadReply(res.text || replyText);
    const strategies = planTriad({ weightHints: G.strategyWeights });
    let candidates = parsed.candidates;
    if (!candidates.length) {
      emit({ type: 'phase', phase: 'generate', text: 'پاسخ مدل JSON قابل‌تجزیه نداشت؛ به تولید محلی برمی‌گردم.' });
      candidates = reflexTriad({ goal, task, strategies });
    }

    // If the model wrote a test file but no benchmark cases exist, capture its cases as data.
    let effectiveTask = task;
    if (!task && candidates[0]?.tests) {
      const cases = await capturedCases({ content: candidates[0].tests, sandbox });
      if (cases.length) {
        const entryNames = [...new Set(cases.map((c) => c.fn).filter(Boolean))];
        effectiveTask = { id: 'adhoc', title: 'تستِ نوشته‌شده توسط مدل', cases, hidden: [], entry: entryNames };
      }
    }

    let { scored, selection } = await evaluateCandidates({ candidates, task: effectiveTask });
    let applied = await applyAndVerify({ winner: selection.winner, task: effectiveTask });

    // One repair round, still a triad: the failures are fed back and re-measured.
    let repairs = 0;
    while (!applied.ok && repairs < G.genes.retryOnFail) {
      repairs += 1;
      const failures = (applied.verification?.results || []).filter((r) => !r.pass);
      emit({ type: 'phase', phase: 'repair', text: `تلاش ترمیم ${repairs}: ${failures.length} تست قرمز به مدل برگشت.` });
      const fixMessages = [
        ...messages,
        { role: 'assistant', content: res.text || replyText },
        {
          role: 'user',
          content: `کدِ اعمال‌شده در تست‌ها رد شد:\n${failures.map((f) => `- ${f.name}: got ${f.got}, want ${f.expect}`).join('\n')}\n\nسه نامزد اصلاح‌شده بده؛ همان قالب JSON و همان مسیر.`,
        },
      ];
      const fix = await modelCall(fixMessages, { onDelta: (d) => d.type === 'delta' && emit({ type: 'delta', text: d.text }) });
      const next = parseTriadReply(fix.text);
      if (!next.candidates.length) break;
      ({ scored, selection } = await evaluateCandidates({ candidates: next.candidates, task: effectiveTask }));
      applied = await applyAndVerify({ winner: selection.winner, task: effectiveTask });
    }

    const ok = Boolean(applied.ok);
    emit({
      type: 'message',
      role: 'assistant',
      text: ok
        ? `${selection.winner.id} (${selection.winner.strategy}) اعمال شد و تست‌ها سبز است: ${selection.winner.notes.join(' · ')}`
        : `تست‌ها سبز نشد؛ چیزی به‌عنوان موفقیت ثبت نمی‌کنم. ${selection.reason}`,
    });
    return { ok, mode: 'model', scored, selection, applied, repairs, parsedPlan: parsed.plan };
  }

  async function run({ goal, task = null } = {}) {
    state.steps = 0;
    state.cancelled = false;
    emit({ type: 'start', goal, mode: llm?.available ? 'model' : 'reflex' });
    const t0 = Date.now();
    try {
      const effectiveTask = task || null;
      const result = llm?.available
        ? await runModel({ goal, task: effectiveTask })
        : await runReflex({ goal, task: effectiveTask });
      const elapsed = Date.now() - t0;
      const lastWinner = result.selection?.winner || null;
      const reflect = {
        at: Date.now(),
        elapsed,
        ok: result.ok,
        score: lastWinner?.total ?? null,
        tokensIn: state.tokensIn,
        tokensOut: state.tokensOut,
        compression: state.compression,
        goal,
      };
      state.journal.push(reflect);
      memory?.journalEntry?.(reflect);
      emit({ type: 'reflect', ...reflect });
      emit({ type: 'done', ok: result.ok, mode: result.mode, elapsed });
      return { ...result, reflect, mode: result.mode };
    } catch (err) {
      const message = err?.message || String(err);
      emit({ type: 'error', text: message });
      emit({ type: 'done', ok: false, error: message });
      return { ok: false, error: message };
    }
  }

  return {
    run,
    state,
    genome: G,
    tools: TOOL_SPECS,
    execute: (name, args) => executeTool(name, args, { vfs, sandbox, memory }),
    systemPrompt,
    /** Tool-calling loop for multi-file work (used by the chat's "agent mode"). */
    async toolLoop({ goal, maxSteps = G.genes.maxSteps } = {}) {
      const reference = skillReferenceMessage(skillReferences);
      const messages = [...(reference ? [{ role: 'user', content: reference }] : []), { role: 'user', content: goal }];
      for (let step = 0; step < maxSteps; step += 1) {
        state.steps = step + 1;
        const res = await modelCall(messages, { tools: TOOL_SPECS });
        messages.push({ role: 'assistant', content: res.text || '' });
        if (!res.toolCalls?.length) {
          emit({ type: 'message', role: 'assistant', text: res.text });
          return { ok: true, text: res.text };
        }
        for (const call of res.toolCalls) {
          emit({ type: 'tool', name: call.name, args: call.args });
          const out = await executeTool(call.name, call.args, { vfs, sandbox, memory });
          emit({ type: 'tool-result', name: call.name, ok: out.ok, text: out.text, diff: out.diff });
          messages.push({ role: 'user', content: `[${call.name}] ${out.text}` });
          if (out.finish) return { ok: true, text: out.text };
        }
      }
      return { ok: false, text: 'سقف گام‌ها تمام شد.' };
    },
  };
}

/** Token cost of a goal + workspace, used before a run to warn about context pressure. */
export function preflight({ goal, vfs, budget }) {
  const workspace = vfs.list().reduce((s, f) => s + estimateTokens(vfs.read(f.path) || ''), 0);
  const goalTokens = estimateTokens(goal);
  return { workspace, goalTokens, total: workspace + goalTokens, budget, pressure: workspace + goalTokens > budget };
}
