// ============================================================
// DS-THEME-DARK-LIGHT — Theme Toggle Script
// Depends on: ds-design-tokens/tokens/css-variables.css
// ============================================================

const STORAGE_KEY = 'ds-theme';
const THEME_ATTR = 'data-theme';

function getSavedTheme() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function applyTheme(theme) {
  document.documentElement.setAttribute(THEME_ATTR, theme);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
}

function initTheme() {
  const saved = getSavedTheme();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute(THEME_ATTR) || 'light';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

initTheme();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toggleTheme, initTheme, applyTheme };
}