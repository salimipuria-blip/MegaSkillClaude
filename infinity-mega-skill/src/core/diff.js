// Unified diff: create, apply, and measure. No dependency, line-based LCS.
//
// The agent must never rewrite a 400-line file to change one line: the diff is the unit of work,
// the review surface and the rollback record. applyPatch() is strict on purpose — a patch that
// does not apply exactly is an error the agent has to look at, not a fuzzy merge it can slide past.

/** Split text into lines without inventing a trailing empty line for a trailing newline. */
export function splitLines(text) {
  const s = String(text ?? '');
  if (s === '') return [];
  const lines = s.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** LCS table -> edit script. O(n*m) time/space; files here are small and diffing is occasional. */
function lcsMatrix(a, b) {
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

/** Returns ops: {type:'eq'|'del'|'add', line}. */
export function diffOps(oldText, newText) {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const table = lcsMatrix(a, b);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ type: 'eq', line: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: 'del', line: a[i] });
      i += 1;
    } else {
      ops.push({ type: 'add', line: b[j] });
      j += 1;
    }
  }
  while (i < a.length) ops.push({ type: 'del', line: a[i++] });
  while (j < b.length) ops.push({ type: 'add', line: b[j++] });
  return ops;
}

/**
 * Unified diff with N lines of context, compatible with `git apply` / `patch -p0`.
 * @returns {string} empty string when the texts are identical
 */
export function createPatch(oldText, newText, { path = 'file', context = 3, header = true } = {}) {
  const ops = diffOps(oldText, newText);
  const changes = [];
  ops.forEach((op, idx) => {
    if (op.type !== 'eq') changes.push(idx);
  });
  if (!changes.length) return '';

  // Merge changes whose context windows touch; that is exactly what makes one hunk.
  const groups = [];
  let group = { first: changes[0], last: changes[0] };
  for (const idx of changes.slice(1)) {
    if (idx - group.last <= context * 2) group.last = idx;
    else {
      groups.push(group);
      group = { first: idx, last: idx };
    }
  }
  groups.push(group);

  const out = [];
  if (header) out.push(`--- a/${path}`, `+++ b/${path}`);

  for (const g of groups) {
    const start = Math.max(0, g.first - context);
    const end = Math.min(ops.length, g.last + context + 1);
    const slice = ops.slice(start, end);

    // Line numbers: 1-based, count of old-new lines consumed before `start`.
    let oldStart = 1;
    let newStart = 1;
    for (let k = 0; k < start; k += 1) {
      if (ops[k].type !== 'add') oldStart += 1;
      if (ops[k].type !== 'del') newStart += 1;
    }
    let oldCount = 0;
    let newCount = 0;
    const body = [];
    for (const op of slice) {
      if (op.type === 'eq') {
        body.push(` ${op.line}`);
        oldCount += 1;
        newCount += 1;
      } else if (op.type === 'del') {
        body.push(`-${op.line}`);
        oldCount += 1;
      } else {
        body.push(`+${op.line}`);
        newCount += 1;
      }
    }
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    out.push(...body);
  }
  return `${out.join('\n')}\n`;
}

/** Stats used by the rubric: how big is this change, really? */
export function patchStats(patch) {
  const lines = splitLines(patch);
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added += 1;
    else if (line.startsWith('-')) removed += 1;
  }
  return { added, removed, churn: added + removed, hunks: (patch.match(/^@@/gm) || []).length };
}

/** Parse a unified diff into hunks with explicit old/new coordinates. */
export function parsePatch(patch) {
  const lines = splitLines(patch);
  const hunks = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m) {
      current = {
        oldStart: Number(m[1]),
        oldCount: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]),
        newCount: m[4] === undefined ? 1 : Number(m[4]),
        body: [],
      };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    const tag = line[0];
    if (tag === ' ' || tag === '-' || tag === '+') current.body.push({ tag, text: line.slice(1) });
    else if (tag === '\\') continue; // "\ No newline at end of file"
  }
  return hunks;
}

/**
 * Apply a unified diff strictly.
 * @returns {{text:string, applied:number}}
 * @throws {Error} when a hunk does not match the target text
 */
export function applyPatch(oldText, patch) {
  const src = String(oldText ?? '');
  const original = splitLines(src);
  const hunks = parsePatch(patch);
  if (!hunks.length) {
    if (!String(patch).trim()) return { text: src, applied: 0 };
    throw new Error('patch has no hunks');
  }
  const out = [];
  let cursor = 0; // 0-based index into original
  let applied = 0;

  for (const hunk of hunks) {
    const target = Math.max(0, hunk.oldStart - 1);
    if (target < cursor) throw new Error(`hunk overlaps previous hunk at line ${hunk.oldStart}`);
    while (cursor < target) out.push(original[cursor++]);

    let probe = cursor;
    for (const { tag, text } of hunk.body) {
      if (tag === '+') {
        out.push(text);
        continue;
      }
      if (original[probe] === undefined) {
        throw new Error(`patch expects line ${probe + 1} but the file ends at ${original.length}`);
      }
      if (original[probe] !== text) {
        throw new Error(
          `patch mismatch at line ${probe + 1}\n  expected: ${JSON.stringify(text)}\n  found:    ${JSON.stringify(original[probe])}`,
        );
      }
      if (tag === ' ') out.push(original[probe]);
      probe += 1;
    }
    cursor = probe;
    applied += 1;
  }
  while (cursor < original.length) out.push(original[cursor++]);

  let text = out.join('\n');
  if (out.length && src.endsWith('\n')) text += '\n';
  return { text, applied };
}

/** Replace one exact substring; returns null when the needle is missing or ambiguous. */
export function replaceOnce(text, needle, replacement) {
  const src = String(text ?? '');
  const first = src.indexOf(needle);
  if (first === -1) return null;
  if (src.indexOf(needle, first + 1) !== -1) return null;
  return src.slice(0, first) + replacement + src.slice(first + needle.length);
}
