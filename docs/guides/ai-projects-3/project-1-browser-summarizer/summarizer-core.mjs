// Pure helpers for the in-browser summariser: no DOM, no network, no model.
// Everything here is imported by both the Web Worker and the Node test file, so the
// behaviour the tutorial describes is the behaviour that runs.
//
// Why the split: a Web Worker cannot be loaded by `node --test`, and a UI cannot be
// asserted in CI without a browser. Keeping the decisions (trim, parse, clamp) in a
// pure module is what makes a browser-only project testable at all.

/** The ONNX model. `dtype: 'q8'` is the difference between ~310 MB and ~1.1 GB. */
export const MODEL = 'Xenova/distilbart-cnn-6-6';
export const DTYPE = 'q8';

/** BART's encoder is 1024 tokens; 8000 characters is a safe Persian/English ceiling. */
export const MAX_INPUT_CHARS = 8000;
export const MIN_INPUT_CHARS = 40;

/** Generation bounds. `max_new_tokens` is what actually costs time in the browser. */
export const TOKEN_RANGE = Object.freeze([32, 256]);
export const DEFAULT_TOKENS = 128;

/** Sentence terminators in both scripts. `؟` (Arabic question mark) is not `?`. */
const SENTENCE_END = /[.!?؟…۔]\s/gu;

/** Collapse the whitespace a textarea produces without touching Persian ZWNJ (U+200C). */
export function normalizeText(raw) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Cut `raw` to at most `maxChars` **at a sentence boundary** when one is close to the end.
 * Cutting mid-sentence is what makes a summariser hallucinate a continuation, so the
 * function only accepts a boundary that keeps at least 60% of the budget.
 *
 * @returns {{text: string, truncated: boolean, reason: ''|'empty'|'too-short'}}
 */
export function prepareText(raw, maxChars = MAX_INPUT_CHARS) {
  const text = normalizeText(raw);
  if (!text) return { text: '', truncated: false, reason: 'empty' };
  if (text.length < MIN_INPUT_CHARS) return { text, truncated: false, reason: 'too-short' };
  if (text.length <= maxChars) return { text, truncated: false, reason: '' };

  const window = text.slice(0, maxChars);
  let cut = -1;
  for (const match of window.matchAll(SENTENCE_END)) {
    const at = match.index + 1; // keep the terminator itself
    if (at >= Math.floor(maxChars * 0.6)) cut = at;
  }
  const head = cut > 0 ? window.slice(0, cut) : window;
  return { text: head.trim(), truncated: true, reason: '' };
}

/** Clamp a token budget into the range the model tolerates, as an integer. */
export function clampTokens(value, { min = TOKEN_RANGE[0], max = TOKEN_RANGE[1] } = {}) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_TOKENS;
  return Math.min(max, Math.max(min, n));
}

/** The options object transformers.js expects. Exported so the test can lock it. */
export function generationOptions(maxNewTokens = DEFAULT_TOKENS) {
  return { max_new_tokens: clampTokens(maxNewTokens) };
}

/**
 * Read the summary out of whatever the pipeline returned.
 *
 * Across transformers.js versions a summarisation call answers with `[{summary_text}]`
 * (BART) or `[{generated_text}]` (seq2seq fallbacks), and a single object when the input
 * was a single string in some revisions. Reading only one shape is the most common reason
 * a copy-pasted snippet prints `undefined`, so all of them are handled here.
 *
 * @returns {string|null} the trimmed summary, or null when there is nothing usable
 */
export function readSummary(output) {
  const first = Array.isArray(output) ? output[0] : output;
  if (typeof first === 'string') return first.trim() || null;
  if (!first || typeof first !== 'object') return null;
  for (const key of ['summary_text', 'generated_text', 'text']) {
    const value = first[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Map a transformers.js progress event to an integer percentage, or null when the event
 * is not a byte-progress event (initiate/download/done/ready carry no honest number).
 */
export function progressPercent(event) {
  if (!event || typeof event !== 'object') return null;
  const { status, progress, loaded, total } = event;
  if (status !== 'progress' && status !== 'download') return null;
  if (Number.isFinite(loaded) && Number.isFinite(total) && total > 0) {
    return Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
  }
  if (Number.isFinite(progress)) return Math.min(100, Math.max(0, Math.round(progress)));
  return null;
}

/** Human-readable byte size for the "what will this download" line. */
export function humanBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/**
 * The user-facing notice about what this page downloads. Measured from the model repo's
 * ONNX file sizes, not guessed: the quantised pair is ~310 MB, the fp32 pair ~1.1 GB.
 */
export function downloadNotice() {
  return `اولین اجرا مدل ${MODEL} را در حالت ${DTYPE} دانلود و در مرورگر کش می‌کند (حدود ۳۱۰ مگابایت). ` +
    'داده‌ی متن هرگز از دستگاه خارج نمی‌شود، ولی خودِ مدل از CDN هاگینگ‌فیس گرفته می‌شود.';
}
