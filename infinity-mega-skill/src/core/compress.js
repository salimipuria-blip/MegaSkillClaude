// Token Forge — context compression with a paper trail.
//
// The agent loops forever, so the transcript eventually exceeds any window. Dropping the oldest
// messages is the usual answer and it is wrong here: the *reason* a decision was made lives in the
// middle of a long run. Instead we atomise, deduplicate, rank and pack — then keep a digest that
// says exactly what survived and why. Every compression is reversible in the journal: the raw
// messages stay in storage, only the prompt-facing view is packed.

import { estimateTokens, messageTokens } from './tokens.js';

/** Words that mark a sentence as a constraint rather than prose. Persian + English. */
const CONSTRAINT = /(\bMUST\b|\bNEVER\b|\bALWAYS\b|همیشه|هرگز|باید|ممنوع|قانون|مجاز نیست|اجبار|only|do not|don't|without|must not|required)/i;
const NUMERIC = /(\d+[.,]?\d*\s*(%|ms|s|px|tok|KB|MB|GB|×|x)\b|\$\d|#\d{2,})/i;
const IDENT = /(`[^`]{2,60}`|\b[\w-]+\.(m?js|ts|tsx|jsx|css|html|json|md|py|sql|yml|yaml|toml)\b|\b[a-z]+[A-Z]\w{2,}\b|[\w.-]+\(\))/;
const ERRORISH = /(error|exception|failed|failing|stack|traceback|cannot|undefined|null|خطا|ناموفق|شکست)/i;
const DECISION = /(decided|chose|because|therefore|so that|تصمیم|چون|بنابراین|پس |نتیجه)/i;

const SENTENCE_SPLIT = /(?<=[.!?؟…؛;:])\s+|\n{2,}|\n(?=\s*[-*•\d])/u;

/** Normalise for equality only — never for display. */
export function normalizeForCompare(text) {
  return String(text || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Character trigrams, used for near-duplicate detection (cheap, no index needed). */
function trigrams(text) {
  const s = normalizeForCompare(text).replace(/[^\p{L}\p{N} ]/gu, '');
  const out = new Set();
  for (let i = 0; i < s.length - 2; i += 1) out.add(s.slice(i, i + 3));
  return out;
}

/** Jaccard similarity of two strings on trigrams, 0..1. */
export function similarity(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return normalizeForCompare(a) === normalizeForCompare(b) ? 1 : 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/**
 * Split a message into atoms (sentences / list items / code fences).
 * A code fence stays whole: half a function is worse than none.
 * @param {string} content
 * @param {{kind?: string, source?: string, index?: number}} [meta]
 */
export function atomize(content, meta = {}) {
  const text = String(content ?? '');
  if (!text.trim()) return [];
  const atoms = [];
  let cursor = 0;
  const fence = /```[\s\S]*?```/g;
  const push = (raw, kind) => {
    const t = raw.trim();
    if (t.length < 2) return;
    atoms.push({ text: t, kind, source: meta.source || '', order: atoms.length, base: 0 });
  };
  for (const m of text.matchAll(fence)) {
    if (m.index > cursor) splitProse(text.slice(cursor, m.index), meta, push);
    push(m[0], 'code');
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) splitProse(text.slice(cursor), meta, push);
  for (const atom of atoms) {
    atom.base = baseImportance(atom, meta.kind);
    atom.tokens = estimateTokens(atom.text, { code: atom.kind === 'code' });
  }
  return atoms;
}

function splitProse(chunk, meta, push) {
  const kind = meta.kind || 'prose';
  for (const piece of chunk.split(SENTENCE_SPLIT)) push(piece, kind);
}

function baseImportance(atom, kindHint) {
  const t = atom.text;
  let score = 1;
  if (atom.kind === 'code') score += 1.4;
  if (kindHint === 'system' || kindHint === 'law') score += 3;
  if (kindHint === 'tool') score += 0.4;
  if (CONSTRAINT.test(t)) score += 2.2;
  if (IDENT.test(t)) score += 1.1;
  if (NUMERIC.test(t)) score += 0.7;
  if (ERRORISH.test(t)) score += 1.0;
  if (DECISION.test(t)) score += 0.9;
  if (/^(ok|okay|sure|باشه|حتما)[.!]?$/i.test(t)) score -= 0.8;
  if (t.length < 12) score -= 0.4;
  // Very long atoms crowd the budget; slight penalty keeps several medium atoms over one giant.
  if (t.length > 700) score -= 0.5;
  return Math.max(0.1, score);
}

/** Query overlap (token containment) in 0..1 — a tiny BM25 stand-in with no index. */
function queryOverlap(text, queryTerms) {
  if (!queryTerms.length) return 0;
  const hay = normalizeForCompare(text);
  let hits = 0;
  for (const term of queryTerms) if (term && hay.includes(term)) hits += 1;
  return hits / queryTerms.length;
}

function terms(query) {
  return [...new Set(normalizeForCompare(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1))];
}

/**
 * Score atoms against a query and their position. Recency is a mild prior, query match is strong,
 * and a duplicate of something already kept is penalised in packAtoms via similarity().
 */
export function scoreAtoms(atoms, { query = '', recentBoost = 0.6 } = {}) {
  const q = terms(query);
  const n = Math.max(1, atoms.length);
  return atoms.map((atom, i) => {
    const recency = i / n;
    const overlap = queryOverlap(atom.text, q);
    const score = atom.base + overlap * 3 + recency * recentBoost;
    return {...atom, score};
  });
}

/** Remove near-duplicates, keeping the higher-scoring atom. */
export function dedupeAtoms(atoms, threshold = 0.82) {
  const kept = [];
  const dropped = [];
  for (const atom of atoms) {
    const twin = kept.find((k) => similarity(k.text, atom.text) >= threshold);
    if (twin) {
      dropped.push({ atom, reason: `تکرارِ «${twin.text.slice(0, 48)}…»` });
      if (atom.score > twin.score) {
        kept[kept.indexOf(twin)] = atom;
      }
      continue;
    }
    kept.push(atom);
  }
  return { kept, dropped };
}

/**
 * Greedy knapsack over atoms. Highest value-per-token first, output restored to original order so
 * the model reads a coherent story rather than a relevance salad.
 */
export function packAtoms(atoms, budget) {
  const cap = Math.max(0, Math.round(budget));
  const ranked = [...atoms].sort((a, b) => b.score / (b.tokens || 1) - a.score / (a.tokens || 1));
  const chosen = [];
  const rejected = [];
  let used = 0;
  for (const atom of ranked) {
    const cost = atom.tokens || 1;
    if (used + cost <= cap) {
      chosen.push(atom);
      used += cost;
    } else {
      rejected.push(atom);
    }
  }
  chosen.sort((a, b) => a.order - b.order);
  return { chosen, rejected, used, cap };
}

/** Extractive digest: the highest-scoring lines, one per topic, capped hard. */
export function digestAtoms(atoms, { max = 6, maxChars = 720 } = {}) {
  const ranked = [...atoms].filter((a) => a.kind !== 'code').sort((a, b) => b.score - a.score);
  const lines = [];
  let chars = 0;
  for (const atom of ranked) {
    if (lines.length >= max) break;
    const line = atom.text.replace(/\s+/g, ' ').slice(0, 180);
    if (chars + line.length > maxChars) break;
    lines.push(line);
    chars += line.length;
  }
  return lines;
}

/**
 * Compress a conversation for the prompt.
 * @param {object} input
 * @param {Array<{role:string, content:string, protected?:boolean, kind?:string}>} input.messages
 * @param {number} input.budgetTokens hard ceiling for the packed view
 * @param {string} [input.query] current goal — biases what is kept
 * @param {number} [input.keepRecent] always keep this many trailing messages verbatim
 * @param {number} [input.keepProtected] cap for protected/system messages (they are kept whole)
 * @returns {{messages:Array, digest:string, stats:object}}
 */
export function compressContext({
  messages = [],
  budgetTokens = 24000,
  query = '',
  keepRecent = 6,
} = {}) {
  const before = messages.reduce((s, m) => s + messageTokens(m), 0);
  const budget = Math.max(400, Math.round(budgetTokens));

  const protectedMsgs = messages.filter((m) => m.protected || m.role === 'system');
  const rest = messages.filter((m) => !protectedMsgs.includes(m));

  const protectedCost = protectedMsgs.reduce((s, m) => s + messageTokens(m), 0);
  const recent = rest.slice(-Math.max(0, keepRecent));
  const older = rest.slice(0, Math.max(0, rest.length - recent.length));
  const recentCost = recent.reduce((s, m) => s + messageTokens(m), 0);

  // Atoms carry their message role so the rebuilt prompt can keep the right speaker.
  const atoms = [];
  older.forEach((m, mi) => {
    for (const atom of atomize(m.content, {kind: m.kind || m.role, source: `${mi}`})) {
      atoms.push({...atom, role: m.role, msg: mi});
    }
  });

  const scored = scoreAtoms(atoms, { query });
  const { kept, dropped } = dedupeAtoms(scored);

  const roomForAtoms = Math.max(0, budget - protectedCost - recentCost - 180);
  const { chosen, rejected, used } = packAtoms(kept, roomForAtoms);
  const digestLines = digestAtoms(rejected, { max: 5 });

  const grouped = new Map();
  for (const atom of chosen) {
    const key = atom.msg;
    if (!grouped.has(key)) grouped.set(key, { role: atom.role, parts: [] });
    grouped.get(key).parts.push(atom.text);
  }
  const rebuilt = [...grouped.values()].map((g) => ({ role: g.role, content: g.parts.join('\n') }));

  const note = digestLines.length
    ? `\n\n[فشردهسازی کانتکست] ${dropped.length + rejected.length} واحد حذف شد. عصارهٔ حذفشدهها:\n- ${digestLines.join('\n- ')}`
    : '';

  // Keep the protection flag on the way out: a caller must be able to prove nothing was dropped.
  const packed = [...protectedMsgs.map((m) => ({ ...m })), ...rebuilt, ...recent.map((m) => ({ ...m }))];
  if (note) {
    const lastUser = [...packed].reverse().find((m) => m.role === 'user');
    if (lastUser) lastUser.content += note;
    else packed.push({ role: 'user', content: note.trim() });
  }

  const after = packed.reduce((s, m) => s + messageTokens(m), 0);
  const stats = {
    before,
    after,
    saved: Math.max(0, before - after),
    savedPct: before ? Math.round((Math.max(0, before - after) / before) * 1000) / 10 : 0,
    budget,
    atoms: atoms.length,
    kept: chosen.length,
    dropped: dropped.length,
    rejected: rejected.length,
    digest: digestLines.length,
    pressure: before > budget,
  };
  return { messages: packed, digest: digestLines.join('\n'), stats };
}

/** Plain-text rendering used by the Memory view and the journal export. */
export function formatCompressionReport(stats) {
  if (!stats) return 'بدون فشردهسازی';
  const dir = stats.pressure ? 'کاهش' : 'بدون فشار';
  return `${stats.before.toLocaleString('fa-IR')} → ${stats.after.toLocaleString('fa-IR')} توکن (${stats.savedPct}٪ ${dir}) · ${stats.kept} از ${stats.atoms} واحد`;
}
