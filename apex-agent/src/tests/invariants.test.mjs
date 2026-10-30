// Invariants that must hold for every input, not just the happy one: the compressor keeps what it
// promised to keep, a patch either applies exactly or refuses, the zip is byte-stable, the genome
// never accepts a regression. Fuzz cases are seeded so a failure is reproducible.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compressContext, atomize, similarity, dedupeAtoms, packAtoms } from '../core/compress.js';
import { estimateTokens, conversationTokens } from '../core/tokens.js';
import { createPatch, applyPatch, patchStats, parsePatch, replaceOnce } from '../core/diff.js';
import { VirtualFS } from '../core/vfs.js';
import { makeZip, buildZipBytes, zipBytes, crc32 } from '../core/zip.js';
import { defaultGenome, mutate, LIMITS, EPSILON, selectGeneration, rngFrom, scoreFitness } from '../core/genome.js';
import { TASKS, publicTask } from '../core/evals.js';

const rng = (seed) => rngFrom(seed);

test('the compressor never drops a protected message and always lands under budget', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    let text = '';
    const messages = [];
    for (let i = 0; i < 30; i += 1) {
      text += `خط ${i} دربارهٔ ${['تست', 'دیف', 'فایل', 'بودجه', 'خطا'][i % 5]} شمارهٔ ${i} `;
      messages.push({ role: i % 2 ? 'assistant' : 'user', content: `${text} ${'توضیح. '.repeat(i % 7)}` });
    }
    messages.push({ role: 'system', content: 'قانونِ محافظت‌شده: هیچ تغییری بدون تست اعمال نمی‌شود.', protected: true });
    messages.push({ role: 'user', content: 'آخرین پیام کاربر که باید بماند.' });

    const out = compressContext({ messages, budgetTokens: 900, query: 'دیف', keepRecent: 3 });
    assert.ok(out.messages.length >= 2, `seed ${seed}: kept too little`);
    assert.ok(out.messages.some((m) => m.protected), `seed ${seed}: a protected message was dropped`);
    // The newest user turn survives; the compressor may append its digest note to it, never rewrite it.
    assert.ok(
      out.messages[out.messages.length - 1].content.startsWith('آخرین پیام کاربر که باید بماند.'),
      `seed ${seed}: the newest user turn was rewritten`,
    );
    assert.equal(out.messages.filter((m) => m.protected).length, 1, `seed ${seed}: protection flag lost`);
    const used = conversationTokens(out.messages);
    assert.ok(used <= 900 * 1.35, `seed ${seed}: budget blown (${used})`);
    assert.ok(out.digest.length > 0, `seed ${seed}: no digest of what was dropped`);
  }
});

test('atomize/dedupe/pack behave on degenerate input', () => {
  assert.deepEqual(atomize(''), []);
  assert.ok(similarity('', '') >= 0);
  assert.ok(similarity('الف ب پ', 'الف ب پ') > 0.95);
  assert.ok(similarity('یک', 'دو') < 0.2);
  const repeated = atomize('یک جمله.\n'.repeat(40));
  const { kept, dropped } = dedupeAtoms(repeated);
  assert.equal(kept.length, 1, 'exact repeats collapse to one atom');
  assert.equal(dropped.length, 39, 'and the rest are accounted for, not lost');
  assert.deepEqual(packAtoms([], 100), { chosen: [], rejected: [], used: 0, cap: 100 });
  assert.equal(estimateTokens(''), 0);
  assert.ok(estimateTokens('a'.repeat(4000)) > estimateTokens('a'.repeat(400)));
});

test('a patch applies exactly or refuses — never half', () => {
  for (let seed = 1; seed <= 15; seed += 1) {
    const r = rng(seed);
    const lines = [];
    for (let i = 0; i < 20; i += 1) lines.push(`line ${i} ${r() > 0.5 ? 'alpha' : 'beta'}`);
    const before = lines.join('\n') + '\n';
    const next = [...lines];
    const edits = 1 + Math.floor(r() * 4);
    for (let e = 0; e < edits; e += 1) {
      const idx = Math.floor(r() * next.length);
      next[idx] = `changed ${seed}-${e}`;
    }
    const after = next.join('\n') + '\n';
    if (before === after) continue;

    const patch = createPatch(before, after, { path: 'src/a.js' });
    const stats = patchStats(patch);
    assert.ok(stats.added + stats.removed > 0, `seed ${seed}: empty patch`);
    const applied = applyPatch(before, patch);
    assert.equal(applied.text, after, `seed ${seed}: apply did not reproduce the file`);
    assert.ok(applied.applied >= 1, `seed ${seed}: nothing was applied`);

    // Applying the same patch to unrelated content must throw, not corrupt it.
    assert.throws(() => applyPatch(`unrelated\nfile ${seed}\n`, patch), `seed ${seed}: wrong base accepted`);
    // Parsing round-trips.
    const parsed = parsePatch(patch);
    assert.ok(parsed.length >= 1, `seed ${seed}: parse lost the hunk`);
  }
  assert.equal(replaceOnce('a b c', 'b', 'X'), 'a X c');
  assert.equal(replaceOnce('a b a', 'a', 'c'), null, 'an ambiguous needle is refused, not guessed');
  assert.equal(replaceOnce('x', 'missing', 'y'), null, 'a missing needle is refused');
});

