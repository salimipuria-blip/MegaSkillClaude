// Builds public/BISON-Brand-Book.zip: an offline copy that works when index.html is double-clicked.
//
// Why a separate build: Vite emits <script type="module" crossorigin> and <link crossorigin>.
// From file:// Chrome treats the page as origin "null" and blocks both (CORS), so the ZIP opened
// unstyled with no JavaScript. The shipped ZIP was also built with root-absolute /assets/ paths,
// which point at the disk root offline. Here we build with relative paths, drop `crossorigin`,
// and load the bundle as a classic deferred script wrapped in an IIFE (it has no import/export).
//
// Usage: npm run zip   (needs the `zip` CLI; run after any change to index.html, src/ or public/)
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, rmSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist-offline');
const zip = join(root, 'public', 'BISON-Brand-Book.zip');

rmSync(out, {recursive: true, force: true});
execFileSync('npx', ['vite', 'build', '--base', './', '--outDir', 'dist-offline', '--emptyOutDir'], {cwd: root, stdio: 'inherit'});

const assets = join(out, 'assets');
for (const file of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
  const code = readFileSync(join(assets, file), 'utf8');
  if (/^\s*(import|export)\b|\bimport\s*\(|import\.meta/m.test(code)) {
    throw new Error(`${file} still uses module syntax; it cannot run as a classic script offline`);
  }
  writeFileSync(join(assets, file), `(()=>{${code}\n})();\n`);
}

const indexPath = join(out, 'index.html');
let html = readFileSync(indexPath, 'utf8')
  .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
  .replace(/(<link rel="stylesheet") crossorigin (href="\.\/)/g, '$1 $2')
  // The offline copy IS the ZIP, so its own "Download ZIP" links have nothing to point at.
  .replace(/\s*<a [^>]*href="\/BISON-Brand-Book\.zip"[^>]*>[^<]*<\/a>/g, '');
if (/type="module"|crossorigin href="\.\/|crossorigin src=/.test(html) || /(src|href)="\/(?!\/)/.test(html)) {
  throw new Error('offline index.html still has module scripts, local crossorigin or root-absolute paths');
}
writeFileSync(indexPath, html);

// The ZIP must not contain itself or the hosted download page.
for (const f of ['BISON-Brand-Book.zip', 'download.html']) rmSync(join(out, f), {force: true});
rmSync(zip, {force: true});
execFileSync('zip', ['-q', '-r', '-X', zip, '.'], {cwd: out, stdio: 'inherit'});
rmSync(out, {recursive: true, force: true});
if (!existsSync(zip)) throw new Error('zip was not written');
console.log(`[zip] wrote ${zip}`);
