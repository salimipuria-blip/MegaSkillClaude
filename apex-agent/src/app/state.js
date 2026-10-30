// Persistence: one namespaced key for the workspace, one for credentials.
//
// Keys are separated on purpose. "صدور همه" leaves them behind, "پاک‌سازی" removes both, and the
// snapshot written to the chat never contains them.

const STATE_KEY = 'apex.metacode.v3';
const KEY_KEY = 'apex.metacode.keys.v3';

export const DEFAULT_SETTINGS = {
  providerId: 'openrouter',
  model: '',
  baseUrl: '',
  rememberKey: false,
  temperature: null,
  mode: 'triad',
  infiniteGenerations: 12,
};

function safeParse(raw, fallback) {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Read whatever survived the last session. Never throws: a broken blob restores defaults. */
export function loadPersisted() {
  const ls = storage();
  if (!ls) return { state: null, keys: null };
  const state = safeParse(ls.getItem(STATE_KEY), null);
  const keys = safeParse(ls.getItem(KEY_KEY), null);
  return { state, keys };
}

/** @param {object} patch partial state; undefined values are ignored */
export function persist(patch) {
  const ls = storage();
  if (!ls) return false;
  try {
    const current = safeParse(ls.getItem(STATE_KEY), {}) || {};
    const next = { ...current, ...patch, savedAt: Date.now() };
    ls.setItem(STATE_KEY, JSON.stringify(next));
    return true;
  } catch (err) {
    // Quota is the realistic failure on a phone; the caller surfaces it instead of losing work silently.
    return { error: err?.name === 'QuotaExceededError' ? 'حافظهٔ مرورگر پر شد؛ فضای کاری را کوچک‌تر کن.' : String(err?.message || err) };
  }
}

export function saveKeys({key = '', proxyToken = '', remember = false} = {}) {
  const ls = storage();
  if (!ls) return false;
  try {
    if (!remember) {
      ls.removeItem(KEY_KEY);
      return true;
    }
    ls.setItem(KEY_KEY, JSON.stringify({ key, proxyToken, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearAll() {
  const ls = storage();
  if (!ls) return false;
  ls.removeItem(STATE_KEY);
  ls.removeItem(KEY_KEY);
  return true;
}

/** Everything a person would want to move to another browser — minus secrets. */
export function buildExport({ files, genome, memory, settings, lineage, bench }) {
  const safeSettings = { ...settings };
  delete safeSettings.key;
  delete safeSettings.proxyToken;
  return {
    app: 'apex-metacode',
    schema: 3,
    exportedAt: new Date().toISOString(),
    files,
    genome,
    memory,
    settings: safeSettings,
    lineage,
    bench,
    note: 'کلیدها عمداً صادر نشده‌اند. برای وصل‌کردن مدل، در مقصد کلید را دوباره وارد کن.',
  };
}

export function parseImport(text) {
  const data = typeof text === 'string' ? safeParse(text, null) : text;
  if (!data || data.app !== 'apex-metacode') throw new Error('این فایل، صدورِ مِتاکد نیست.');
  if (Number(data.schema) > 3) throw new Error('نسخهٔ فایل جدیدتر از این برنامه است.');
  return data;
}

export function download(name, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function storageInfo() {
  const ls = storage();
  if (!ls) return { available: false };
  let bytes = 0;
  for (let i = 0; i < ls.length; i += 1) {
    const key = ls.key(i);
    if (key?.startsWith('apex.metacode')) bytes += (ls.getItem(key) || '').length;
  }
  return { available: true, keys: ls.length, bytes };
}
