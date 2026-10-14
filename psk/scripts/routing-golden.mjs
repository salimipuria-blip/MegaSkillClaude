// Routing contract snapshot. Computes the full routeSkills() output for every case in
// tests/fixtures/routing-corpus.json and compares it, exactly, with tests/fixtures/routing-golden.json.
//   node scripts/routing-golden.mjs --check   (default; exit 1 on any difference)
//   node scripts/routing-golden.mjs --write   (only when a routing change is intentional and reviewed)
// No network. Reads only the bundled registry and verified SKILL.md files under data/.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRegistry, routeSkills} from '../engine/router.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'data');
const corpusFile = path.join(root, 'tests', 'fixtures', 'routing-corpus.json');
const goldenFile = path.join(root, 'tests', 'fixtures', 'routing-golden.json');
export const LIMIT = 8; // same limit as api/tasks.js

export function loadBundledRegistry() {
  return loadRegistry(path.join(dataDir, 'skills-registry.json'), {
    skillsRoot: dataDir,
    repairedFile: path.join(dataDir, 'skills-repaired.json'),
  });
}

export function loadCorpus(file = corpusFile) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (doc.schema !== 1 || !Array.isArray(doc.cases)) throw new Error('unsupported routing corpus');
  return doc.cases;
}

/** Deterministic snapshot: one entry per corpus case, full routeSkills() output. */
export function routingSnapshot(registry, cases) {
  return {
    schema: 1,
    limit: LIMIT,
    cases: cases.map((c) => ({id: c.id, query: c.query, output: routeSkills(registry, c.query, {limit: LIMIT})})),
  };
}

export function readGolden(file = goldenFile) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// CLI entry point
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes('--write') ? 'write' : 'check';
  const snapshot = routingSnapshot(loadBundledRegistry(), loadCorpus());
  const text = JSON.stringify(snapshot, null, 1) + '\n';
  if (mode === 'write') {
    fs.writeFileSync(goldenFile, text);
    console.log(`wrote ${path.relative(root, goldenFile)} (${snapshot.cases.length} cases, ${text.length} bytes)`);
  } else {
    const expected = fs.existsSync(goldenFile) ? fs.readFileSync(goldenFile, 'utf8') : '';
    if (expected !== text) {
      console.error('routing snapshot differs from tests/fixtures/routing-golden.json');
      process.exit(1);
    }
    console.log(`routing snapshot matches (${snapshot.cases.length} cases)`);
  }
}
