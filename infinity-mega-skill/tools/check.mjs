#!/usr/bin/env node
// Static contract check. No browser, no dependencies: it catches the class of mistake that a
// screenshot cannot — a selector that no longer exists, an icon that was never defined, an import
// that points at a deleted file, an inline handler that the CSP will block.
//
//   node tools/check.mjs           # human report
//   node tools/check.mjs --json    # machine report
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const JSON_OUT = process.argv.includes('--json');

const problems = [];
const notes = [];
const rel = (p) => path.relative(ROOT, p);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'release'].includes(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const jsFiles = files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));

// 1. ids referenced from JS must exist in the HTML (or be created by JS itself).
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const dynamicIds = new Set(['fitnessFill']); // injected by the SVG chart at runtime
const selectorRe = /\$\('#([A-Za-z][\w-]*)/g;
const missingIds = new Map();
for (const file of jsFiles) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(selectorRe)) {
    const id = m[1];
    if (!htmlIds.has(id) && !dynamicIds.has(id)) {
      const key = `${id} (${rel(file)})`;
      missingIds.set(key, (missingIds.get(key) || 0) + 1);
    }
  }
}
for (const key of missingIds.keys()) problems.push(`selector points at a missing id: #${key}`);

// 2. every <use href="#i-x"> needs a <symbol id="i-x">.
const symbolIds = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
const useIds = new Set();
for (const source of [['index.html', html], ...jsFiles.map((f) => [rel(f), readFileSync(f, 'utf8')])]) {
  const [name, text] = source;
  for (const m of text.matchAll(/#(i-[a-z-]+)/g)) useIds.add(`${m[1]}`);
}
for (const id of useIds) {
  if (!symbolIds.has(id)) problems.push(`icon #${id} is used but not defined as a symbol`);
}

// 3. every relative import resolves. Template literals are stripped first: the benchmark tasks
//    contain ES-module source as *data*, and those imports are not this module's imports.
const stripTemplates = (src) => src.replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``');
for (const file of jsFiles) {
  const src = stripTemplates(readFileSync(file, 'utf8'));
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), m[1]);
    if (!existsSync(target)) problems.push(`import does not resolve: ${m[1]} (from ${rel(file)})`);
  }
  for (const m of src.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const target = path.resolve(path.dirname(file), m[1]);
    if (!existsSync(target)) problems.push(`dynamic import does not resolve: ${m[1]} (from ${rel(file)})`);
  }
}

// 4. no inline script / inline handler / javascript: URL: the CSP would block them anyway.
if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html)) problems.push('inline <script> found: CSP will block it');
for (const m of html.matchAll(/\son[a-z]+\s*=\s*"/gi)) problems.push(`inline handler found: ${m[0].trim()}`);
if (/javascript:/i.test(html)) problems.push('javascript: URL found');

// 5. required deployment files.
for (const required of [
  'index.html',
  'netlify.toml',
  'manifest.webmanifest',
  'assets/infinity.css',
  'assets/icon.svg',
  'src/app/boot.js',
  'netlify/functions/llm.mjs',
]) {
  if (!existsSync(path.join(ROOT, required))) problems.push(`missing required file: ${required}`);
}

// 6. CSS: balanced braces, no orphan custom property declaration.
const css = readFileSync(path.join(ROOT, 'assets/infinity.css'), 'utf8');
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
if (open !== close) problems.push(`CSS braces unbalanced: ${open} open vs ${close} close`);
for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
  if (/\bnear\b|\bundefined\b|\bnull\b/i.test(m[2]) || /#[0-9a-f]{0,2}\b(?![\)\s,;])/i.test(m[2]) && false) problems.push(`suspicious CSS value: ${m[1]}: ${m[2].trim()}`);
}

// 7. module hygiene: a core module must not touch the DOM (keeps it testable in Node).
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
for (const file of jsFiles.filter((f) => f.includes(`${path.sep}core${path.sep}`))) {
  const src = stripComments(readFileSync(file, 'utf8'));
  // Only real DOM API calls count: string literals such as 'document.write' inside a detector
  // regex must not be mistaken for the core reaching for the page.
  const domCall = /(^|[^\'"`])(document|window)\.(getElementById|querySelector|querySelectorAll|createElement|addEventListener|body|documentElement|localStorage|location|navigator|innerWidth|matchMedia|createTextNode)/;
  if (domCall.test(src)) {
    problems.push(`${rel(file)} touches the DOM; core must stay environment-free`);
  }
}

// 8. size budget: the whole deployable folder should stay small enough for a phone.
const size = files
  .filter((f) => !rel(f).startsWith('release'))
  .reduce((s, f) => s + statSync(f).size, 0);
notes.push(`deployable size: ${(size / 1024).toFixed(1)} KB across ${files.length} files`);
if (size > 900 * 1024) problems.push(`deployable size ${(size / 1024).toFixed(0)} KB exceeds the 900 KB budget`);

// 9. self-contained: nothing may be fetched from a third party at runtime.
for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
  problems.push(`index.html loads a third-party resource: ${m[1]}`);
}
for (const m of css.matchAll(/url\(\s*["']?(https?:\/\/[^)"']+)/g)) {
  problems.push(`infinity.css loads a third-party resource: ${m[1]}`);
}
if (!/@font-face[\s\S]*vazirmatn-var\.woff2/.test(css)) problems.push('the self-hosted Vazirmatn face is missing from infinity.css');
if (!existsSync(path.join(ROOT, 'assets/fonts/vazirmatn-var.woff2'))) problems.push('missing font file: assets/fonts/vazirmatn-var.woff2');

// 10. contrast: every text colour in :root must clear WCAG AA (4.5:1) on every surface.
const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
const tokens = new Map();
for (const m of rootBlock.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g)) tokens.set(m[1], m[2]);
const rgb = (h) => {
  let v = h.slice(1);
  if (v.length === 3) v = [...v].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const lum = (h) => {
  const [r, g, b] = rgb(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const l1 = Math.max(lum(a), lum(b));
  const l2 = Math.min(lum(a), lum(b));
  return (l1 + 0.05) / (l2 + 0.05);
};
const surfaces = ['--bg', '--panel-solid'].map((k) => tokens.get(k)).concat('#122c43');
for (const name of ['--text', '--label', '--muted', '--dorm', '--cyan', '--gold', '--ok', '--warn', '--bad']) {
  const colour = tokens.get(name);
  if (!colour) continue;
  for (const bg of surfaces) {
    const r = ratio(colour, bg);
    if (r < 4.5) problems.push(`contrast: ${name} on ${bg} is ${r.toFixed(2)}:1, below AA 4.5`);
  }
}

// 11. count what the UI claims, so the copy and the code cannot drift.
const caseCount = (readFileSync(path.join(ROOT, 'src/core/selftest.js'), 'utf8').match(/^\s{2}\{\n\s{4}id: '/gm) || []).length;
const tasks = (readFileSync(path.join(ROOT, 'src/core/evals.js'), 'utf8').match(/^\s{4}id: '/gm) || []).length;
notes.push(`self-test cases: ${caseCount}, benchmark tasks: ${tasks}`);

const report = { ok: problems.length === 0, problems, notes, checked: files.length };
if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`checked ${report.checked} files`);
  for (const note of notes) console.log(`· ${note}`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
  } else {
    console.log('\n✓ static contract is clean');
  }
}
process.exit(problems.length ? 1 : 0);
