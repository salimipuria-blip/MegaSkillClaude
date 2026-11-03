// Reflex: the zero-key brain.
//
// This is NOT a language model and it does not pretend to be one. It recognises the task family
// from the prompt, then emits three genuinely different implementations (minimal / defensive /
// structural). That is enough to exercise the whole machine — triad, codebreak probes, sandbox
// tests, scoring, evolution — offline, with real pass/fail results instead of a canned animation.
// For anything outside the families it writes an honest scaffold and says a model is needed.

/** Families in priority order: the more specific pattern first. */
export const FAMILIES = [
  {
    id: 'palindrome',
    test: /(پالیندروم|palindrome|متقارن|از\s*دو\s*طرف)/i,
    file: 'src/palindrome.js',
    entry: 'palindrome',
  },
  {
    id: 'parsequery',
    test: /(query\s*string|querystring|parsequery|کوئری|پارامتر(های)?\s*(آدرس|url)|تجزیهٔ?\s*آدرس)/i,
    file: 'src/parsequery.js',
    entry: 'parseQuery',
  },
  {
    id: 'groupby',
    test: /(group\s*by|groupby|گروه[‌ ]?بندی)/i,
    file: 'src/groupby.js',
    entry: 'groupBy',
  },
  {
    id: 'binarysearch',
    test: /(binary\s*search|binarysearch|جست[‌ ]?وجوی?\s*دودویی|دودویی)/i,
    file: 'src/binarysearch.js',
    entry: 'binarySearch',
  },
  { id: 'flatten', test: /(flatten|تخت|مسطح|تودرتو)/i, file: 'src/flatten.js', entry: 'flatten' },
  { id: 'chunk', test: /(chunk|تکه|قطعه|تقسیم\s*آرایه)/i, file: 'src/chunk.js', entry: 'chunk' },
  { id: 'once', test: /(once|یک[‌ ]?بار|فقط\s*بار\s*اول)/i, file: 'src/once.js', entry: 'once' },
  { id: 'digits', test: /(ارقام|رقم|digits|toenglish|۰-۹|٠-٩)/i, file: 'src/digits.js', entry: 'toEnglishDigits' },
  { id: 'fixclamp', test: /(clamp|بازه|کران|باگ)/i, file: 'src/clamp.js', entry: 'clamp' },
  { id: 'sum', test: /(جمع|مجموع|\bsum\b|total|\badd\b)/i, file: 'src/sum.js', entry: 'sum' },
];

/** Which family does this prompt ask for? null when unknown. */
export function detectFamily(text) {
  const t = String(text || '');
  return FAMILIES.find((f) => f.test.test(t)) || null;
}

const DOC = (title, contract) => `/**
 * ${title}
 * ${contract}
 */`;

