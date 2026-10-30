// End-to-end in a simulated browser. jsdom is a devDependency and this file skips cleanly when it
// is not installed, so CI without network still runs the pure core suite.
//
// What it proves: the page boots without an error overlay, a Reflex run really executes a task in
// the sandbox, the triad renders three scored candidates, the winner is written to the workspace,
// the benchmark solves all ten tasks, and the self-test panel is green.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  JSDOM = null;
}

const waitFor = async (check, { timeout = 20000, step = 40, label = 'condition' } = {}) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`timeout waiting for ${label}`);
};

let bootCounter = 0;

const closeApp = (dom, app) => {
  try {
    app?.dispose?.();
  } catch {
    /* already disposed */
  }
  dom.window.close();
};

async function bootApp() {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:8080/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    resources: undefined,
  });
  const { window } = dom;

  // --- browser APIs jsdom does not implement, stubbed at the boundary -------------
  window.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  const gradient = { addColorStop() {} };
  const ctx = {
    clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {},
    setTransform() {}, createRadialGradient: () => gradient, save() {}, restore() {}, translate() {}, rotate() {},
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set globalAlpha(v) {},
  };
  window.HTMLCanvasElement.prototype.getContext = () => ctx;
  window.URL.createObjectURL = () => 'blob:stub';
  window.URL.revokeObjectURL = () => {};
  const clicked = [];
  window.HTMLAnchorElement.prototype.click = function click() {
    clicked.push({ href: this.href, download: this.download });
  };

  const globals = [
    'window', 'document', 'navigator', 'HTMLElement', 'HTMLAnchorElement', 'HTMLCanvasElement', 'Node',
    'Element', 'CustomEvent', 'Event', 'Blob', 'URL', 'localStorage', 'sessionStorage', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'DOMException', 'FileReader', 'FormData',
  ];
  for (const key of globals) {
    if (!(key in window)) continue;
    try {
      Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
    } catch {
      /* Node owns a few globals with getters only; the app does not need those overridden. */
    }
  }
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'self', { value: window, configurable: true, writable: true });
  try {
    Object.defineProperty(globalThis, 'location', { value: window.location, configurable: true, writable: true });
  } catch {
    /* not needed on this Node version */
  }

  // Node caches ES modules; a query string forces boot.js to run again for each test case.
  bootCounter += 1;
  await import(`${pathToFileURL(path.join(ROOT, 'src/app/boot.js')).href}?case=${bootCounter}`);
  await waitFor(() => window.__apex, { label: 'app boot' });
  return { dom, window, app: window.__apex, clicked };
}

test('the page boots with no error overlay', { timeout: 30000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app } = await bootApp();
  assert.equal(window.document.documentElement.dataset.booted, '1');
  assert.equal(window.document.querySelector('[role="alert"]'), null, 'boot shows no error overlay');
  assert.ok(app.vfs.list().length >= 3, 'seed workspace is present');
  assert.ok(app.memory.laws.length >= 7, 'laws are seeded');
  assert.equal(window.document.querySelectorAll('#providers .provider').length, 13, 'all providers render');
  closeApp(dom, app);
});

test('a Reflex run builds three candidates, proves one and writes it', { timeout: 60000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app } = await bootApp();
  const doc = window.document;

  doc.querySelector('#goal').value = 'یک تابع جمع با تست بنویس';
  doc.querySelector('#btnRun').click();

  await waitFor(() => app.state.lastRun || doc.querySelector('#runline').hidden, { label: 'run finished', timeout: 45000 });
  await waitFor(() => doc.querySelectorAll('#triadList .candidate').length === 3, { label: 'triad cards', timeout: 15000 });

  const cards = doc.querySelectorAll('#triadList .candidate');
  assert.equal(cards.length, 3, 'exactly three candidates');
  assert.equal(doc.querySelectorAll('#triadList .candidate.winner').length, 1, 'exactly one winner');
  assert.ok(doc.querySelectorAll('#triadList .hyp li').length >= 9, 'three hypotheses per candidate');
  assert.ok(doc.querySelectorAll('#console .l.pass').length > 0, 'a real passing test is logged');
  assert.equal(doc.querySelector('#verifyBadge').textContent, 'سبز', 'verification badge is green');
  assert.match(app.vfs.read('src/sum.js'), /reduce/, 'winner written to the workspace');
  assert.ok(app.state.lastRun?.ok, 'run recorded as verified');
  closeApp(dom, app);
});

