// Sandbox: run the agent's code and its tests without giving it the page, the network, or storage.
//
// Browser: a Blob Worker with fetch/XHR/WebSocket/importScripts removed, and the host kills it on
// timeout (a spinning worker cannot be interrupted from the inside). Node (CI): node:vm with a
// timeout on every case, so an infinite loop fails the test instead of hanging CI.
// Same payload, same result shape: a test that fails in CI fails in the browser for the same reason.

const TIMEOUT_MS = 1500;

export const SANDBOX_WORKER_SOURCE = `
'use strict';
// Network and storage are not features of this sandbox; they are absent.
self.fetch = () => Promise.reject(new Error('network disabled in sandbox'));
self.XMLHttpRequest = undefined;
self.WebSocket = undefined;
self.EventSource = undefined;
self.importScripts = () => { throw new Error('importScripts disabled in sandbox'); };
self.indexedDB = undefined;
self.caches = undefined;

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEqual(a[k], b[k]));
}

function matchesExpect(value, expect) {
  if (expect === 'ANY' || expect === 'NO_THROW') return true;
  if (expect && typeof expect === 'object' && typeof expect.__type === 'string') {
    if (expect.__type === 'array') return Array.isArray(value);
    if (expect.__type === 'null') return value === null;
    return typeof value === expect.__type;
  }
  return deepEqual(value, expect);
}

function hydrate(v) {
  if (Array.isArray(v)) return v.map(hydrate);
  if (v && typeof v === 'object') {
    if (typeof v.__fn === 'string') return new Function('return (' + v.__fn + ')')();
    const out = {};
    for (const k of Object.keys(v)) out[k] = hydrate(v[k]);
    return out;
  }
  return v;
}

function show(v) {
  try {
    if (typeof v === 'string') return JSON.stringify(v).slice(0, 200);
    return JSON.stringify(v)?.slice(0, 200) ?? String(v).slice(0, 200);
  } catch (_) { return String(v).slice(0, 200); }
}

async function runOne(payload) {
  const started = performance.now();
  const logs = [];
  const push = (level) => (...args) => logs.push({ level, text: args.map(show).join(' ') });
  const fakeConsole = { log: push('log'), info: push('info'), warn: push('warn'), error: push('error'), debug: push('log') };
  const entries = payload.entries || [];
  const header = 'const console = arguments[0];\\n';
  const footer = '\\n;return {' + entries
    .map((e) => e + ': typeof ' + e + ' !== "undefined" ? ' + e + ' : undefined')
    .join(', ') + '};';
  let factory;
  try {
    factory = new Function(header + payload.code + footer);
  } catch (err) {
    return { ok: false, error: 'SyntaxError: ' + err.message, logs, results: [], ms: Math.round(performance.now() - started) };
  }
  let scope;
  try {
    scope = factory(fakeConsole);
  } catch (err) {
    return { ok: false, error: 'RuntimeError: ' + err.message, logs, results: [], ms: Math.round(performance.now() - started) };
  }
  const results = [];
  const names = Object.keys(scope);
  const vals = names.map((n) => scope[n]);
  for (const c of payload.cases || []) {
    const at = performance.now();
    try {
      let value;
      if (c.expr) {
        // Expression cases exist for higher-order APIs (once(fn), groupBy(items, key)) whose
        // arguments cannot travel as JSON.
        const f = new Function(...names, 'return (async () => (' + c.expr + '))();');
        value = await f(...vals);
      } else {
        const fn = scope[c.fn];
        if (typeof fn !== 'function') throw new Error('missing function: ' + c.fn);
        value = await fn.apply(null, (c.args || []).map(hydrate));
      }
      results.push({
        name: c.name || c.fn,
        pass: matchesExpect(value, c.expect),
        got: show(value),
        expect: show(c.expect),
        ms: Math.round(performance.now() - at),
      });
    } catch (err) {
      results.push({
        name: c.name || c.fn || 'case',
        pass: c.expect === 'THROWS',
        got: 'throws: ' + err.message,
        expect: show(c.expect),
        ms: Math.round(performance.now() - at),
      });
    }
  }
  const captured = {};
  for (const name of payload.capture || []) {
    try { captured[name] = JSON.parse(JSON.stringify(scope[name])); } catch (_) { captured[name] = null; }
  }
  return {
    ok: results.every((r) => r.pass),
    logs,
    results,
    ms: Math.round(performance.now() - started),
    exported: Object.keys(scope),
    captured,
  };
}

self.onmessage = async (event) => {
  const { id, payload } = event.data || {};
  try {
    const result = await runOne(payload);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, result: { ok: false, error: String((err && err.message) || err), logs: [], results: [], ms: 0 } });
  }
};
`;

