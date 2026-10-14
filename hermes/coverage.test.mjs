// Guard for the syntax gate: npm run check lists every runtime module explicitly, so a new
// .mjs file silently joins the Worker bundle without ever being parsed. This test fails when a
// module (or a test file) is missing from the scripts, which is the only place the list lives.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const dir = new URL('.', import.meta.url);
const NAMES = /[A-Za-z0-9._/-]+\.(?:mjs|sh)/g;
const listed = (script) => new Set((script || '').match(NAMES) || []);

test('npm run check parses every runtime module', () => {
  const modules = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
  const checked = listed(pkg.scripts.check);
  assert.deepEqual(
    modules.filter((m) => !checked.has(m)),
    [],
    'add to scripts.check: node --check <module>',
  );
  assert.ok(modules.length >= 25, `expected the full Hermes module set, found ${modules.length}`);
});

test('every committed test file runs in either the unit or the integration script', () => {
  // conversation.test.mjs drives a real workerd and belongs to test:integration on purpose;
  // the guard is that no test file is orphaned from both.
  const tests = readdirSync(dir).filter((f) => f.endsWith('.test.mjs'));
  const run = new Set([...listed(pkg.scripts.test), ...listed(pkg.scripts['test:integration'])]);
  assert.deepEqual(tests.filter((t) => !run.has(t)), [], 'add to scripts.test or scripts.test:integration');
});

test('npm run lint:shell parses every committed shell script', () => {
  const root = readdirSync(dir).filter((f) => f.endsWith('.sh'));
  const nested = readdirSync(new URL('./tests/', import.meta.url))
    .filter((f) => f.endsWith('.sh'))
    .map((f) => 'tests/' + f);
  const parsed = listed(pkg.scripts['lint:shell']);
  assert.deepEqual([...root, ...nested].filter((s) => !parsed.has(s)), [], 'add to scripts.lint:shell');
});

test('postinstall builds skills but never force-pushes secrets', () => {
  // `npm ci --ignore-scripts` must stay safe on a contributor machine: the sync step only exists so
  // a real deployment can refresh secrets. A silent --force/--write flag here would be a red flag.
  const postinstall = pkg.scripts.postinstall || '';
  assert.match(postinstall, /build-skills\.mjs/);
  assert.doesNotMatch(postinstall, /--force|--write|--push/);
});