const BUILDERS = {
  sum: {
    minimal: () => `export function sum(numbers) {\n  return numbers.reduce((a, b) => a + b, 0);\n}\n`,
    defensive: () => `export function sum(numbers) {
  if (!Array.isArray(numbers)) throw new TypeError('sum expects an array');
  let total = 0;
  for (const n of numbers) {
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new TypeError('every item must be a finite number');
    total += n;
  }
  return total;
}
`,
    structural: () => `${DOC('جمعِ اعداد یک آرایه', '@param {number[]} numbers @returns {number}')}
export function sum(numbers) {
  return list(numbers).reduce(add, 0);
}

function list(numbers) {
  if (!Array.isArray(numbers)) throw new TypeError('sum expects an array');
  return numbers;
}

function add(a, b) {
  return a + b;
}
`,
  },
  palindrome: {
    minimal: () => `export function palindrome(text) {
  const clean = String(text).toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '');
  return [...clean].reverse().join('') === clean;
}
`,
    defensive: () => `export function palindrome(text) {
  if (text === null || text === undefined) return false;
  // NFKC folds presentation forms; the letter/number filter drops spaces, punctuation and
  // Arabic diacritics (Mn category) without needing a hand-written exclusion list.
  const clean = String(text).normalize('NFKC').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '');
  const chars = [...clean];
  for (let i = 0, j = chars.length - 1; i < j; i += 1, j -= 1) {
    if (chars[i] !== chars[j]) return false;
  }
  return true;
}
`,
    structural: () => `${DOC('آیا متن پالیندروم است؟', 'حروف بزرگ/کوچک، فاصله و علائم نادیده گرفته می‌شوند.')}
export function palindrome(text) {
  const chars = [...normalize(text)];
  return chars.every((ch, i) => ch === chars[chars.length - 1 - i]);
}

/** Letters and digits only, NFKC-normalised, lower-cased. */
export function normalize(text) {
  if (text === null || text === undefined) return '';
  return String(text).normalize('NFKC').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '');
}
`,
  },
  chunk: {
    minimal: () => `export function chunk(items, size) {
  if (size < 1) throw new RangeError('size must be >= 1');
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
`,
    defensive: () => `export function chunk(items, size) {
  if (!Array.isArray(items)) throw new TypeError('chunk expects an array');
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be a positive integer');
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
`,
    structural: () => `${DOC('تقسیم آرایه به تکه‌های هم‌اندازه', '@param {Array} items @param {number} size @returns {Array<Array>}')}
export function chunk(items, size) {
  assertSize(size);
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}

function assertSize(size) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be a positive integer');
}
`,
  },
  once: {
    minimal: () => `export function once(fn) {
  let done = false;
  let value;
  return function (...args) {
    if (!done) {
      done = true;
      value = fn.apply(this, args);
    }
    return value;
  };
}
`,
    defensive: () => `export function once(fn) {
  if (typeof fn !== 'function') throw new TypeError('once expects a function');
  let called = false;
  let result;
  return function onceWrapper(...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}
`,
    structural: () => `${DOC('اجرای یک‌بارهٔ تابع', 'نتیجهٔ اولین فراخوانی برای همیشه برگردانده می‌شود.')}
export function once(fn) {
  const memo = new Map();
  return function (...args) {
    if (!memo.has('v')) memo.set('v', fn.apply(this, args));
    return memo.get('v');
  };
}
`,
  },
  groupby: {
    minimal: () => `export function groupBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = out[key] || [];
    out[key].push(item);
  }
  return out;
}
`,
    defensive: () => `export function groupBy(items, keyFn) {
  if (!Array.isArray(items)) throw new TypeError('groupBy expects an array');
  if (typeof keyFn !== 'function') throw new TypeError('groupBy expects a key function');
  const out = Object.create(null);
  for (const item of items) {
    const key = String(keyFn(item));
    if (!out[key]) out[key] = [];
    out[key].push(item);
  }
  return out;
}
`,
    structural: () => `${DOC('گروه‌بندی آیتم‌ها با تابع کلید', '@param {Array} items @param {(item:any)=>string} keyFn')}
export function groupBy(items, keyFn) {
  return items.reduce((acc, item) => append(acc, keyFn(item), item), {});
}

function append(acc, key, item) {
  const k = String(key);
  if (!acc[k]) acc[k] = [];
  acc[k].push(item);
  return acc;
}
`,
  },
  flatten: {
    minimal: () => `export function flatten(items) {
  return items.flat(Infinity);
}
`,
    defensive: () => `export function flatten(items) {
  if (!Array.isArray(items)) throw new TypeError('flatten expects an array');
  const out = [];
  const walk = (list) => {
    for (const item of list) {
      if (Array.isArray(item)) walk(item);
      else out.push(item);
    }
  };
  walk(items);
  return out;
}
`,
    structural: () => `${DOC('تخت‌کردن آرایه در هر عمق', 'مقادیر falsy مثل 0 و null حفظ می‌شوند.')}
export function flatten(items) {
  return depth(items, 0);
}

function depth(value, level) {
  if (!Array.isArray(value)) return [value];
  if (level > 64) throw new RangeError('array nesting is too deep');
  return value.flatMap((item) => depth(item, level + 1));
}
`,
  },
  parsequery: {
    minimal: () => `export function parseQuery(qs) {
  const out = {};
  const clean = String(qs || '').replace(/^\\?/, '');
  if (!clean) return out;
  for (const pair of clean.split('&')) {
    if (!pair) continue;
    const [k, ...rest] = pair.split('=');
    const key = decodeURIComponent(k.replace(/\\+/g, ' '));
    out[key] = rest.length ? decodeURIComponent(rest.join('=').replace(/\\+/g, ' ')) : '';
  }
  return out;
}
`,
    defensive: () => `export function parseQuery(qs) {
  if (qs === null || qs === undefined) return {};
  const out = Object.create(null);
  const clean = String(qs).trim().replace(/^\\?/, '');
  if (!clean) return {};
  for (const pair of clean.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawVal = eq === -1 ? '' : pair.slice(eq + 1);
    out[safeDecode(rawKey)] = safeDecode(rawVal);
  }
  return out;
}

function safeDecode(raw) {
  const spaced = String(raw).replace(/\\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}
`,
    structural: () => `${DOC('تجزیهٔ query string به شیء', 'کلید بدون مقدار به رشتهٔ خالی نگاشت می‌شود.')}
export function parseQuery(qs) {
  return segments(qs).reduce((acc, part) => assign(acc, part), {});
}

function segments(qs) {
  const clean = String(qs || '').trim().replace(/^\\?/, '');
  return clean ? clean.split('&').filter(Boolean) : [];
}

function assign(acc, pair) {
  const eq = pair.indexOf('=');
  const key = decode(eq === -1 ? pair : pair.slice(0, eq));
  acc[key] = eq === -1 ? '' : decode(pair.slice(eq + 1));
  return acc;
}

function decode(raw) {
  return decodeURIComponent(String(raw).replace(/\\+/g, ' '));
}
`,
  },
  digits: {
    minimal: () => `const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

export function toEnglishDigits(text) {
  return String(text).replace(/[۰-۹٠-٩]/g, (d) => String(FA.indexOf(d) === -1 ? AR.indexOf(d) : FA.indexOf(d)));
}
`,
    defensive: () => `const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';

export function toEnglishDigits(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[\\u06F0-\\u06F9\\u0660-\\u0669]/g, (digit) => {
    const fa = PERSIAN.indexOf(digit);
    return fa !== -1 ? String(fa) : String(ARABIC.indexOf(digit));
  });
}
`,
    structural: () => `${DOC('ارقام فارسی/عربی به لاتین', 'فقط ارقام تغییر می‌کنند؛ بقیهٔ متن دست‌نخورده می‌ماند.')}
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';

export function toEnglishDigits(text) {
  return [...String(text ?? '')].map(convert).join('');
}

function convert(ch) {
  const fa = PERSIAN.indexOf(ch);
  if (fa !== -1) return String(fa);
  const ar = ARABIC.indexOf(ch);
  if (ar !== -1) return String(ar);
  return ch;
}
`,
  },
  binarysearch: {
    minimal: () => `export function binarySearch(sorted, target) {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] === target) return mid;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
`,
    defensive: () => `export function binarySearch(sorted, target) {
  if (!Array.isArray(sorted)) throw new TypeError('binarySearch expects an array');
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    const value = sorted[mid];
    if (value === target) return mid;
    if (value < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
`,
    structural: () => `${DOC('جست‌وجوی دودویی', '@returns {number} اندیس یا ‎-1')}
export function binarySearch(sorted, target) {
  let range = { lo: 0, hi: sorted.length - 1 };
  while (range.lo <= range.hi) {
    const mid = middle(range);
    if (sorted[mid] === target) return mid;
    range = sorted[mid] < target ? { lo: mid + 1, hi: range.hi } : { lo: range.lo, hi: mid - 1 };
  }
  return -1;
}

function middle({ lo, hi }) {
  return lo + Math.floor((hi - lo) / 2);
}
`,
  },
  fixclamp: {
    minimal: () => `export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
`,
    defensive: () => `export function clamp(value, min, max) {
  if (![value, min, max].every((n) => typeof n === 'number' && !Number.isNaN(n))) {
    throw new TypeError('clamp expects three numbers');
  }
  if (min > max) throw new RangeError('min must not be greater than max');
  return Math.min(Math.max(value, min), max);
}
`,
    structural: () => `${DOC('محدودکردن مقدار به بازه', 'اگر value کمتر از min باشد min و اگر بیشتر از max باشد max برمی‌گردد.')}
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
`,
  },
};

