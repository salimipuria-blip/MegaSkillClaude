// Benchmark suite: the ground truth the agent is scored against.
//
// Every task is real JavaScript that runs in the sandbox. Public cases are shown to the agent;
// hidden cases are not, and they are the difference between "made the tests pass" and "solved the
// problem". Fitness uses both, weighted towards hidden cases on purpose.

/** @typedef {{name:string, fn?:string, args?:any[], expr?:string, expect:any}} Case */

export const TASKS = [
  {
    id: 'sum',
    title: 'جمعِ فهرست اعداد',
    level: 1,
    tags: ['array', 'number'],
    prompt: 'تابع sum(numbers) را بنویس که مجموع اعداد یک آرایه را برگرداند؛ آرایهٔ خالی باید ۰ بدهد.',
    files: {
      'src/sum.js': `export function sum(numbers) {\n  // TODO\n}\n`,
      'src/sum.test.js': `import {sum} from './sum.js';\nexport const cases = [\n  {name: 'empty', fn: 'sum', args: [[]], expect: 0},\n  {name: 'basic', fn: 'sum', args: [[1, 2, 3]], expect: 6},\n  {name: 'negatives', fn: 'sum', args: [[5, -2, -3]], expect: 0},\n];\n`,
    },
    entry: ['sum'],
    cases: [
      {name: 'empty list', fn: 'sum', args: [[]], expect: 0},
      {name: 'basic list', fn: 'sum', args: [[1, 2, 3]], expect: 6},
      {name: 'negatives cancel', fn: 'sum', args: [[5, -2, -3]], expect: 0},
    ],
    hidden: [
      {name: 'floats', fn: 'sum', args: [[0.5, 0.25]], expect: 0.75},
      {name: 'large ints', fn: 'sum', args: [[1e6, 2e6]], expect: 3e6},
    ],
  },
  {
    id: 'palindrome',
    title: 'پالیندروم با نادیده‌گرفتن علائم',
    level: 2,
    tags: ['string', 'unicode'],
    prompt: 'تابع palindrome(text) را کامل کن: حروف بزرگ/کوچک، فاصله و علائم را نادیده بگیر و true بده اگر متن از دو طرف یکسان است.',
    files: {
      'src/palindrome.js': `export function palindrome(text) {\n  // TODO: Unicode-aware, case-insensitive, punctuation-blind\n}\n`,
      'src/palindrome.test.js': `import {palindrome} from './palindrome.js';\nexport const cases = [\n  {name: 'sentence', fn: 'palindrome', args: ["Madam, I'm Adam"], expect: true},\n  {name: 'negative', fn: 'palindrome', args: ['apex'], expect: false},\n];\n`,
    },
    entry: ['palindrome'],
    cases: [
      {name: 'sentence with punctuation', fn: 'palindrome', args: ["Madam, I'm Adam"], expect: true},
      {name: 'not a palindrome', fn: 'palindrome', args: ['apex'], expect: false},
    ],
    hidden: [
      {name: 'empty string', fn: 'palindrome', args: [''], expect: true},
      {name: 'persian word', fn: 'palindrome', args: ['دود'], expect: true},
      {name: 'digits', fn: 'palindrome', args: ['12-21'], expect: true},
    ],
  },
  {
    id: 'chunk',
    title: 'تقسیم آرایه به تکه‌ها',
    level: 2,
    tags: ['array'],
    prompt: 'تابع chunk(items, size) را بنویس؛ برای size کوچک‌تر از ۱ باید RangeError پرتاب کند.',
    files: {
      'src/chunk.js': `export function chunk(items, size) {\n  // TODO\n}\n`,
      'src/chunk.test.js': `import {chunk} from './chunk.js';\nexport const cases = [\n  {name: 'even split', fn: 'chunk', args: [[1, 2, 3, 4], 2], expect: [[1, 2], [3, 4]]},\n  {name: 'remainder', fn: 'chunk', args: [[1, 2, 3], 2], expect: [[1, 2], [3]]},\n];\n`,
    },
    entry: ['chunk'],
    cases: [
      {name: 'even split', fn: 'chunk', args: [[1, 2, 3, 4], 2], expect: [[1, 2], [3, 4]]},
      {name: 'remainder', fn: 'chunk', args: [[1, 2, 3], 2], expect: [[1, 2], [3]]},
    ],
    hidden: [
      {name: 'empty input', fn: 'chunk', args: [[], 3], expect: []},
      {name: 'size larger than input', fn: 'chunk', args: [[1], 5], expect: [[1]]},
      {name: 'invalid size throws', fn: 'chunk', args: [[1, 2], 0], expect: 'THROWS'},
    ],
  },
  {
    id: 'once',
    title: 'فراخوانی فقط یک‌بار',
    level: 2,
    tags: ['closure', 'function'],
    prompt: 'تابع once(fn) را بنویس: تابعی برگرداند که فقط بار اول fn را صدا بزند و بعد همان نتیجهٔ اول را برگرداند.',
    files: {
      'src/once.js': `export function once(fn) {\n  // TODO\n}\n`,
      'src/once.test.js': `import {once} from './once.js';\nexport const cases = [\n  {name: 'runs once', expr: "(() => { let n = 0; const f = once(() => ++n); f(); f(); f(); return n; })()", expect: 1},\n  {name: 'returns first value', expr: '(() => { const f = once((x) => x * 2); return [f(2), f(5)]; })()', expect: [4, 4]},\n];\n`,
    },
    entry: ['once'],
    cases: [
      {name: 'runs once', expr: '(() => { let n = 0; const f = once(() => ++n); f(); f(); f(); return n; })()', expect: 1},
      {name: 'returns first value', expr: '(() => { const f = once((x) => x * 2); return [f(2), f(5)]; })()', expect: [4, 4]},
    ],
    hidden: [
      {name: 'keeps this binding result', expr: '(() => { const f = once(function (a, b) { return a + b; }); return f(1, 2); })()', expect: 3},
      {name: 'works with no args', expr: '(() => { const f = once(() => "ok"); return f(); })()', expect: 'ok'},
    ],
  },
  {
    id: 'groupby',
    title: 'گروه‌بندی با تابع کلید',
    level: 3,
    tags: ['array', 'object', 'function'],
    prompt: 'تابع groupBy(items, keyFn) را بنویس که آیتم‌ها را بر اساس خروجی keyFn در یک شیء گروه‌بندی کند.',
    files: {
      'src/groupby.js': `export function groupBy(items, keyFn) {\n  // TODO\n}\n`,
      'src/groupby.test.js': `import {groupBy} from './groupby.js';\nexport const cases = [\n  {name: 'by parity', expr: 'groupBy([1, 2, 3, 4], (n) => (n % 2 ? "odd" : "even"))', expect: {odd: [1, 3], even: [2, 4]}},\n];\n`,
    },
    entry: ['groupBy'],
    cases: [
      {name: 'by parity', expr: 'groupBy([1, 2, 3, 4], (n) => (n % 2 ? "odd" : "even"))', expect: {odd: [1, 3], even: [2, 4]}},
      {name: 'single bucket', expr: 'groupBy(["a", "b"], () => "same")', expect: {same: ['a', 'b']}},
    ],
    hidden: [
      {name: 'empty list', expr: 'groupBy([], (n) => n)', expect: {}},
      {name: 'string keys', expr: 'groupBy(["a", "bb", "cc"], (s) => s.length)', expect: {1: ['a'], 2: ['bb', 'cc']}},
    ],
  },
  {
    id: 'flatten',
    title: 'تخت‌کردن آرایهٔ تودرتو',
    level: 2,
    tags: ['array', 'recursion'],
    prompt: 'تابع flatten(items) را بنویس که آرایه را در هر عمقی به یک سطح تخت کند.',
    files: {
      'src/flatten.js': `export function flatten(items) {\n  // TODO\n}\n`,
      'src/flatten.test.js': `import {flatten} from './flatten.js';\nexport const cases = [\n  {name: 'two levels', fn: 'flatten', args: [[1, [2, 3], [4, [5]]]], expect: [1, 2, 3, 4, 5]},\n];\n`,
    },
    entry: ['flatten'],
    cases: [
      {name: 'deep mix', fn: 'flatten', args: [[1, [2, 3], [4, [5]]]], expect: [1, 2, 3, 4, 5]},
      {name: 'already flat', fn: 'flatten', args: [[1, 2, 3]], expect: [1, 2, 3]},
    ],
    hidden: [
      {name: 'empty', fn: 'flatten', args: [[]], expect: []},
      {name: 'only empty arrays', fn: 'flatten', args: [[[], [[]]]], expect: []},
      {name: 'keeps zeros', fn: 'flatten', args: [[0, [false, null]]], expect: [0, false, null]},
    ],
  },
  {
    id: 'parsequery',
    title: 'تجزیهٔ query string',
    level: 3,
    tags: ['string', 'url'],
    prompt: 'تابع parseQuery(qs) را بنویس: ورودی مثل "?a=1&b=hello%20world" را به شیء تبدیل کند، "+" را فاصله بداند و کلیدهای بدون مقدار را به رشتهٔ خالی نگاشت کند.',
    files: {
      'src/parsequery.js': `export function parseQuery(qs) {\n  // TODO\n}\n`,
      'src/parsequery.test.js': `import {parseQuery} from './parsequery.js';\nexport const cases = [\n  {name: 'simple', fn: 'parseQuery', args: ['?a=1&b=2'], expect: {a: '1', b: '2'}},\n];\n`,
    },
    entry: ['parseQuery'],
    cases: [
      {name: 'simple pair', fn: 'parseQuery', args: ['?a=1&b=2'], expect: {a: '1', b: '2'}},
      {name: 'decoding', fn: 'parseQuery', args: ['x=hello%20world&y=a+b'], expect: {x: 'hello world', y: 'a b'}},
    ],
    hidden: [
      {name: 'no question mark', fn: 'parseQuery', args: ['a=1'], expect: {a: '1'}},
      {name: 'empty value', fn: 'parseQuery', args: ['flag&k=v'], expect: {flag: '', k: 'v'}},
      {name: 'empty input', fn: 'parseQuery', args: [''], expect: {}},
    ],
  },
  {
    id: 'digits',
    title: 'تبدیل ارقام فارسی/عربی به لاتین',
    level: 2,
    tags: ['unicode', 'string', 'persian'],
    prompt: 'تابع toEnglishDigits(text) را بنویس که ارقام فارسی (۰-۹) و عربی (٠-٩) را به ارقام لاتین تبدیل کند و بقیهٔ متن را دست‌نخورده بگذارد.',
    files: {
      'src/digits.js': `export function toEnglishDigits(text) {\n  // TODO\n}\n`,
      'src/digits.test.js': `import {toEnglishDigits} from './digits.js';\nexport const cases = [\n  {name: 'persian', fn: 'toEnglishDigits', args: ['۱۲۳'], expect: '123'},\n];\n`,
    },
    entry: ['toEnglishDigits'],
    cases: [
      {name: 'persian digits', fn: 'toEnglishDigits', args: ['۱۲۳'], expect: '123'},
      {name: 'arabic digits', fn: 'toEnglishDigits', args: ['٤٥٦'], expect: '456'},
    ],
    hidden: [
      {name: 'mixed text', fn: 'toEnglishDigits', args: ['قیمت ۱۲ تومان'], expect: 'قیمت 12 تومان'},
      {name: 'already latin', fn: 'toEnglishDigits', args: ['abc 789'], expect: 'abc 789'},
      {name: 'empty', fn: 'toEnglishDigits', args: [''], expect: ''},
    ],
  },
  {
    id: 'binarysearch',
    title: 'جست‌وجوی دودویی',
    level: 3,
    tags: ['algorithm', 'array'],
    prompt: 'تابع binarySearch(sorted, target) را بنویس که اندیس هدف در آرایهٔ مرتب را برگرداند یا اگر نبود ‎-1.',
    files: {
      'src/binarysearch.js': `export function binarySearch(sorted, target) {\n  // TODO\n}\n`,
      'src/binarysearch.test.js': `import {binarySearch} from './binarysearch.js';\nexport const cases = [\n  {name: 'found', fn: 'binarySearch', args: [[1, 3, 5, 7], 5], expect: 2},\n  {name: 'missing', fn: 'binarySearch', args: [[1, 3, 5], 4], expect: -1},\n];\n`,
    },
    entry: ['binarySearch'],
    cases: [
      {name: 'finds middle', fn: 'binarySearch', args: [[1, 3, 5, 7], 5], expect: 2},
      {name: 'missing', fn: 'binarySearch', args: [[1, 3, 5], 4], expect: -1},
    ],
    hidden: [
      {name: 'empty array', fn: 'binarySearch', args: [[], 1], expect: -1},
      {name: 'first element', fn: 'binarySearch', args: [[1, 2, 3], 1], expect: 0},
      {name: 'last element', fn: 'binarySearch', args: [[1, 2, 3], 3], expect: 2},
    ],
  },
  {
    id: 'fixclamp',
    title: 'رفع باگ clamp',
    level: 2,
    tags: ['bugfix', 'number'],
    prompt: 'تابع clamp(value, min, max) باگ دارد: هر مقدار بزرگ‌تر از min را max برمی‌گرداند. باگ را با کمترین تغییر رفع کن.',
    files: {
      'src/clamp.js': `export function clamp(value, min, max) {\n  return value < min ? min : max;\n}\n`,
      'src/clamp.test.js': `import {clamp} from './clamp.js';\nexport const cases = [\n  {name: 'inside range', fn: 'clamp', args: [5, 0, 10], expect: 5},\n  {name: 'below range', fn: 'clamp', args: [-5, 0, 10], expect: 0},\n  {name: 'above range', fn: 'clamp', args: [50, 0, 10], expect: 10},\n];\n`,
    },
    entry: ['clamp'],
    cases: [
      {name: 'inside range', fn: 'clamp', args: [5, 0, 10], expect: 5},
      {name: 'below range', fn: 'clamp', args: [-5, 0, 10], expect: 0},
      {name: 'above range', fn: 'clamp', args: [50, 0, 10], expect: 10},
    ],
    hidden: [
      {name: 'on the bounds', fn: 'clamp', args: [10, 0, 10], expect: 10},
      {name: 'expanded range', fn: 'clamp', args: [3, 5, 9], expect: 5},
      {name: 'floats', fn: 'clamp', args: [0.5, 0, 1], expect: 0.5},
    ],
  },
];

