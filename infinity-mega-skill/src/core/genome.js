// Genome: the agent's own configuration as a versioned, mutable, measurable object.
//
// Self-improvement only means something if it can fail. Every generation produces exactly three
// mutants, each mutant is measured on the real benchmark (sandboxed code, no vibes), and the
// champion is replaced only when the gain beats an epsilon AND nothing regressed. A rejected
// generation is still recorded: the lineage is the memory of what did not work.

import { DEFAULT_RUBRIC } from './triad.js';

export const GENOME_VERSION = 1;
export const EPSILON = 0.005;

export const LIMITS = {
  temperature: [0, 1.2],
  maxSteps: [2, 24],
  contextBudget: [4000, 200000],
  keepRecent: [2, 20],
  probeDepth: [0, 4],
  retryOnFail: [0, 3],
  compression: [0, 1],
  maxTokens: [256, 8000],
};

export const DEFAULT_GENES = {
  temperature: 0.25,
  maxSteps: 8,
  contextBudget: 24000,
  keepRecent: 6,
  probeDepth: 2,
  retryOnFail: 1,
  compression: 0.55,
  maxTokens: 1600,
  verifyHidden: true,
};

export const PROMPT_FRAGMENTS = {
  surgery: 'هر تغییر را کوچک‌ترین دیفِ ممکن نگه دار؛ فایلِ کامل را بازنویسی نکن مگر لازم باشد.',
  prove: 'هیچ ادعایی بدون اجرای تست در سندباکس پذیرفته نیست. «سبز شد» یعنی خروجیِ اجرا دیده شده.',
  edges: 'قبل از تحویل، سه فرضیهٔ شکست را نام ببر و هر کدام را با یک تست واقعی بسنج.',
  honesty: 'اگر کاری را نمی‌توانی انجام دهی، همان‌جا بگو؛ هرگز تستِ ساختگی یا نتیجهٔ جعلی نساز.',
  minimal: 'کدِ کمتر با رفتارِ روشن، بر کدِ بیشتر با انتزاعِ فرضی ترجیح دارد.',
};

/** A fresh genome. Deterministic: same seed, same lineage. */
export function defaultGenome({ seed = 1 } = {}) {
  return {
    version: GENOME_VERSION,
    id: `g${seed}`,
    seed,
    generation: 0,
    createdAt: Date.now(),
    genes: { ...DEFAULT_GENES },
    rubric: { ...DEFAULT_RUBRIC },
    strategyWeights: { minimal: 1, defensive: 1.05, structural: 0.95 },
    fragments: ['surgery', 'prove', 'edges', 'honesty', 'minimal'],
    fitness: null,
    history: [],
  };
}

const clamp = (v, [min, max]) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Clamp every gene into its allowed range and drop unknown keys. */
export function validateGenome(genome) {
  const g = structuredCloneSafe(genome || defaultGenome());
  const genes = {};
  for (const [key, value] of Object.entries(DEFAULT_GENES)) {
    const numeric = typeof value === 'number';
    genes[key] = numeric ? clamp(Number(g.genes?.[key] ?? value), LIMITS[key] || [0, 1e9]) : g.genes?.[key] ?? value;
  }
  genes.verifyHidden = Boolean(g.genes?.verifyHidden ?? true);
  const rubric = {};
  for (const key of Object.keys(DEFAULT_RUBRIC)) {
    rubric[key] = r3(Math.max(0.01, Number(g.rubric?.[key] ?? DEFAULT_RUBRIC[key])));
  }
  const strategyWeights = {};
  for (const key of ['minimal', 'defensive', 'structural']) {
    strategyWeights[key] = r3(clamp(Number(g.strategyWeights?.[key] ?? 1), [0.2, 2]));
  }
  return {
    ...g,
    version: GENOME_VERSION,
    genes,
    rubric,
    strategyWeights,
    fragments: Array.isArray(g.fragments) && g.fragments.length
      ? [...new Set(g.fragments.filter((f) => PROMPT_FRAGMENTS[f]))]
      : ['prove'],
  };
}

