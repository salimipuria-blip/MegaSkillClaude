// Shared jsdom harness. Boots the real app once per case, with the browser APIs jsdom lacks stubbed
// at the boundary, and records every error the page would have shown a user.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');

let JSDOM = null;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  JSDOM = null;
}
export { JSDOM };

let bootCounter = 0;

export const waitFor = async (check, { timeout = 20000, step = 40, label = 'condition' } = {}) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`timed out waiting for ${label}`);
};

export const closeApp = (dom, app) => {
  try {
    app?.dispose?.();
  } catch {
    /* already disposed */
  }
  dom.window.close();
};

/** Boot the app in jsdom. Returns the window, the app facade and a log of every error it raised. */
export async function bootApp({ quietConsole = true } = {}) {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:8080/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const errors = [];
  const consoleErrors = [];

  window.addEventListener('error', (e) => errors.push(`error: ${e.message || e.error?.message || 'unknown'}`));
  window.addEventListener('unhandledrejection', (e) => errors.push(`rejection: ${e.reason?.message || e.reason}`));
  const realError = window.console.error.bind(window.console);
  window.console.error = (...args) => {
    consoleErrors.push(args.map(String).join(' '));
    if (!quietConsole) realError(...args);
  };
  window.console.warn = () => {};

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

  // Node caches ES modules; a query string forces boot.js to run again for each case.
  bootCounter += 1;
  await import(`${pathToFileURL(path.join(ROOT, 'src/app/boot.js')).href}?case=${bootCounter}`);
  await waitFor(() => window.__apex, { label: 'app boot' });
  return { dom, window, app: window.__apex, clicked, errors, consoleErrors };
}
