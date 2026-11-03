#!/usr/bin/env node
// Build the Netlify Drop zip from this folder, deterministically enough to diff two builds.
// The zip root is the deploy root: index.html sits at the top level.
import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZip } from '../src/core/zip.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, 'release');
const OUT = path.join(OUT_DIR, 'infinity-mega-skill-netlify.zip');
const SKIP = new Set(['release', 'node_modules', '.git', '.DS_Store']);

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, base, out);
    else if (!/\.zip$/.test(name)) out.push({ path: path.relative(base, full).split(path.sep).join('/'), size: st.size });
  }
  return out;
}

const entries = walk(ROOT).map((entry) => ({ path: entry.path, content: readFileSync(path.join(ROOT, entry.path)) }));
if (!entries.some((e) => e.path === 'index.html')) {
  console.error('index.html is missing from the zip root');
  process.exit(1);
}

const zip = makeZip(entries, { date: new Date('2026-01-01T00:00:00Z') });
const bytes = zip instanceof Uint8Array ? zip : Buffer.from(await zip.arrayBuffer());
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, bytes);

const sha = createHash('sha256').update(bytes).digest('hex');
const kb = (bytes.length / 1024).toFixed(1);
console.log(`zip: ${path.relative(ROOT, OUT)}`);
console.log(`files: ${entries.length}`);
console.log(`size: ${kb} KB`);
console.log(`sha256: ${sha}`);

// Prove it opens: python's zipfile is present on nearly every machine, and an unreadable zip is a
// worse failure than a build error.
try {
  const { spawnSync } = await import('node:child_process');
  const check = spawnSync('python3', ['-m', 'zipfile', '-l', OUT], { encoding: 'utf8' });
  if (check.status === 0) {
    const lines = check.stdout.trim().split('\n').length;
    console.log(`verified: python zipfile listed ${lines} entries`);
  } else {
    console.warn('warning: python zipfile could not read the archive');
    console.warn(check.stderr.trim().slice(0, 400));
  }
} catch {
  console.warn('warning: python3 not available; skipping archive verification');
}