/** Strategies the triad explores. Order matters: it is the tie-break order. */
export const STRATEGIES = [
  { id: 'A', key: 'minimal', label: 'مینیمال', blurb: 'کمترین تغییر، کمترین سطح حمله' },
  { id: 'B', key: 'defensive', label: 'دفاعی', blurb: 'اعتبارسنجی ورودی و حالت‌های مرزی' },
  { id: 'C', key: 'structural', label: 'ساختاری', blurb: 'تابع‌های کوچک، نام‌گذاری و مستندسازی' },
];

/**
 * Solve a known task with one strategy.
 * @param {object} task eval task ({id, files, entry, prompt})
 * @param {string} strategy minimal|defensive|structural
 * @returns {{ok:boolean, path:string, content:string, family:string, strategy:string, note:string}}
 */
export function reflexSolve(task, strategy = 'defensive') {
  const family = FAMILIES.find((f) => f.id === task?.id) || detectFamily(task?.prompt || '');
  if (!family) return {ok: false, reason: 'family-unknown'};
  const builder = BUILDERS[family.id];
  if (!builder) return {ok: false, reason: 'no-builder'};
  const key = STRATEGIES.some((s) => s.key === strategy) ? strategy : 'defensive';
  const content = builder[key]();
  const path = task?.files ? Object.keys(task.files).find((p) => !/\.test\./.test(p)) || family.file : family.file;
  return {
    ok: true,
    path,
    content,
    family: family.id,
    strategy: key,
    entry: family.entry,
    note: `${family.entry} · ${key}`,
  };
}

