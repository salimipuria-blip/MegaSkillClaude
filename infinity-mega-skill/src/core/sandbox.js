// Sandbox: run the agent's code and its tests without giving it the page, the network, or storage.
//
// Browser: a Blob Worker with fetch/XHR/WebSocket/importScripts removed, and the host kills it on
// timeout (a spinning worker cannot be interrupted from the inside). Node (CI): node:vm with a
// timeout on every case, so an infinite loop fails the test instead of hanging CI.
// Same payload, same result shape: a test that fails in CI fails in the browser for the same reason.

const TIMEOUT_MS = 1500;

// The sandbox worker is generated from the payload and compiled as a *script*, never with
// new Function(): the deployment CSP (script-src 'self' blob:) has no 'unsafe-eval', so anything
// built from a string is blocked in the browser — which is exactly where it has to run.
const WORKER_PREFIX = `
'use strict';
const __kill = (name, value) => {
  try { Object.defineProperty(self, name, { value, configurable: true, writable: true }); }
  catch (_) { try { delete self[name]; } catch (_) {} }
};
// Keep one private handle before the user code can touch the global.
const __post = self.postMessage.bind(self);
__kill('postMessage');
__kill('fetch', () => Promise.reject(new Error('network disabled in sandbox')));
__kill('XMLHttpRequest');
__kill('WebSocket');
__kill('EventSource');
__kill('indexedDB');
__kill('caches');
__kill('importScripts', () => { throw new Error('importScripts disabled in sandbox'); });

const __show = (v) => {
  try {
    if (typeof v === 'string') return JSON.stringify(v).slice(0, 200);
    return JSON.stringify(v)?.slice(0, 200) ?? String(v).slice(0, 200);
  } catch (_) { return String(v).slice(0, 200); }
};
const __deep = (a, b) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => __deep(v, b[i]));
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && __deep(a[k], b[k]));
};
const __match = (value, expect) => {
  if (expect === 'ANY' || expect === 'NO_THROW') return true;
  if (expect && typeof expect === 'object' && typeof expect.__type === 'string') {
    if (expect.__type === 'array') return Array.isArray(value);
    if (expect.__type === 'null') return value === null;
    return typeof value === expect.__type;
  }
  return __deep(value, expect);
};
const __hydrate = (v) => {
  if (Array.isArray(v)) return v.map(__hydrate);
  if (v && typeof v === 'object') {
    if (typeof v.__fnRef === 'number') return __FNS[v.__fnRef];
    const out = {};
    for (const k of Object.keys(v)) out[k] = __hydrate(v[k]);
    return out;
  }
  return v;
};
`;

/** Turn any {__fn: "…"} inside case args into an index into __FNS (no eval, ever). */
function liftFunctionArgs(value, fns) {
  if (Array.isArray(value)) return value.map((v) => liftFunctionArgs(v, fns));
  if (value && typeof value === 'object') {
    if (typeof value.__fn === 'string') {
      fns.push(value.__fn);
      return { __fnRef: fns.length - 1 };
    }
    const out = {};
    for (const key of Object.keys(value)) out[key] = liftFunctionArgs(value[key], fns);
    return out;
  }
  return value;
}

