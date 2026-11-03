// Lifecycle: boot, persist, export, wipe, and what happens when the network is gone. These are the
// paths a person hits every day (reload, move browsers, lose wifi) and none of them had a test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, closeApp, waitFor, ROOT, JSDOM } from './harness.mjs';
import { pathToFileURL } from 'node:url';

const skip = JSDOM ? false : 'jsdom is not installed';
const root = pathToFileURL(`${ROOT}/`).href;
let serial = 0;
const load = async (file) => {
  serial += 1;
  return import(`${root}src/app/${file}?life=${serial}`);
};

test('boot and teardown can repeat without leaking a second copy of the app', { skip, timeout: 120000 }, async () => {
  for (let i = 0; i < 6; i += 1) {
    const { dom, window, app, errors } = await bootApp();
    try {
      const ids = [...window.document.querySelectorAll('[id]')].map((el) => el.id);
      const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
      assert.deepEqual(dupes, [], `boot ${i}: duplicate element ids (double mount)`);
      assert.equal(errors.length, 0, `boot ${i}: the page raised ${errors.join(' | ')}`);
      assert.ok(app.vfs, `boot ${i}: no workspace`);
      app.dispose?.();
      app.dispose?.(); // a double teardown must be a no-op, not a crash
      assert.equal(window.document.querySelectorAll('[id]').length, ids.length, `boot ${i}: teardown removed the shell`);
    } finally {
      closeApp(dom, app);
    }
  }
});

test('state survives a reload, and a full browser is reported instead of losing work', { skip, timeout: 60000 }, async () => {
  const { dom, window, app } = await bootApp();
  try {
    const state = await load('state.js');
    const before = { files: { 'a.js': 'export const a = 1;\n' }, bench: { solved: 3 } };
    assert.equal(state.persist(before), true, 'persist must confirm success with true');

    // Reload means: the same storage, read fresh.
    const restored = state.loadPersisted();
    assert.deepEqual(restored.state.files, before.files, 'files came back');
    assert.deepEqual(restored.state.bench, before.bench, 'bench came back');
    assert.ok(restored.state.savedAt, 'the saved timestamp is stored');

    // A corrupt blob must not throw and must not wipe the workspace. Corrupt every key, so this
    // test does not depend on the private storage-key name.
    for (let i = 0; i < window.localStorage.length; i += 1) {
      window.localStorage.setItem(window.localStorage.key(i), '{not json');
    }
    const broken = state.loadPersisted();
    assert.equal(broken.state, null, 'corrupt state reads as nothing, not a crash');

    // Quota is the realistic phone failure: it must be a readable sentence, not an exception.
    // jsdom's Storage is exotic: an own-property assignment does not shadow it, the prototype does.
    const proto = Object.getPrototypeOf(window.localStorage);
    const realSet = proto.setItem;
    proto.setItem = () => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    };
    let failed;
    try {
      failed = state.persist({ files: {} });
    } finally {
      proto.setItem = realSet;
    }
    assert.equal(typeof failed, 'object', 'a failure is an object, not a silent false');
    assert.match(failed.error, /حافظه/, 'the message tells the user the browser storage is full');

    // persist() feeding a real save path must not throw either.
    assert.doesNotThrow(() => app.save());
  } finally {
    closeApp(dom, app);
  }
});