/** Remove module syntax so a plain script can be evaluated in the sandbox. */
export function stripModuleSyntax(code) {
  return String(code || '')
    .replace(/^\s*import\s+[^;]+;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, 'const __default = ')
    .replace(/^\s*export\s+(const|let|var|function|class|async\s+function)\s+/gm, '$1 ')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');
}

/** Join files into one script; test files go last so they never shadow an implementation. */
export function bundleFiles(files) {
  const entries = Object.entries(files || {}).sort(([a], [b]) => {
    const testA = /\.test\.|_test\./.test(a) ? 1 : 0;
    const testB = /\.test\.|_test\./.test(b) ? 1 : 0;
    return testA - testB || a.localeCompare(b);
  });
  return entries.map(([path, content]) => `\n// --- ${path} ---\n${stripModuleSyntax(content)}`).join('\n');
}

function payloadFor({ files, entry, cases, entries, capture }) {
  const code = entry ? stripModuleSyntax(entry) : bundleFiles(files);
  const names = entries || [...new Set((cases || []).map((c) => c.fn).filter(Boolean))];
  const payload = { code, entries: names, cases: cases || [] };
  if (capture) payload.capture = capture;
  return payload;
}

let workerSingleton = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (workerSingleton) return workerSingleton;
  const blob = new Blob([SANDBOX_WORKER_SOURCE], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { name: 'apex-sandbox' });
  worker.onmessage = (event) => {
    const { id, result } = event.data || {};
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve(result);
  };
  worker.onerror = (event) => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: `worker error: ${event.message || 'unknown'}`, logs: [], results: [], ms: 0 });
    }
    pending.clear();
  };
  workerSingleton = { worker, url };
  return workerSingleton;
}

/**
 * Execute code + cases in the sandbox.
 * @returns {Promise<{ok:boolean, error?:string, logs:Array, results:Array, ms:number, runtime:string}>}
 */
export async function runInSandbox({ files, entry, cases, entries, capture, timeoutMs = TIMEOUT_MS } = {}) {
  const payload = payloadFor({ files, entry, cases, entries, capture });
  const hasWorker =
    typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL?.createObjectURL === 'function';
  if (hasWorker) {
    const { worker } = getWorker();
    const id = ++seq;
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        // A spinning worker is replaced, not merely ignored: the next run gets a clean thread.
        try {
          worker.terminate();
          URL.revokeObjectURL(workerSingleton.url);
        } catch {
          /* already gone */
        }
        workerSingleton = null;
        resolve({ ok: false, error: `timeout after ${timeoutMs} ms`, logs: [], results: [], ms: timeoutMs });
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      worker.postMessage({ id, payload });
    });
    return { runtime: 'worker', ...result };
  }
  return { runtime: 'node', ...(await runInNode(payload, timeoutMs)) };
}