/** Build the whole worker script for one payload: prefix + user code + case runner. */
export function buildWorkerSource(payload = {}) {
  const fns = [];
  const cases = (payload.cases || []).map((c) => {
    const { expr, ...rest } = c;
    return { ...rest, args: liftFunctionArgs(rest.args || [], fns) };
  });
  const exprs = (payload.cases || []).map((c) => c.expr || null);
  const exportList = (payload.entries || [])
    .map((n) => `${JSON.stringify(n)}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`)
    .join(', ');
  return `${WORKER_PREFIX}
const __FNS = [${fns.map((f) => '(' + f + ')').join(',')}];
const __EXPRS = [${exprs.map((e) => (e ? 'async () => (' + e + ')' : 'null')).join(',')}];
const __CASES = ${JSON.stringify(cases)};
const __CAPTURE = ${JSON.stringify(payload.capture || [])};
const __logs = [];
const __push = (level) => (...args) => __logs.push({ level, text: args.map(__show).join(' ') });
const console = { log: __push('log'), info: __push('info'), warn: __push('warn'), error: __push('error'), debug: __push('log') };
const __started = performance.now();
const __out = (async () => {
  let scope = {};
  const results = [];
  try {
    scope = await (async function () {
${payload.code || ''}
      const __exports = { ${exportList} };
      for (let i = 0; i < __CASES.length; i += 1) {
        const c = __CASES[i];
        const at = performance.now();
        try {
          let value;
          if (__EXPRS[i]) value = await __EXPRS[i]();
          else {
            const fn = __exports[c.fn];
            if (typeof fn !== 'function') throw new Error('missing function: ' + c.fn);
            value = await fn.apply(null, (c.args || []).map(__hydrate));
          }
          results.push({ name: c.name || c.fn, pass: __match(value, c.expect), got: __show(value), expect: __show(c.expect), ms: Math.round(performance.now() - at) });
        } catch (err) {
          results.push({ name: c.name || c.fn || 'case', pass: c.expect === 'THROWS', got: 'throws: ' + (err && err.message), expect: __show(c.expect), ms: Math.round(performance.now() - at) });
        }
      }
      return __exports;
    })();
  } catch (err) {
    return { ok: false, error: ((err && err.name) || 'Error') + ': ' + ((err && err.message) || String(err)), logs: __logs, results, ms: Math.round(performance.now() - __started) };
  }
  const captured = {};
  for (const name of __CAPTURE) {
    try { captured[name] = JSON.parse(JSON.stringify(scope[name])); } catch (_) { captured[name] = null; }
  }
  return {
    ok: results.every((r) => r.pass),
    logs: __logs,
    results,
    ms: Math.round(performance.now() - __started),
    exported: Object.keys(scope),
    captured,
  };
})();
__out.then((result) => __post(result));
`;
}

/**
 * Run one payload in a fresh worker. One worker per run: the script has to contain the code, and a
 * spinning worker is disposed by terminating it rather than by asking it to stop.
 */
function runInWorker(payload, timeoutMs) {
  return new Promise((resolve) => {
    let url = '';
    let worker = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { worker?.terminate(); } catch { /* already gone */ }
      try { URL.revokeObjectURL(url); } catch { /* already revoked */ }
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: `timeout after ${timeoutMs} ms`, logs: [], results: [], ms: timeoutMs }),
      timeoutMs,
    );
    try {
      url = URL.createObjectURL(new Blob([buildWorkerSource(payload)], { type: 'text/javascript' }));
      worker = new Worker(url, { name: 'infinity-sandbox' });
    } catch (err) {
      finish({ ok: false, error: `worker could not start: ${err?.message || err}`, logs: [], results: [], ms: 0 });
      return;
    }
    worker.onmessage = (event) => finish(event.data || { ok: false, error: 'empty worker reply', logs: [], results: [], ms: 0 });
    worker.onerror = (event) => {
      event.preventDefault?.();
      finish({
        ok: false,
        // A syntax error in the model's code lands here, with the engine's own message.
        error: `${event?.error?.name || 'WorkerError'}: ${event?.message || 'worker crashed'}`,
        logs: [],
        results: [],
        ms: 0,
      });
    };
  });
}

/** Kept for callers that tore the old singleton down; workers are per-run now. */
export function disposeSandbox() {
  /* nothing persistent to dispose */
}

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

/**
 * Execute code + cases in the sandbox.
 * @returns {Promise<{ok:boolean, error?:string, logs:Array, results:Array, ms:number, runtime:string}>}
 */
export async function runInSandbox({ files, entry, cases, entries, capture, timeoutMs = TIMEOUT_MS } = {}) {
  const payload = payloadFor({ files, entry, cases, entries, capture });
  const hasWorker =
    typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL?.createObjectURL === 'function';
  if (hasWorker) {
    return { runtime: 'worker', ...(await runInWorker(payload, timeoutMs)) };
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
    vm.runInContext(`${payload.code}\n${footer}`, context, { timeout: timeoutMs, filename: 'infinity-sandbox.js' });
  } catch (err) {
    return { ok: false, error: `${err.name || 'Error'}: ${err.message}`, logs, results: [], ms: Date.now() - started };
  }

  const results = [];
  for (const c of payload.cases || []) {
    const at = Date.now();
    try {
      // Args and expressions are evaluated inside the context so the timeout covers user code.
      const src = c.expr ? `(${c.expr})` : `__out[${JSON.stringify(c.fn)}](${argsToSource(c.args || [])})`;
      let value = vm.runInContext(src, context, { timeout: timeoutMs, filename: 'infinity-case.js' });
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