function structuredCloneSafe(obj) {
  return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

/** Deterministic RNG (mulberry32): the same seed replays the same evolution. */
export function rngFrom(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const OPERATORS = {
  tighten: {
    label: 'سخت‌گیری',
    blurb: 'دمای کمتر، وزن بیشتر برای درستی، یک تلاش اضافه',
    apply(g) {
      g.genes.temperature = r3(clamp(g.genes.temperature - 0.15, LIMITS.temperature));
      g.rubric.correctness = r3(Math.min(0.75, g.rubric.correctness + 0.05));
      g.genes.retryOnFail = clamp(g.genes.retryOnFail + 1, LIMITS.retryOnFail);
      return g;
    },
  },
  explore: {
    label: 'کاوش',
    blurb: 'دمای بیشتر، وزن ساختاری بیشتر، عمق پروب بالاتر',
    apply(g) {
      g.genes.temperature = r3(clamp(g.genes.temperature + 0.18, LIMITS.temperature));
      g.strategyWeights.structural = r3(clamp(g.strategyWeights.structural + 0.25, [0.2, 2]));
      g.genes.probeDepth = clamp(g.genes.probeDepth + 1, LIMITS.probeDepth);
      return g;
    },
  },
  compress: {
    label: 'فشرده‌سازی',
    blurb: 'بودجهٔ کانتکست کمتر، حافظهٔ کوتاه‌تر، فشرده‌سازیِ شدیدتر',
    apply(g) {
      g.genes.contextBudget = Math.round(clamp(g.genes.contextBudget * 0.75, LIMITS.contextBudget));
      g.genes.keepRecent = clamp(g.genes.keepRecent - 2, LIMITS.keepRecent);
      g.genes.compression = r3(clamp(g.genes.compression + 0.15, LIMITS.compression));
      return g;
    },
  },
  guard: {
    label: 'نگهبانی',
    blurb: 'گام‌های بیشتر، وزن ایمنی بالاتر، اثبات اجباری',
    apply(g) {
      g.genes.maxSteps = clamp(g.genes.maxSteps + 2, LIMITS.maxSteps);
      g.rubric.safety = r3(Math.min(0.5, g.rubric.safety + 0.05));
      g.genes.verifyHidden = true;
      if (!g.fragments.includes('prove')) g.fragments.push('prove');
      return g;
    },
  },
  minimalist: {
    label: 'مینیمال',
    blurb: 'وزن مینیمالیته و استراتژیِ کوچک‌ترین دیف بالاتر',
    apply(g) {
      g.rubric.minimality = r3(Math.min(0.5, g.rubric.minimality + 0.06));
      g.strategyWeights.minimal = r3(clamp(g.strategyWeights.minimal + 0.3, [0.2, 2]));
      if (!g.fragments.includes('surgery')) g.fragments.push('surgery');
      return g;
    },
  },
  bilingual: {
    label: 'دوزبانه',
    blurb: 'افزودن قطعهٔ صداقت و سخت‌گیری روی نام‌گذاری',
    apply(g) {
      if (!g.fragments.includes('honesty')) g.fragments.push('honesty');
      g.rubric.clarity = r3(Math.min(0.35, g.rubric.clarity + 0.04));
      return g;
    },
  },
};

export const OPERATOR_KEYS = Object.keys(OPERATORS);

/**
 * Exactly three mutants, always distinct, always deterministic for a given seed.
 * @returns {Array<{id:string, operator:string, label:string, blurb:string, genome:object}>}
 */
export function mutate(genome, { seed = genome.generation + 1, count = 3 } = {}) {
  const rnd = rngFrom(seed * 7919 + genome.generation * 104729 + genome.seed);
  const pool = [...OPERATOR_KEYS];
  const picked = [];
  while (picked.length < Math.min(count, pool.length)) {
    const idx = Math.floor(rnd() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked.map((key, i) => {
    const g = validateGenome(structuredCloneSafe(genome));
    OPERATORS[key].apply(g);
    g.generation = genome.generation + 1;
    g.id = `${genome.id}-m${i + 1}-${key}`;
    g.parent = genome.id;
    g.fitness = null;
    g.history = [...(genome.history || []), { ts: Date.now(), event: 'mutate', operator: key, from: genome.id }];
    return {
      id: g.id,
      operator: key,
      label: OPERATORS[key].label,
      blurb: OPERATORS[key].blurb,
      genome: validateGenome(g),
    };
  });
}

/**
 * Fitness from measured evidence, not from the genome's own opinion.
 * 55% benchmark score, 25% solve rate, 10% stability (low variance), 10% token efficiency.
 */
export function scoreFitness({ suite, tokensUsed = 0, budget = 1, regressionFree = true } = {}) {
  const mean = Number(suite?.mean) || 0;
  const solvedRate = suite?.total ? (Number(suite.solved) || 0) / suite.total : 0;
  const stability = Math.max(0, 1 - (Number(suite?.variance) || 0) * 4);
  const efficiency = budget > 0 ? Math.max(0, Math.min(1, 1 - tokensUsed / Math.max(1, budget))) : 0;
  const score =
    mean * 0.55 + solvedRate * 0.25 + stability * 0.1 + efficiency * 0.1 - (regressionFree ? 0 : 0.25);
  return {
    score: r3(Math.max(0, score)),
    parts: {
      benchmark: r3(mean),
      solvedRate: r3(solvedRate),
      stability: r3(stability),
      efficiency: r3(efficiency),
      regressionFree: Boolean(regressionFree),
    },
    suite,
    tokensUsed,
    at: Date.now(),
  };
}

/**
 * One evolution step over already-measured candidates.
 * @param {object} input
 * @param {object} input.champion current genome with fitness
 * @param {Array<{mutant:object, fitness:object, suite:object}>} input.challengers three measured mutants
 */
export function selectGeneration({ champion, challengers = [], epsilon = EPSILON } = {}) {
  const baseFit = Number(champion?.fitness?.score) || 0;
  const measured = challengers
    .filter((c) => c && c.fitness)
    .sort((a, b) => b.fitness.score - a.fitness.score);
  const best = measured[0] || null;
  const improved = best ? best.fitness.score - baseFit : 0;
  const regressed = challengers.filter((c) => c?.fitness?.parts?.regressionFree === false).length;
  const accepted = Boolean(best && improved > epsilon && best.fitness.parts?.regressionFree !== false);

  const record = {
    ts: Date.now(),
    generation: (champion?.generation || 0) + 1,
    base: baseFit,
    best: best ? best.fitness.score : baseFit,
    improved: r3(improved),
    accepted,
    operator: best?.mutant?.operator || null,
    challengers: measured.map((c) => ({
      id: c.mutant?.id,
      operator: c.mutant?.operator,
      score: c.fitness.score,
      solved: c.fitness.suite?.solved ?? 0,
      total: c.fitness.suite?.total ?? 0,
    })),
    regressed,
    reason: accepted
      ? `بهبود ${r3(improved)} > ε=${epsilon} و بدون رگرسیون`
      : best
        ? improved > 0
          ? `بهبود ${r3(improved)} کمتر از آستانهٔ ${epsilon}`
          : 'هیچ نامزدِ جهش‌یافته‌ای بهتر نشد'
        : 'هیچ نامزدِ قابل‌اندازه‌گیری نبود',
  };

  if (!accepted) {
    return {
      champion,
      accepted: false,
      record,
      note: `نسل ${record.generation} رد شد — ${record.reason}. قهرمان دست‌نخورده ماند (بدون رگرسیون).`,
    };
  }

  const next = validateGenome(structuredCloneSafe(best.mutant.genome));
  next.fitness = best.fitness;
  next.history = [...(next.history || []), record];
  return {
    champion: next,
    accepted: true,
    record,
    note: `نسل ${record.generation} پذیرفته شد — «${best.mutant.label}» با ${best.fitness.score} (قبلی ${baseFit}).`,
  };
}

/** The system prompt the model receives: fragments + measured policy, not a personality essay. */
export function genomePrompt(genome) {
  const g = validateGenome(genome);
  const lines = [
    'تو «متاکد» هستی: یک ایجنت کدنویس که روی کدِ خودش هم کار می‌کند.',
    'قواعد قطعی:',
    ...g.fragments.map((f) => `- ${PROMPT_FRAGMENTS[f]}`),
    `- برای هر تغییر دقیقاً سه نامزد بده (مینیمال، دفاعی، ساختاری). برای هر نامزد سه فرضیهٔ شکست بگو.`,
    `- سقف ${g.genes.maxSteps} گام. اگر تمام شد، صادقانه گزارش بده چه چیزی باقی مانده.`,
    `- خروجی هر فایل را کامل و قابل اجرا بنویس؛ از placeholder مثل "بقیهٔ کد" استفاده نکن.`,
  ];
  return lines.join('\n');
}

/** Compact JSON for storage; keeps the lineage but trims the deepest history. */
export function serialiseGenome(genome) {
  const g = validateGenome(genome);
  return {
    ...g,
    history: (g.history || []).slice(-40),
  };
}

/** Compare two genomes gene by gene — the Evolution view renders this as a diff table. */
export function diffGenomes(a, b) {
  const rows = [];
  const ga = validateGenome(a);
  const gb = validateGenome(b);
  for (const key of Object.keys(DEFAULT_GENES)) {
    if (JSON.stringify(ga.genes[key]) !== JSON.stringify(gb.genes[key])) {
      rows.push({ scope: 'genes', key, from: ga.genes[key], to: gb.genes[key] });
    }
  }
  for (const key of Object.keys(DEFAULT_RUBRIC)) {
    if (ga.rubric[key] !== gb.rubric[key]) rows.push({ scope: 'rubric', key, from: ga.rubric[key], to: gb.rubric[key] });
  }
  for (const key of ['minimal', 'defensive', 'structural']) {
    if (ga.strategyWeights[key] !== gb.strategyWeights[key]) {
      rows.push({ scope: 'strategyWeights', key, from: ga.strategyWeights[key], to: gb.strategyWeights[key] });
    }
  }
  return rows;
}