test('the benchmark solves every task and the self-test panel is green', { timeout: 90000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app } = await bootApp();
  const doc = window.document;

  await app.evolve.bench();
  assert.equal(app.state.bench.length, 10, 'ten benchmark rows');
  assert.equal(app.state.bench.filter((r) => r.score?.solved).length, 10, 'all ten tasks solved');
  assert.ok(app.genome.fitness?.score > 0.5, 'a fitness was measured');

  doc.querySelector('#btnSelfTest').click();
  await waitFor(() => doc.querySelector('#selfBadge').textContent.includes('/'), { label: 'self-test count', timeout: 60000 });
  await waitFor(() => doc.querySelectorAll('#selfTests .st-row').length > 0, { label: 'self-test rows', timeout: 60000 });
  const rows = doc.querySelectorAll('#selfTests .st-row');
  const failed = doc.querySelectorAll('#selfTests .st-row.bad').length;
  assert.equal(failed, 0, `self-tests failed: ${[...rows].filter((r) => r.classList.contains('bad')).map((r) => r.textContent).join(' | ')}`);
  closeApp(dom, app);
});

test('the connection test reaches a real endpoint and reports what came back', { timeout: 30000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app } = await bootApp();
  let seenAuth = null;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      seenAuth = req.headers.authorization;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'آماده' } }], usage: { prompt_tokens: 6, completion_tokens: 2 } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    app.settings.providerId = 'openai';
    app.settings.key = 'ui-test-key';
    app.settings.model = 'mock-coder';
    app.settings.baseUrl = `http://127.0.0.1:${port}/v1`;
    app.setView('settings');
    window.document.querySelector('#btnTestBrain').click();
    const note = await waitFor(
      () => {
        const text = window.document.querySelector('#brainNote').textContent;
        return text && !text.includes('در حال تست') ? text : '';
      },
      { label: 'connection note' },
    );
    assert.match(note, /آماده/, `the endpoint reply should surface in the note, got ${note}`);
    assert.equal(seenAuth, 'Bearer ui-test-key', 'the key travels in the Authorization header');
  } finally {
    await new Promise((r) => server.close(r));
    closeApp(dom, app);
  }
});

test('self-audit reads the app\'s own source into the workspace', { timeout: 30000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app } = await bootApp();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const rel = new URL(String(url)).pathname.replace(/^\//, '');
    try {
      const text = readFileSync(path.join(ROOT, rel), 'utf8');
      return { ok: true, text: async () => text };
    } catch {
      return { ok: false, text: async () => '' };
    }
  };
  try {
    await app.evolve.selfAudit();
  } finally {
    globalThis.fetch = originalFetch;
  }
  const self = app.vfs.list('self').map((f) => f.path);
  assert.ok(self.length >= 15, `expected the core to be loaded, got ${self.length}`);
  assert.ok(self.includes('self/src/core/triad.js'), 'triad is in the workspace');
  assert.ok(app.vfs.size > 40000, 'real source was written');
  closeApp(dom, app);
});

test('a manual edit is versioned and the zip has real content', { timeout: 30000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app, clicked } = await bootApp();
  const doc = window.document;

  doc.querySelector('[data-view="workbench"]').click();
  assert.equal(doc.querySelector('#view-workbench').hidden, false, 'workbench is visible');

  const openPath = app.workbench.path;
  assert.match(openPath, /\.js$/, 'a code file is opened by default');
  const before = app.vfs.revisionsOf(openPath).length;
  const editor = doc.querySelector('#code');
  editor.value = `${editor.value}\n// edited by test\n`;
  doc.querySelector('#btnSave').click();
  assert.equal(app.vfs.revisionsOf(openPath).length, before + 1, 'save creates a revision');
  assert.match(app.vfs.read(openPath), /edited by test/);
  assert.match(doc.querySelector('#diffView').textContent, /edited by test/, 'diff is shown');

  doc.querySelector('#btnZip').click();
  assert.equal(clicked.length, 1, 'download was triggered');
  assert.match(clicked[0].download, /\.zip$/);
  closeApp(dom, app);
});
