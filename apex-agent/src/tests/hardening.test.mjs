// Hardening: hostile imports, prototype pollution, keyboard dialogs and formatting edge cases.
// The theme is "what does the app do when the input is not polite".
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, closeApp, waitFor, ROOT, JSDOM } from './harness.mjs';
import { pathToFileURL } from 'node:url';

const skip = JSDOM ? false : 'jsdom is not installed';
const root = pathToFileURL(`${ROOT}/`).href;
let serial = 0;
const loadUi = async () => {
  serial += 1;
  return import(`${root}src/app/ui.js?hard=${serial}`);
};

test('a bad import never destroys the workspace it was meant to restore', { skip, timeout: 90000 }, async () => {
  const { dom, window, app, errors } = await bootApp();
  try {
    app.vfs.writeFile('src/keep.js', 'export const keep = true;\n', 'manual');
    const before = app.vfs.exportFiles();

    const attempts = [
      { label: 'array instead of map', files: ['a', 'b'] },
      { label: 'string instead of map', files: 'oops' },
      { label: 'object as content', files: { 'src/x.js': { evil: true } } },
      { label: 'null as content', files: { 'src/x.js': null } },
      { label: 'unsafe path', files: { '../../escape.js': 'x' } },
      { label: 'absolute path', files: { '/etc/passwd': 'x' } },
    ];
    for (const attempt of attempts) {
      assert.throws(() => app.vfs.loadFiles(attempt.files), `accepted a bad import: ${attempt.label}`);
      assert.deepEqual(app.vfs.exportFiles(), before, `the workspace was damaged by: ${attempt.label}`);
    }

    // A good import still replaces the workspace, in one step.
    app.vfs.loadFiles({ 'src/only.js': 'export const only = 1;\n' });
    assert.deepEqual(Object.keys(app.vfs.exportFiles()), ['src/only.js']);
    assert.deepEqual(errors, []);
  } finally {
    closeApp(dom, app);
  }
});

test('a hostile bundle cannot pollute Object.prototype', { skip, timeout: 60000 }, async () => {
  const { dom, window, app } = await bootApp();
  try {
    const evil = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}}}');
    app.vfs.loadFiles({ 'src/ok.js': 'x' });
    try {
      app.vfs.loadFiles(evil);
    } catch {
      /* refusing is fine too */
    }
    assert.equal({}.polluted, undefined, 'Object.prototype was polluted through a file map');
    assert.equal(Object.prototype.polluted, undefined);

    const { createMemory } = await import(`${root}src/core/memory.js?hard=1`);
    const memory = createMemory();
    memory.import(JSON.parse('{"laws":[{"__proto__":{"polluted":"yes"},"text":"قانون"}],"notes":[],"journal":[]}'));
    assert.equal({}.polluted, undefined, 'Object.prototype was polluted through memory.import');
  } finally {
    closeApp(dom, app);
  }
});

test('the in-page dialog is usable with Enter, Escape and Tab alone', { skip, timeout: 60000 }, async () => {
  const { dom, window, app } = await bootApp();
  try {
    const ui = await loadUi();
    const press = (target, key) =>
      target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

    // Confirm: focus lands inside the dialog, Enter answers yes.
    const yes = ui.askConfirm('مطمئنی؟', 'تأیید');
    await waitFor(() => window.document.querySelector('.ask-card'), { label: 'dialog' });
    const card = window.document.querySelector('.ask-card');
    assert.ok(card.contains(window.document.activeElement), 'focus must start inside the dialog');
    press(window.document.activeElement, 'Enter');
    assert.equal(await yes, true, 'Enter confirms');

    // Escape answers no, and focus returns to where it came from.
    const opener = window.document.getElementById('btnPalette');
    opener.focus();
    const no = ui.askConfirm('مطمئنی؟');
    await waitFor(() => window.document.querySelector('.ask-card'), { label: 'dialog' });
    press(window.document.querySelector('.ask-input') || window.document.activeElement, 'Escape');
    assert.equal(await no, false, 'Escape cancels');
    assert.equal(window.document.activeElement?.id, 'btnPalette', 'focus is restored to the opener');

    // Tab cycles inside the dialog instead of escaping behind it.
    const typed = ui.askText('نام تازه', 'src/new.js');
    await waitFor(() => window.document.querySelector('.ask-card'), { label: 'dialog' });
    const input = window.document.querySelector('.ask-input');
    assert.equal(window.document.activeElement, input, 'the text field takes focus');
    assert.equal(input.value, 'src/new.js');
    input.value = '   ';
    press(input, 'Enter');
    assert.equal(await typed, '', 'a blank answer resolves to an empty string, not "null"');

    const trapped = ui.askText('نام', 'x');
    await waitFor(() => window.document.querySelector('.ask-card'), { label: 'dialog' });
    const focusables = [...window.document.querySelectorAll('.ask-card button, .ask-card input')];
    assert.ok(focusables.length >= 1);
    focusables[focusables.length - 1].focus();
    press(focusables[focusables.length - 1], 'Tab');
    assert.ok(
      window.document.querySelector('.ask-card').contains(window.document.activeElement),
      'Tab must not leave the modal dialog',
    );
    press(window.document.activeElement, 'Escape');
    await trapped.catch(() => {});
  } finally {
    closeApp(dom, app);
  }
});

