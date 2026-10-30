// Virtual file system: the agent's world. In-memory Map + per-file revision log + snapshots.
//
// Deliberately not IndexedDB here: core stays synchronous and testable in Node, and the storage
// adapter (localStorage in the browser) is injected by src/app/state.js. A file write is cheap;
// a snapshot is what makes "rollback the last change" a one-liner instead of a regret.

import { applyPatch, createPatch, patchStats, splitLines } from './diff.js';

const MAX_BYTES = 4 * 1024 * 1024; // whole workspace; protects a phone's localStorage
const MAX_REVISIONS = 40;

export class VirtualFS {
  /** @param {Record<string,string>} [initial] path -> content */
  constructor(initial = {}) {
    /** @type {Map<string, {content:string, rev:number, updated:number}>} */
    this.files = new Map();
    /** @type {Map<string, Array<{rev:number, ts:number, content:string, note:string}>>} */
    this.revisions = new Map();
    /** @type {Array<{id:number, ts:number, note:string, files:Record<string,string>}>} */
    this.snapshots = [];
    this.seq = 1;
    for (const [path, content] of Object.entries(initial)) this.write(path, content, 'seed');
  }

  static normalise(path) {
    return String(path || '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/\/{2,}/g, '/')
      .trim();
  }

  get size() {
    let bytes = 0;
    for (const f of this.files.values()) bytes += f.content.length;
    return bytes;
  }

  has(path) {
    return this.files.has(VirtualFS.normalise(path));
  }

  read(path) {
    // A missing file reads as empty text. `null` used to leak into template literals ("null") and
    // into diff baselines; empty is the honest value for "no content yet".
    return this.files.get(VirtualFS.normalise(path))?.content ?? '';
  }

  list(dir = '') {
    const prefix = VirtualFS.normalise(dir);
    return [...this.files.entries()]
      .filter(([p]) => !prefix || p === prefix || p.startsWith(`${prefix.replace(/\/$/, '')}/`))
      .map(([path, f]) => ({ path, bytes: f.content.length, rev: f.rev, updated: f.updated }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  tree() {
    const root = { name: '', dirs: new Map(), files: [] };
    for (const [path, f] of [...this.files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const parts = path.split('/');
      let node = root;
      for (const part of parts.slice(0, -1)) {
        if (!node.dirs.has(part)) node.dirs.set(part, { name: part, dirs: new Map(), files: [] });
        node = node.dirs.get(part);
      }
      node.files.push({ name: parts[parts.length - 1], path, bytes: f.content.length });
    }
    return root;
  }

  /** @returns {{path:string, rev:number, created:boolean, bytes:number}} */
  write(path, content, note = '', { allowEmpty = true } = {}) {
    const p = VirtualFS.normalise(path);
    if (!p) throw new Error('empty path');
    if (p.includes('..')) throw new Error('path traversal is not allowed');
    // An absolute path here becomes a zip entry like "/etc/passwd", which extractors may honour
    // outside the target folder (zip-slip). Paths in this workspace are always relative.
    if (p.startsWith('/') || /^[a-zA-Z]:\//.test(p)) {
      throw new Error('مسیر باید نسبی باشد؛ مسیرِ مطلق مجاز نیست.');
    }
    if (p.endsWith('/')) throw new Error('مسیر به نامِ فایل ختم نمی‌شود.');
    const text = String(content ?? '');
    if (!allowEmpty && !text.trim()) throw new Error('refusing to write an empty file');
    const created = !this.files.has(p);
    const prev = this.files.get(p);
    const rev = (prev?.rev || 0) + 1;
    const ts = Date.now();
    this.files.set(p, { content: text, rev, updated: ts });
    const log = this.revisions.get(p) || [];
    log.push({ rev, ts, content: text, note });
    while (log.length > MAX_REVISIONS) log.shift();
    this.revisions.set(p, log);
    if (this.size > MAX_BYTES) throw new Error('workspace exceeded 4 MB — export and prune first');
    return { path: p, rev, created, bytes: text.length };
  }

  remove(path) {
    const p = VirtualFS.normalise(path);
    if (!this.files.delete(p)) return false;
    return true;
  }

  revisionsOf(path) {
    return [...(this.revisions.get(VirtualFS.normalise(path)) || [])].reverse();
  }

  restore(path, rev) {
    const entry = (this.revisions.get(VirtualFS.normalise(path)) || []).find((r) => r.rev === rev);
    if (!entry) throw new Error(`revision ${rev} not found for ${path}`);
    const res = this.write(path, entry.content, `restore r${rev}`);
    return { ...res, restored: rev };
  }

  snapshot(note = 'snapshot') {
    const files = Object.fromEntries([...this.files.entries()].map(([p, f]) => [p, f.content]));
    const snap = { id: this.seq++, ts: Date.now(), note, files };
    this.snapshots.push(snap);
    while (this.snapshots.length > 25) this.snapshots.shift();
    return snap;
  }

  restoreSnapshot(id) {
    const snap = this.snapshots.find((s) => s.id === id);
    if (!snap) throw new Error(`snapshot ${id} not found`);
    this.files.clear();
    for (const [p, c] of Object.entries(snap.files)) {
      this.files.set(p, { content: c, rev: 1, updated: Date.now() });
    }
    return { id, files: Object.keys(snap.files).length };
  }

  /** Preview a change without touching the fs: used by the triad cards. */
  previewPatch(path, patch) {
    const before = this.read(path);
    if (before === null) throw new Error(`no such file: ${path}`);
    const { text } = applyPatch(before, patch);
    return {
      path,
      before,
      after: text,
      diff: createPatch(before, text, { path }),
      stats: patchStats(patch),
    };
  }

  /** Apply a whole-file replacement but record the exact diff for review. */
  writeFile(path, content, note = '') {
    const before = this.read(path) ?? '';
    const diff = createPatch(before, content, { path });
    const res = this.write(path, content, note);
    return { ...res, diff, stats: patchStats(diff) };
  }

  search(query, { limit = 40 } = {}) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return [];
    const hits = [];
    for (const [path, f] of this.files) {
      const lines = splitLines(f.content);
      lines.forEach((line, i) => {
        if (hits.length < limit && line.toLowerCase().includes(q)) {
          hits.push({ path, line: i + 1, text: line.trim().slice(0, 240) });
        }
      });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  exportFiles() {
    return Object.fromEntries([...this.files.entries()].map(([p, f]) => [p, f.content]));
  }

  loadFiles(obj) {
    this.files.clear();
    this.revisions.clear();
    for (const [p, c] of Object.entries(obj || {})) this.write(p, c, 'load');
    return this.files.size;
  }
}

export const DEFAULT_FILES = {
  'src/math.js': `// Small, testable helpers the agent starts from.
export function sum(numbers) {
  return numbers.reduce((a, b) => a + b, 0);
}

export function palindrome(text) {
  const clean = String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean === [...clean].reverse().join('');
}
`,
  'src/math.test.js': `import {sum, palindrome} from './math.js';

// The sandbox runs these cases directly: name, args, expected.
export const cases = [
  {name: 'sum of empty list is 0', args: [[]], expect: 0},
  {name: 'sum adds numbers', args: [[1, 2, 3]], expect: 6},
  {name: 'palindrome ignores case and punctuation', args: ['Madam, I\\'m Adam'], expect: true},
  {name: 'non-palindrome is false', args: ['apex'], expect: false},
];
`,
  'notes/goal.md': `# هدف

این فضای کاری با ایجنت پر می‌شود. هر تغییر یک دیف است، هر دیف قابل بازگشت است.
`,
};
