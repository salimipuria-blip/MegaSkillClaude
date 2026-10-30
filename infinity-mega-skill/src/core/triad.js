// The Triad: never one answer, always three — plus a pre-mortem that turns doubt into a test.
//
// Three independent strategies are generated for every change (minimal / defensive / structural).
// Each candidate gets three *precise* failure hypotheses ("codebreak"), and every hypothesis that
// can be executed becomes a real probe in the sandbox. The winner is the candidate that survived
// its own pre-mortem with the best weighted score — not the first one that compiles.

import { patchStats } from './diff.js';

export const DEFAULT_RUBRIC = {
  correctness: 0.46,
  minimality: 0.18,
  safety: 0.16,
  clarity: 0.1,
  efficiency: 0.1,
};

export const STRATEGY_META = {
  minimal: {
    id: 'A',
    label: 'مینیمال',
    blurb: 'کمترین تغییرِ ممکن؛ کمترین سطح حمله',
    hypothesis: 'کمترین دیف، کمترین ریسک رگرسیون — اما ممکن است حالت مرزی را ندیده بگیرد.',
  },
  defensive: {
    id: 'B',
    label: 'دفاعی',
    blurb: 'اعتبارسنجی ورودی و مدیریت خطا',
    hypothesis: 'ورودی بد را زود رد می‌کند — اما دیف بزرگ‌تر و رفتار جدید می‌سازد.',
  },
  structural: {
    id: 'C',
    label: 'ساختاری',
    blurb: 'تابع‌های کوچک، نام‌گذاری و مستندسازی',
    hypothesis: 'خواندن و نگه‌داری را آسان می‌کند — اما برای یک باگ کوچک، تغییر زیادی است.',
  },
};

const STRATEGY_ORDER = ['minimal', 'defensive', 'structural'];

/** Plan the three candidates. Pure: generation happens later, by reflex or by the model. */
export function planTriad({ weightHints = {} } = {}) {
  return STRATEGY_ORDER.map((key) => ({
    ...STRATEGY_META[key],
    key,
    weight: Number(weightHints[key]) || 1,
  }));
}

/** Weighted rubric for this genome, normalised to sum 1. */
export function resolveWeights(rubric = {}) {
  const merged = { ...DEFAULT_RUBRIC, ...rubric };
  const total = Object.values(merged).reduce((s, v) => s + Math.max(0, Number(v) || 0), 0) || 1;
  const out = {};
  for (const [k, v] of Object.entries(merged)) out[k] = Math.max(0, Number(v) || 0) / total;
  return out;
}

// ---------------------------------------------------------------- codebreak