test('formatting refuses to print NaN, Infinity or a broken date', { skip, timeout: 60000 }, async () => {
  const { dom, window, app } = await bootApp();
  try {
    const ui = await loadUi();
    const cases = [0, -0, 1, -5, 1.5, 1e21, Number.NaN, Infinity, -Infinity, null, undefined, '12', '12abc', ''];
    for (const value of cases) {
      const out = ui.faNum(value);
      assert.equal(typeof out, 'string');
      assert.doesNotMatch(out, /NaN|Infinity|null|undefined/, `faNum(${String(value)}) -> ${out}`);
    }
    assert.equal(ui.faNum(1234), '۱,۲۳۴');
    assert.equal(ui.faNum(-5), '-۵');
    assert.equal(ui.pct(0.256), '۲۶٪');
    assert.equal(ui.pct('x'), '۰٪', 'junk becomes zero, not NaN');
    assert.equal(ui.pct(5), '۱۰۰٪');

    for (const ts of [0, -1, Date.now(), Date.now() + 86400000 * 3, Number.NaN]) {
      const out = ui.timeAgo(ts);
      assert.doesNotMatch(out, /NaN|null|undefined|Invalid/i, `timeAgo(${ts}) -> ${out}`);
    }
  } finally {
    closeApp(dom, app);
  }
});

test('the offline brain is deterministic: the same goal gives the same code twice', { skip, timeout: 120000 }, async () => {
  const { dom, window, app } = await bootApp();
  try {
    const { TASKS } = await import(`${root}src/core/evals.js?hard=1`);
    const task = TASKS.find((t) => t.id === 'palindrome');
    const { VirtualFS } = await import(`${root}src/core/vfs.js?hard=1`);
    const { createAgent } = await import(`${root}src/core/agent.js?hard=1`);
    const runOnce = async () => {
      const vfs = new VirtualFS();
      const agent = createAgent({ vfs, genome: app.genome });
      const result = await agent.run({ goal: 'palindrome را کامل کن', task });
      return { ok: result.ok, files: vfs.exportFiles(), mode: result.mode };
    };
    const a = await runOnce();
    const b = await runOnce();
    assert.equal(a.mode, 'reflex');
    assert.deepEqual(Object.keys(a.files), Object.keys(b.files), 'the same goal produces the same file set');
    assert.deepEqual(a.files, b.files, 'and byte-identical code');
  } finally {
    closeApp(dom, app);
  }
});

test('an imported bundle is applied field by field, and cannot inject settings', { skip, timeout: 60000 }, async () => {
  const { dom, window, app } = await bootApp();
  try {
    const { applyBundle } = await import(`${root}src/app/state.js?hard=1`);
    app.settings.key = 'sk-typed-in-this-browser';
    app.settings.providerId = 'openrouter';
    app.state.lineage = [{ generation: 1, score: 0.5 }];
    const benchBefore = JSON.stringify(app.state.bench);

    const applied = applyBundle(app, {
      files: { 'src/a.js': 'export const a = 1;\n' },
      genome: { genes: { temperature: 999 } },
      memory: { laws: [{ text: 'قانونِ واردشده' }], notes: [], journal: [] },
      settings: { providerId: 'not-a-provider', model: 42, baseUrl: 'https://x.dev'.repeat(40), mode: 'nonsense', key: 'sk-attacker', rememberKey: 'yes' },
      lineage: 'not-an-array',
      bench: [1, 2, 3],
    });

    assert.deepEqual(applied.sort(), ['files', 'genome', 'memory', 'settings'].sort());
    assert.equal(app.settings.providerId, 'openrouter', 'an unknown provider must not replace a real one');
    assert.equal(app.settings.key, 'sk-typed-in-this-browser', 'the browser key is never overwritten by a bundle');
    assert.equal(app.settings.model, '42', 'a numeric model is coerced to text, not passed through');
    assert.ok(app.settings.baseUrl.length <= 300, 'an absurd base URL is capped');
    assert.ok(['triad', 'tools'].includes(app.settings.mode), 'an unknown mode is dropped');
    assert.equal(app.settings.rememberKey, true, 'a truthy flag becomes a boolean');
    assert.deepEqual(app.state.lineage, [{ generation: 1, score: 0.5 }], 'a string lineage is ignored, not applied');
    assert.equal(JSON.stringify(app.state.bench), benchBefore, 'an array bench is ignored, not applied');
    assert.equal(Object.keys(app.vfs.exportFiles()).length, 1, 'files were replaced');
  } finally {
    closeApp(dom, app);
  }
});

