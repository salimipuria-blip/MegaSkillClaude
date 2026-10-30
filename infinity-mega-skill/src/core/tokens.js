// Token math — deterministic, dependency-free, and honest about being an estimate.
//
// Why not tiktoken? It is a 2 MB wasm/binary download and this app must load instantly on a phone.
// The estimate below is monotonic, additive over segments, and calibrated on mixed Persian/Latin
// text: Persian averages ~2.0 characters per token for BPE vocabularies that grew up on English
// (most Persian letters fall into 2-byte pieces), Latin prose ~3.8, code ~3.2, and whitespace is
// cheap but not free. It errs high on purpose: a budget that under-counts silently truncates.

const SEGMENT = /(\s+)|([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)|([A-Za-z][A-Za-z0-9_$]*)|(\d+(?:[.,]\d+)*)|([\s\S])/gu;

const RATE = {
  space: 0.25,
  persian: 2.0,
  latin: 3.7,
  number: 2.4,
  punct: 0.6,
  code: 2.9,
};

/** True when a string is mostly code (fences, braces, punctuation density). */
export function looksLikeCode(text) {
  const s = String(text || '');
  if (!s) return false;
  if (/```/.test(s)) return true;
  const dense = (s.match(/[{}()[\];=<>/*+%&|!]/g) || []).length / s.length;
  const indent = (s.match(/^\s{2,}\S+/gm) || []).length;
  return dense > 0.06 || indent > 2;
}

/**
 * Estimate tokens for one string. Additive over segments so the result never jumps when text is
 * appended (important: the UI shows a live meter while streaming).
 * @param {string} text
 * @param {{code?:boolean}} [opts]
 * @returns {number} integer token estimate
 */
export function estimateTokens(text, opts = {}) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  if (!s) return 0;
  const code = opts.code ?? looksLikeCode(s);
  let total = 0;
  SEGMENT.lastIndex = 0;
  for (const m of s.matchAll(SEGMENT)) {
    const [, ws, fa, latin, num, single] = m;
    if (ws) total += ws.length * RATE.space;
    else if (fa) total += fa.length / RATE.persian;
    else if (latin) total += latin.length / (code ? RATE.code : RATE.latin);
    else if (num) total += Math.max(1, num.length / RATE.number);
    else if (single) total += RATE.punct;
  }
  return Math.max(1, Math.ceil(total));
}

/** Tokens for a chat message including the ~4-token role/wrapper overhead. */
export function messageTokens(message) {
  const content = typeof message?.content === 'string'
    ? message.content
    : JSON.stringify(message?.content ?? '');
  return estimateTokens(content) + 4;
}

/** Sum of estimated tokens over a message array. */
export function conversationTokens(messages) {
  return (messages || []).reduce((sum, m) => sum + messageTokens(m), 0);
}

/**
 * A budget that answers one question: does this still fit, and by how much did we overflow?
 * Kept as a tiny value object so the UI can render it without recomputation rules leaking around.
 */
export function makeBudget({window = 32000, used = 0} = {}) {
  const win = Math.max(1000, Math.round(window));
  const u = Math.max(0, Math.min(win, Math.round(used)));
  return {
    window: win,
    used: u,
    free: win - u,
    ratio: u / win,
    fits(extra) {
      return u + estimateTokens(extra) <= win;
    },
  };
}

/** Rough $ cost for a known price pair (USD per 1M tokens). Zero for free tiers. */
export function estimateCost(usage, price = {in: 0, out: 0}) {
  const inTok = Number(usage?.in) || 0;
  const outTok = Number(usage?.out) || 0;
  const cost = (inTok / 1e6) * (Number(price.in) || 0) + (outTok / 1e6) * (Number(price.out) || 0);
  return Math.round(cost * 1e6) / 1e6;
}

/** 12_345 -> "12.3k" — compact for the status bar. */
export function formatTokens(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 100000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(v / 1000) + 'k';
}