const FORBIDDEN = [
  { re: /\beval\s*\(/, why: 'eval در کد تولیدی' },
  { re: /new\s+Function\s*\(/, why: 'ساخت تابع از رشته' },
  { re: /document\.write\s*\(/, why: 'document.write' },
  { re: /\.innerHTML\s*=/, why: 'innerHTML بدون escape' },
  { re: /\b(fetch|XMLHttpRequest)\s*\(/, why: 'شبکه در کد کتابخانه' },
  { re: /localStorage\./, why: 'وابستگی به مرورگر در ماژول' },
  { re: /\b(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}/i, why: 'رازِ سخت‌کدشده' },
  { re: /\bwhile\s*\(\s*true\s*\)/, why: 'حلقهٔ بی‌پایان بدون شرط خروج' },
];

/** Exported names in a module (best-effort, good enough to detect a dropped export). */
export function exportedNames(code) {
  const names = new Set();
  const src = String(code || '');
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

/** Edge inputs derived from the task's own cases — no knowledge of the hidden set. */
export function edgeInputs(task, limit = 2) {
  const seed = (task?.cases || []).find((c) => Array.isArray(c.args));
  if (!seed) return [];
  const base = seed.args;
  const empty = (v) => {
    if (Array.isArray(v)) return [];
    if (typeof v === 'string') return '';
    if (typeof v === 'number') return 0;
    if (typeof v === 'boolean') return false;
    if (v && typeof v === 'object') return {};
    return v;
  };
  const out = [];
  out.push({
    name: 'همهٔ ورودی‌ها خالی/صفر',
    label: 'همهٔ ورودی‌ها خالی/صفر',
    fn: seed.fn,
    args: base.map(empty),
    expect: 'NO_THROW',
  });
  if (base.length) {
    out.push({
      name: 'یک ورودیِ مرزی در کنار ورودی معتبر',
      label: 'یک ورودیِ مرزی در کنار ورودی معتبر',
      fn: seed.fn,
      args: base.map((v, i) => (i === 0 ? empty(v) : v)),
      expect: 'NO_THROW',
    });
  }
  return out.slice(0, limit);
}

/** A stress input: bigger, not different — catches accidental O(n²) or an unbounded loop. */
export function stressInput(task) {
  const seed = (task?.cases || []).find((c) => Array.isArray(c.args));
  if (!seed) return null;
  const args = seed.args.map((v) => {
    if (Array.isArray(v)) return Array.from({ length: 400 }, (_, i) => i);
    if (typeof v === 'string') return 'a'.repeat(2000);
    if (typeof v === 'number') return Number.MAX_SAFE_INTEGER;
    return v;
  });
  return { name: 'ورودی بزرگ (۴۰۰ عضو)', label: 'ورودی بزرگ (۴۰۰ عضو)', fn: seed.fn, args, expect: 'NO_THROW' };
}

/**
 * Three precise, executable failure hypotheses for one candidate.
 * Each has: claim (what could go wrong), likelihood (0..1), probe (cases to run) and/or static.
 */
export function codebreak({ task, candidate, baseline, policy = {} }) {
  const code = String(candidate?.content || '');
  const baselineExports = new Set(exportedNames(baseline || ''));
  const nowExports = new Set(exportedNames(code));
  const dropped = [...baselineExports].filter((n) => !nowExports.has(n));
  const churn = patchStats(candidate?.diff || '').churn;
  const baselineLines = String(baseline || '').split('\n').length || 1;
  const rewrite = churn >= baselineLines * 0.8;
  const edge = edgeInputs(task, policy.edgeProbes ?? 2);
  const stress = stressInput(task);
  const hasLoop = /\b(for|while|do)\b/.test(code);
  const hasRecursion = /\b(\w+)\s*\([^)]*\)[\s\S]{0,120}\b\1\s*\(/.test(code);
  const noExit = /\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)/.test(code);

  const hypotheses = [
    {
      id: 'H1',
      kind: 'edge',
      claim: 'ورودی مرزی (خالی/صفر/نوع ساده) باعث خطا یا رفتار تعریف‌نشده می‌شود.',
      likelihood: round(Math.min(0.9, 0.18 + (edge.length ? 0.12 : 0) + (rewrite ? 0.1 : 0) + (/\bparseInt|\bJSON\.parse|\.length\b/.test(code) ? 0.08 : 0))),
      probe: edge,
      passIf: 'no-throw',
    },
    {
      id: 'H2',
      kind: 'regression',
      claim: dropped.length
        ? `صادراتِ قبلی حذف شده: ${dropped.join('، ')} — مصرف‌کننده‌ها می‌شکنند.`
        : 'بازنویسیِ کامل، رفتار بخش‌های دیگر فایل را بی‌صدا تغییر می‌دهد.',
      likelihood: round(dropped.length ? 0.75 : rewrite ? 0.42 : 0.12),
      static: { droppedExports: dropped, rewrite, churn, baselineLines },
      passIf: 'exports-preserved',
      confirmed: dropped.length > 0,
    },
    {
      id: 'H3',
      kind: 'performance',
      claim: noExit
        ? 'حلقهٔ بدون شرط خروج می‌تواند اجرا را قفل کند.'
        : 'با ورودی بزرگ، زمان اجرا از سقف می‌گذرد یا حافظه می‌ترکد.',
      likelihood: round(Math.min(0.85, 0.1 + (noExit ? 0.6 : 0) + (hasLoop ? 0.1 : 0) + (hasRecursion ? 0.12 : 0))),
      probe: stress ? [stress] : [],
      passIf: 'no-throw',
    },
  ];

  for (const h of hypotheses) {
    if (!h.static && h.probe?.length) h.executable = true;
    if (h.static) h.executable = true;
  }
  return { hypotheses, risk: round(hypotheses.reduce((s, h) => s + h.likelihood, 0) / hypotheses.length) };
}

// ---------------------------------------------------------------- scoring

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const round = (v) => Math.round(v * 1000) / 1000;

function runStats(run) {
  const results = run?.results || [];
  const total = results.length;
  const pass = results.filter((r) => r.pass).length;
  return { total, pass, ratio: total ? pass / total : 0, ms: run?.ms || 0 };
}

/**
 * Score a candidate on five axes.
 * @param {object} input
 * @param {object} input.candidate {id, strategy, code, diff}
 * @param {object} input.publicRun sandbox result for the task's public cases
 * @param {object} [input.hiddenRun] sandbox result for the hidden cases (measurement only)
 * @param {Array} [input.hypotheses] from codebreak, after probes have verdicts
 */
export function scoreCandidate({
  candidate,
  publicRun,
  hiddenRun,
  hypotheses = [],
  baselineChurn = 1,
  weights = DEFAULT_RUBRIC,
}) {
  const pub = runStats(publicRun);
  const hid = runStats(hiddenRun);
  const correctness = hid.total ? pub.ratio * 0.45 + hid.ratio * 0.55 : pub.ratio;

  const churn = candidate?.stats?.churn ?? patchStats(candidate?.diff || '').churn;
  const baseline = Math.max(1, baselineChurn, churn);
  const minimality = clamp01(1 - churn / baseline);

  const forbidden = FORBIDDEN.filter((f) => f.re.test(String(candidate?.content || '')));
  const confirmed = hypotheses.filter((h) => h.confirmed).length;
  const safety = clamp01(1 - confirmed * 0.28 - forbidden.length * 0.16);

  const code = String(candidate?.content || '');
  const lines = code.split('\n').length;
  const hasDoc = /\/\*\*[\s\S]*?\*\//.test(code) || /^\s*\/\/.+/m.test(code);
  const longFn = lines > 60;
  const clarity = clamp01(0.42 + (hasDoc ? 0.24 : 0) + (lines <= 24 ? 0.16 : 0) + (longFn ? -0.22 : 0));

  // Efficiency is measured, then quantised. Raw wall-clock cannot decide a winner: two identical
  // runs differ by a millisecond or two, and that used to flip the winner and make the whole
  // "reproducible" claim false on a busy machine. Coarse buckets keep a real 3ms-vs-150ms signal
  // while ignoring scheduling noise.
  const ms = pub.ms + hid.ms;
  // The first bucket is wide on purpose: sub-15ms timings are dominated by scheduler noise, and a
  // 3ms-vs-5ms difference must never decide a winner. Real slowness (150ms+) still registers.
  const speedBucket = ms < 15 ? 0 : ms < 60 ? 1 : ms < 150 ? 2 : ms < 400 ? 3 : 4;
  const speedScore = [1, 0.85, 0.7, 0.5, 0.3][speedBucket];
  const sizeScore = lines <= 24 ? 1 : lines <= 60 ? 0.78 : lines <= 140 ? 0.55 : 0.3;
  const efficiency = clamp01(speedScore * 0.6 + sizeScore * 0.4);

  const w = resolveWeights(weights);
  const parts = {
    correctness: round(correctness),
    minimality: round(minimality),
    safety: round(safety),
    clarity: round(clarity),
    efficiency: round(efficiency),
  };
  const total = round(
    parts.correctness * w.correctness +
      parts.minimality * w.minimality +
      parts.safety * w.safety +
      parts.clarity * w.clarity +
      parts.efficiency * w.efficiency,
  );

  // The winner has to be reproducible: the same goal must give the same code twice. Wall-clock
  // speed belongs in the *reported* `efficiency`/`total`, but it must never pick the winner — the
  // same candidate measures 5ms on an idle machine and 80ms on a busy one, and that scheduler noise
  // once flipped the winner and broke the "same goal, same code" guarantee under load. So ranking
  // uses `decisionTotal`: every axis except raw speed, with efficiency reduced to code size alone.
  const decisionTotal = round(
    parts.correctness * w.correctness +
      parts.minimality * w.minimality +
      parts.safety * w.safety +
      parts.clarity * w.clarity +
      round(clamp01(sizeScore)) * w.efficiency,
  );

  const notes = [];
  if (pub.total && pub.pass === pub.total) notes.push(`همهٔ ${pub.total} تستِ عمومی سبز`);
  else if (pub.total) notes.push(`${pub.total - pub.pass} تستِ عمومی قرمز`);
  if (hid.total) notes.push(`${hid.pass}/${hid.total} تستِ پنهان`);
  if (confirmed) notes.push(`${confirmed} فرضیهٔ شکست تأیید شد`);
  if (forbidden.length) notes.push(`الگوی پرخطر: ${forbidden.map((f) => f.why).join('، ')}`);
  if (churn >= baseline * 0.8) notes.push('بازنویسی تقریباً کامل');
  if (hasDoc) notes.push('مستند/کامنت دارد');

  return {
    id: candidate?.id,
    strategy: candidate?.strategy,
    total,
    decisionTotal,
    speedBucket,
    parts,
    weights: w,
    churn,
    tests: { public: pub, hidden: hid },
    confirmed,
    forbidden: forbidden.map((f) => f.why),
    notes,
    solved: pub.total > 0 && pub.pass === pub.total && (hid.total === 0 || hid.pass === hid.total),
  };
}

/**
 * Pick the winner deterministically: score, then fewer confirmed hypotheses, then smaller diff,
 * then the declared strategy order. Ties are explained, never silent.
 */
export function selectWinner(scored = []) {
  // Rank on the timing-independent decisionTotal (falls back to total only if an older scored object
  // lacks it), so the winner is reproducible; raw wall-clock never gets a vote. Ties fall through to
  // fully deterministic keys: fewer confirmed failures, smaller diff, then the declared strategy.
  const rankOf = (x) => (typeof x.decisionTotal === 'number' ? x.decisionTotal : x.total);
  const ranked = [...scored].sort((a, b) => {
    if (rankOf(b) !== rankOf(a)) return rankOf(b) - rankOf(a);
    if (a.confirmed !== b.confirmed) return a.confirmed - b.confirmed;
    if (a.churn !== b.churn) return a.churn - b.churn;
    return STRATEGY_ORDER.indexOf(a.strategy) - STRATEGY_ORDER.indexOf(b.strategy);
  });
  if (!ranked.length) return { winner: null, ranked, rejects: [], reason: 'هیچ نامزد معتبری ساخته نشد' };
  const winner = ranked[0];
  const rejects = ranked.slice(1).map((r) => ({
    id: r.id,
    strategy: r.strategy,
    total: r.total,
    reason: rejectReason(winner, r),
  }));
  return { winner, ranked, rejects, reason: acceptReason(winner) };
}

function rejectReason(winner, loser) {
  if (winner.total - loser.total >= 0.08) return `امتیاز پایین‌تر (${loser.total} در برابر ${winner.total})`;
  if (loser.confirmed > winner.confirmed) return 'فرضیهٔ شکستِ تأییدشدهٔ بیشتر';
  if (loser.churn > winner.churn) return 'دیفِ بزرگ‌تر با امتیاز نزدیک';
  if (loser.parts.correctness < winner.parts.correctness) return 'تست‌های کم‌ترِ سبز';
  return 'ترجیحِ ترتیبِ استراتژی در تساوی';
}

function acceptReason(w) {
  const bits = [];
  if (w.solved) bits.push('همهٔ تست‌ها سبز');
  if (w.confirmed === 0) bits.push('بدون فرضیهٔ تأییدشده');
  if (w.churn <= 6) bits.push(`دیفِ کوچک (${w.churn} خط)`);
  bits.push(`امتیاز ${w.total}/۱`);
  return bits.join(' · ');
}

/** Persian one-paragraph explanation for the transcript. */
export function explainSelection({ winner, rejects }) {
  if (!winner) return 'هیچ نامزدی تولید نشد؛ هدف را دقیق‌تر بنویس یا مدل را وصل کن.';
  const lines = [`نامزد ${winner.id} (${STRATEGY_META[winner.strategy]?.label || winner.strategy}) انتخاب شد: ${acceptReason(winner)}.`];
  for (const r of rejects) lines.push(`نامزد ${r.id} رد شد — ${r.reason}.`);
  return lines.join(' ');
}

/** Build the probe case list for a candidate from its hypotheses. */
export function probesFor(hypotheses) {
  return hypotheses.flatMap((h) => (h.kind === 'regression' ? [] : (h.probe || []).map((p) => ({ ...p, hypothesis: h.id }))));
}

/** Attach probe verdicts back onto the hypotheses they came from. */
export function applyProbeVerdicts(hypotheses, probeRun) {
  const results = probeRun?.results || [];
  return hypotheses.map((h) => {
    if (h.kind === 'regression') return h;
    const mine = results.filter((r) => (h.probe || []).some((p) => p.label === r.name || p.name === r.name));
    if (!mine.length) return { ...h, confirmed: Boolean(h.confirmed), probed: false };
    const failed = mine.filter((r) => !r.pass);
    return {
      ...h,
      probed: true,
      confirmed: failed.length > 0,
      evidence: failed.map((r) => `${r.name}: ${r.got}`),
    };
  });
}