/** A scaffold for prompts outside the families — clearly unfinished, never fake-green. */
export function reflexScaffold(prompt) {
  const name = guessName(prompt) || 'solve';
  const file = `src/${name}.js`;
  const content = `// ساخته‌شده در حالت بدون کلید (Reflex). این فایل اسکلت است، نه راه‌حل.
// برای تولید واقعی، در «تنظیمات» یک ارائه‌دهنده و کلید اضافه کن.

/** @param {unknown} input */
export function ${name}(input) {
  throw new Error('not implemented: ${name}');
}
`;
  return { ok: true, path: file, content, family: 'scaffold', entry: name, note: 'اسکلت' };
}

function guessName(prompt) {
  const m = /(?:تابع|function|متد|method)\s+[`"']?([a-zA-Z_$][\w$]*)/.exec(String(prompt || ''));
  if (m) return m[1];
  const latin = String(prompt || '').match(/\b[a-z][a-zA-Z0-9]{3,}\b/);
  return latin ? latin[0] : 'solve';
}

/** Whether Reflex can produce a verified solution, used to label the UI honestly. */
export function reflexCovers(text) {
  return Boolean(detectFamily(text));
}

/** The first eval task whose prompt matches this text (used by "اجرای بنچمارک" from chat). */
export function taskForPrompt(text, tasks) {
  const family = detectFamily(text);
  if (!family) return null;
  return (tasks || []).find((t) => t.id === family.id) || null;
}