test('efficiency ignores timing noise but still prefers clearly faster code', async () => {
  const { scoreCandidate } = await import(`${root}src/core/triad.js?hard=1`);
  const base = {
    candidate: { id: 'c1', strategy: 'minimal', content: 'export const f = (x) => x;\n', diff: '', stats: { churn: 2 } },
    publicRun: { ok: true, ms: 3, results: [{ pass: true }, { pass: true }] },
    hiddenRun: { ok: true, ms: 2, results: [{ pass: true }] },
    hypotheses: [],
    baselineChurn: 8,
  };
  const fast = scoreCandidate(base);
  const jittered = scoreCandidate({ ...base, publicRun: { ...base.publicRun, ms: 11 } });
  const slow = scoreCandidate({ ...base, publicRun: { ...base.publicRun, ms: 600 }, hiddenRun: { ...base.hiddenRun, ms: 400 } });
  assert.equal(fast.total, jittered.total, 'a few milliseconds of noise must not change the score');
  assert.ok(fast.parts.efficiency > slow.parts.efficiency + 0.3, 'a truly slow candidate is still penalised on efficiency');
  assert.ok(fast.total > slow.total, 'and loses on the total');
  assert.ok(fast.total - slow.total < 0.15, 'but efficiency stays a tiebreaker, not the main axis');
});

test('a junk genome or settings blob is repaired, not trusted', { skip, timeout: 60000 }, async () => {
  const { dom, window, app } = await bootApp();
  try {
    const { validateGenome, LIMITS } = await import(`${root}src/core/genome.js?hard=1`);
    for (const junk of [null, undefined, 42, 'x', [], { genes: { temperature: 999, maxSteps: -4 } }, { genes: null }]) {
      const g = validateGenome(junk);
      for (const [gene, [min, max]] of Object.entries(LIMITS)) {
        const value = g.genes[gene];
        assert.ok(Number.isFinite(value) && value >= min && value <= max, `${gene}=${value} out of range for ${JSON.stringify(junk)}`);
      }
      assert.ok(Array.isArray(g.fragments) && g.fragments.length > 0, 'fragments survive a junk genome');
    }
  } finally {
    closeApp(dom, app);
  }
});

// The browser audit (tools/render.mjs) found that the sandbox died in real Chromium while every
// Node test stayed green: the worker assigned to getter-only WorkerGlobalScope accessors, and it
// built the model's code with new Function(), which the production CSP blocks. These tests pin the
// generated script itself, so that class of bug cannot come back silently.
test('sandbox worker script never needs eval, and never assigns over a global accessor', async () => {
  const vm = await import('node:vm');
  const { buildWorkerSource } = await import(`${root}src/core/sandbox.js`);
  const src = buildWorkerSource({
    // Module syntax is stripped before it reaches the builder (payloadFor does that).
    code: 'const sum = (n) => n.reduce((a, b) => a + b, 0);',
    entries: ['sum'],
    cases: [
      { name: 'adds', fn: 'sum', args: [[1, 2, 3]], expect: 6 },
      { name: 'sorted by fn', fn: 'sum', args: [[3, 1, { __fn: '(a, b) => a - b' }]], expect: 0 },
    ],
    capture: ['sum'],
  });
  assert.ok(!/\bnew Function\b/.test(src), 'new Function is blocked by script-src without unsafe-eval');
  assert.ok(!/\beval\s*\(/.test(src), 'eval is blocked by the same CSP');
  assert.ok(!/^self\.(indexedDB|caches|fetch|WebSocket)\s*=/m.test(src), 'a getter-only worker global cannot be assigned');
  assert.ok(/Object\.defineProperty\(self/.test(src), 'globals are removed through defineProperty');
  assert.ok(src.includes('const sum = (n) => n.reduce((a, b) => a + b, 0);'), 'the model code is compiled as script source');
  assert.ok(/"__fnRef":0/.test(src) && /\(a, b\) => a - b/.test(src), 'function arguments are inlined by index, not stringified into eval');
  // Compiling is not running: this proves the generated text is valid script syntax in any engine.
  assert.doesNotThrow(() => new vm.Script(src, { filename: 'generated-sandbox.js' }));
});

test('the worker prefix still closes the network and keeps a private postMessage handle', async () => {
  const { buildWorkerSource } = await import(`${root}src/core/sandbox.js`);
  const src = buildWorkerSource({ code: 'export const x = 1;', entries: ['x'], cases: [] });
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches']) {
    assert.ok(new RegExp(`__kill\\('${name}'`).test(src), `${name} must be removed inside the worker`);
  }
  assert.ok(/const __post = self\.postMessage\.bind\(self\);/.test(src), 'the only way out is a captured handle');
  assert.ok(src.indexOf("__kill('postMessage')") > src.indexOf('const __post'), 'the global is dropped after the handle is kept');
});