/** Node fallback for CI and node:test: every case runs inside vm with its own timeout. */
export async function runInNode(payload, timeoutMs = TIMEOUT_MS) {
  let vm;
  try {
    vm = await import('node:vm');
  } catch {
    return { ok: false, error: 'no sandbox runtime available', logs: [], results: [], ms: 0 };
  }
  const started = Date.now();
  const logs = [];
  const fakeConsole = {
    log: (...a) => logs.push({ level: 'log', text: a.map(safeShow).join(' ') }),
    info: (...a) => logs.push({ level: 'info', text: a.map(safeShow).join(' ') }),
    warn: (...a) => logs.push({ level: 'warn', text: a.map(safeShow).join(' ') }),
    error: (...a) => logs.push({ level: 'error', text: a.map(safeShow).join(' ') }),
  };
  const names = payload.entries || [];
  const footer = `\n;__out = {${names
    .map((n) => `${JSON.stringify(n)}: (() => { try { return eval(${JSON.stringify(n)}); } catch (_) { return undefined; } })()`)
    .join(', ')}};`;
  const context = vm.createContext({ console: fakeConsole, __out: {}, performance });
  try {
    vm.runInContext(`${payload.code}\n${footer}`, context, { timeout: timeoutMs, filename: 'apex-sandbox.js' });
  } catch (err) {
    return { ok: false, error: `${err.name || 'Error'}: ${err.message}`, logs, results: [], ms: Date.now() - started };
  }

  const results = [];
  for (const c of payload.cases || []) {
    const at = Date.now();
    try {
      // Args and expressions are evaluated inside the context so the timeout covers user code.
      const src = c.expr ? `(${c.expr})` : `__out[${JSON.stringify(c.fn)}](${argsToSource(c.args || [])})`;
      let value = vm.runInContext(src, context, { timeout: timeoutMs, filename: 'apex-case.js' });
      if (value && typeof value.then === 'function') value = await value;
      results.push({
        name: c.name || c.fn || 'case',
        pass: matchesExpect(value, c.expect),
        got: safeShow(value),
        expect: safeShow(c.expect),
        ms: Date.now() - at,
      });
    } catch (err) {
      results.push({
        name: c.name || c.fn || 'case',
        pass: c.expect === 'THROWS',
        got: `throws: ${err.message}`,
        expect: safeShow(c.expect),
        ms: Date.now() - at,
      });
    }
  }
  const captured = {};
  for (const name of payload.capture || []) {
    try {
      captured[name] = JSON.parse(JSON.stringify(context.__out?.[name]));
    } catch {
      captured[name] = null;
    }
  }
  return {
    ok: results.every((r) => r.pass),
    logs,
    results,
    ms: Date.now() - started,
    exported: Object.keys(context.__out || {}),
    captured,
  };
}

/** Serialise args for evaluation inside the vm; {__fn: "..."} becomes a real function. */
function argsToSource(args) {
  return args
    .map((v) => {
      if (v && typeof v === 'object' && typeof v.__fn === 'string' && Object.keys(v).length === 1) return `(${v.__fn})`;
      return JSON.stringify(v ?? null);
    })
    .join(', ');
}

function matchesExpect(value, expect) {
  if (expect === 'ANY' || expect === 'NO_THROW') return true;
  if (expect && typeof expect === 'object' && typeof expect.__type === 'string') {
    if (expect.__type === 'array') return Array.isArray(value);
    if (expect.__type === 'null') return value === null;
    return typeof value === expect.__type;
  }
  return deepEqual(value, expect);
}

function safeShow(v) {
  try {
    if (typeof v === 'string') return JSON.stringify(v).slice(0, 200);
    return JSON.stringify(v)?.slice(0, 200) ?? String(v).slice(0, 200);
  } catch {
    return String(v).slice(0, 200);
  }
}

/** Structural equality used by the Node path and by the UI when comparing probe results. */
export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEqual(a[k], b[k]));
}

/** Stop the shared worker (tab close, or a hard reset). */
export function disposeSandbox() {
  if (workerSingleton) {
    workerSingleton.worker.terminate();
    URL.revokeObjectURL(workerSingleton.url);
    workerSingleton = null;
  }
  for (const [, entry] of pending) clearTimeout(entry.timer);
  pending.clear();
}