test('the zip is byte-stable and its CRCs are real', () => {
  const entries = [
    { path: 'index.html', content: '<!doctype html><title>x</title>' },
    { path: 'src/a.js', content: 'export const a = 1;\n' },
  ];
  const one = buildZipBytes(entries, { date: new Date('2026-01-01T00:00:00Z') });
  const two = buildZipBytes(entries, { date: new Date('2026-01-01T00:00:00Z') });
  assert.deepEqual([...one], [...two], 'same input must give the same bytes');
  assert.ok(one instanceof Uint8Array, 'bytes, not a Blob');
  const mapBytes = zipBytes({ 'a.txt': 'hello' }, { date: new Date('2026-01-01T00:00:00Z') });
  assert.ok(mapBytes instanceof Uint8Array && mapBytes.length > 0, 'zipBytes always returns bytes');
  assert.ok(makeZip(entries) instanceof Blob, 'the download path still gets a Blob');
  assert.equal(new DataView(one.buffer).getUint32(0, true), 0x04034b50, 'local file header signature');
  assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610a686, 'known CRC32 vector');
});

test('the filesystem versions, restores and exports symmetrically', () => {
  const vfs = new VirtualFS({ 'a.txt': 'one\n' });
  vfs.write('a.txt', 'two\n', 'edit');
  vfs.write('b/deep/c.txt', 'three\n', 'new file');
  assert.equal(vfs.read('a.txt'), 'two\n');
  const revs = vfs.revisionsOf('a.txt');
  assert.ok(revs.length >= 2, 'every write is a revision');
  assert.equal(revs[0].rev, Math.max(...revs.map((r) => r.rev)), 'newest revision first');
  vfs.restore('a.txt', revs[revs.length - 1].rev);
  assert.equal(vfs.read('a.txt'), 'one\n', 'restore brings the old body back');

  const snap = vfs.snapshot('before');
  vfs.write('a.txt', 'four\n', 'edit');
  vfs.restoreSnapshot(snap.id);
  assert.equal(vfs.read('a.txt'), 'one\n');

  const exported = vfs.exportFiles();
  const copy = new VirtualFS(exported);
  assert.deepEqual(copy.exportFiles(), exported, 'export/import is lossless');
  assert.deepEqual(new VirtualFS({}).list(), [], 'an empty workspace lists nothing');
  vfs.remove('a.txt');
  assert.equal(vfs.read('a.txt'), '', 'a removed file reads empty, not undefined');
});

test('the genome mutates within limits, deterministically, and never accepts a regression', () => {
  const base = defaultGenome({ seed: 7 });
  const a = mutate(base, { seed: 7, count: 3 });
  const b = mutate(base, { seed: 7, count: 3 });
  // History entries carry a wall-clock ts, so compare what reproducibility actually promises:
  // the operators picked and the genes they produced.
  assert.deepEqual(a.map((m) => [m.id, m.operator, m.genome.genes]), b.map((m) => [m.id, m.operator, m.genome.genes]), 'same seed, same mutants');
  assert.equal(a.length, 3, 'three hypotheses per generation');
  for (const g of a) {
    assert.ok(g.genome && g.operator, 'a mutant carries its genome and the operator that made it');
    for (const [gene, bound] of Object.entries(LIMITS)) {
      const [min, max] = bound;
      const value = g.genome.genes[gene];
      assert.ok(value >= min && value <= max, `${gene}=${value} outside [${min}, ${max}]`);
    }
    assert.equal(g.genome.generation, base.generation + 1);
  }

  const champion = { ...base, fitness: scoreFitness({ suite: { mean: 0.8, solved: 10, total: 10 }, tokensUsed: 100, budget: 1000 }) };
  const worse = { mutant: a[0], fitness: scoreFitness({ suite: { mean: 0.5, solved: 4, total: 10 }, tokensUsed: 900, budget: 1000 }) };
  const verdict = selectGeneration({ champion, challengers: [worse], epsilon: EPSILON });
  assert.equal(verdict.accepted, false, 'a worse challenger is rejected');
  assert.equal(verdict.champion.id, champion.id, 'the champion keeps its identity');

  const better = { mutant: a[1], fitness: scoreFitness({ suite: { mean: 0.95, solved: 10, total: 10 }, tokensUsed: 50, budget: 1000 }) };
  const win = selectGeneration({ champion, challengers: [better], epsilon: EPSILON });
  assert.equal(win.accepted, true, 'a real improvement is accepted');
});

test('every benchmark task is complete and the hidden half never leaks', () => {
  assert.ok(TASKS.length >= 10);
  for (const task of TASKS) {
    for (const field of ['id', 'title', 'prompt', 'files', 'cases', 'entry']) {
      assert.ok(task[field], `${task.id}: missing ${field}`);
    }
    assert.ok(task.cases.length >= 2, `${task.id}: needs real cases`);
    assert.ok(task.entry.length >= 1, `${task.id}: no export to check`);
    const pub = publicTask(task);
    assert.equal(pub.hidden, undefined, `${task.id}: the public task leaked the hidden cases`);
    assert.deepEqual(pub.cases, task.cases);
  }
  assert.equal(new Set(TASKS.map((t) => t.id)).size, TASKS.length, 'task ids are unique');
});