export const TASK_BY_ID = new Map(TASKS.map((t) => [t.id, t]));

/** Public view: what the agent is allowed to see (never the hidden cases). */
export function publicTask(task) {
  return {
    id: task.id,
    title: task.title,
    level: task.level,
    tags: task.tags,
    prompt: task.prompt,
    files: task.files,
    entry: task.entry,
    cases: task.cases,
  };
}

/**
 * Score a run: correctness on public + hidden cases, weighted 40/60, and a small penalty for
 * throwing instead of returning (a thrown case is a crash, not a wrong answer).
 */
export function scoreRun({publicResults = [], hiddenResults = []} = {}) {
  const pack = (results, weight) => {
    if (!results.length) return {score: 0, pass: 0, total: 0, weight};
    const pass = results.filter((r) => r.pass).length;
    const crash = results.filter((r) => String(r.got || '').startsWith('throws:')).length;
    const raw = pass / results.length;
    return {score: Math.max(0, raw - crash * 0.05 * (1 - raw)), pass, total: results.length, weight};
  };
  const pub = pack(publicResults, 0.4);
  const hid = pack(hiddenResults, hiddenResults.length ? 0.6 : 0);
  const denom = pub.weight + hid.weight || 1;
  const score = (pub.score * pub.weight + hid.score * hid.weight) / denom;
  return {
    score: Math.round(score * 1000) / 1000,
    public: pub,
    hidden: hid,
    solved: score >= 0.999,
  };
}

/** Suite-level aggregate used by genome fitness: mean score, variance, and a solve count. */
export function scoreSuite(results) {
  const scored = results.map((r) => {
    if (r && typeof r.score === 'number') return r; // already a scoreRun result
    if (r && r.score && typeof r.score.score === 'number') return r.score;
    return scoreRun(r);
  });
  const mean = scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : 0;
  const variance = scored.length
    ? scored.reduce((s, r) => s + (r.score - mean) ** 2, 0) / scored.length
    : 0;
  return {
    mean: Math.round(mean * 1000) / 1000,
    variance: Math.round(variance * 10000) / 10000,
    solved: scored.filter((r) => r.solved).length,
    total: scored.length,
  };
}