test('the export carries the work and never the key', { skip, timeout: 60000 }, async () => {
  const { dom, window, app } = await bootApp();
  try {
    const state = await load('state.js');
    const SECRET = 'sk-SECRET-should-never-leave-this-browser';
    const bundle = state.buildExport({
      files: { 'a.js': 'x\n' },
      genome: { id: 'g1' },
      memory: { laws: ['تست قبل از ادعا'] },
      settings: { providerId: 'openai', model: 'gpt-4o-mini', key: SECRET, proxyToken: 'proxy-secret', rememberKey: true },
      lineage: [],
      bench: { solved: 1 },
    });
    const text = JSON.stringify(bundle);
    assert.ok(!text.includes(SECRET), 'the API key leaked into the export');
    assert.ok(!text.includes('proxy-secret'), 'the proxy token leaked into the export');
    assert.ok(text.includes('تست قبل از ادعا'), 'the laws are in the export');
    assert.match(bundle.note, /کلید/, 'the bundle says why the key is missing');

    assert.throws(() => state.parseImport('{"app":"something-else"}'), /مِتاکد/);
    assert.throws(() => state.parseImport('{oops'), /مِتاکد/);
    assert.throws(() => state.parseImport(JSON.stringify({ ...bundle, schema: 99 })), /جدیدتر/);
    assert.equal(state.parseImport(JSON.stringify(bundle)).files['a.js'], 'x\n', 'a real bundle round-trips');

    state.clearAll();
    assert.equal(state.loadPersisted().state, null, 'clearAll wipes the state');
    assert.equal(state.loadPersisted().keys, null, 'clearAll wipes the keys too');
    window.localStorage.clear();
  } finally {
    closeApp(dom, app);
  }
});

test('a dead network gives a readable Persian error and leaves the app usable', { skip, timeout: 90000 }, async () => {
  const { dom, window, app, errors } = await bootApp();
  try {
    app.settings.providerId = 'openai';
    app.settings.model = 'gpt-4o-mini';
    app.settings.key = 'sk-test-1234567890';
    const realFetch = window.fetch;
    window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    let message = '';
    try {
      await app.makeLLM().complete({ messages: [{ role: 'user', content: 'سلام' }] });
      assert.fail('a rejected fetch must not resolve as success');
    } catch (err) {
      message = String(err?.message || err);
    } finally {
      window.fetch = realFetch;
    }
    assert.ok(message.length > 0, 'the failure has a message');
    assert.match(message, /CORS|شبکه|مرورگر|بلاک|خطا|کلید/i, `unhelpful error text: ${message}`);
    assert.ok(!message.includes('sk-test-1234567890'), 'the error text echoed the key');
    assert.equal(errors.length, 0, 'a network failure must be caught, not raised as an unhandled error');

    // The offline brain still works after the failure: no stuck state, no modal left behind.
    const goal = window.document.querySelector('#goalInput');
    if (goal) {
      goal.value = 'یک تابع جمع بنویس که تست داشته باشد.';
      goal.dispatchEvent(new window.Event('input', { bubbles: true }));
    }
    window.document.querySelector('#btnRun').click();
    await waitFor(() => !window.document.querySelector('#btnRun').disabled, { label: 'offline run', timeout: 90000 });
    assert.equal(window.document.querySelector('#overlayError')?.hidden ?? true, true, 'no error overlay was left open');
  } finally {
    closeApp(dom, app);
  }
});

// Rename migration (Codex P1): a pre-rename deployment on the same origin must keep its workspace,
// and a backup exported before the rename must still import. Pure test — no jsdom, mocked storage.
function fakeLocalStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('a pre-rename workspace migrates, and a legacy apex-metacode backup still imports', async () => {
  const ls = fakeLocalStorage();
  ls.setItem('apex.metacode.v3', JSON.stringify({ hello: 'world' }));
  ls.setItem('apex.metacode.keys.v3', JSON.stringify({ key: 'sk-legacy' }));
  const prev = globalThis.localStorage;
  globalThis.localStorage = ls;
  try {
    const { loadPersisted, parseImport } = await load('state.js');
    const { state, keys } = loadPersisted();
    assert.deepEqual(state, { hello: 'world' }, 'legacy workspace is migrated, not dropped');
    assert.deepEqual(keys, { key: 'sk-legacy' }, 'legacy credentials migrate too');
    assert.notEqual(ls.getItem('infinity.metacode.v3'), null, 'migrated into the new key');
    assert.equal(ls.getItem('apex.metacode.v3'), null, 'legacy key cleaned up after migration');
    assert.equal(parseImport(JSON.stringify({ app: 'apex-metacode', schema: 3, n: 7 })).n, 7, 'legacy export accepted');
    assert.equal(parseImport(JSON.stringify({ app: 'infinity-mega-skill', schema: 3, n: 9 })).n, 9, 'current export accepted');
  } finally {
    globalThis.localStorage = prev;
  }
});
