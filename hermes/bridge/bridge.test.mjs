// P0 tests for the local bridge: path guard, read-only tools, dispatcher, and a static
// check that no write-capable API is reachable from bridge code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeError, isDeniedRelative, resolveReadPath } from './paths.mjs';
import { createContext, runJob } from './dispatcher.mjs';
import { LIMITS, gitStatusTool, listDirTool, readFileTool, searchTool } from './tools.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function makeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'bridge-root-'));
  mkdirSync(path.join(root, 'src'));
  mkdirSync(path.join(root, '.git'));
  mkdirSync(path.join(root, 'node_modules'));
  writeFileSync(path.join(root, 'README.md'), 'hello bridge\nsecond line Needle\n');
  writeFileSync(path.join(root, 'src', 'app.mjs'), 'export const x = 1; // needle here\n');
  writeFileSync(path.join(root, '.env'), 'GEMINI_API_KEY=should-never-leak\n');
  writeFileSync(path.join(root, '.env.example'), 'GEMINI_API_KEY=\n');
  writeFileSync(path.join(root, '.git', 'config'), '[remote]\n');
  writeFileSync(path.join(root, 'node_modules', 'dep.js'), 'needle in deps\n');
  writeFileSync(path.join(root, 'server.pem'), '-----BEGIN PRIVATE KEY-----\n');
  writeFileSync(path.join(root, 'bin.dat'), Buffer.from([0x50, 0x00, 0x4b]));
  return root;
}

function makeOutside() {
  const dir = mkdtempSync(path.join(tmpdir(), 'bridge-outside-'));
  writeFileSync(path.join(dir, 'secret.txt'), 'outside secret\n');
  return dir;
}

// ---------- path guard ----------

test('isDeniedRelative protects secrets and .git but allows the env template', () => {
  for (const p of ['.env', '.env.local', 'app/.env.production', '.git/config', 'keys/server.pem', 'id_rsa', '.netrc', 'a/b.key']) {
    assert.equal(isDeniedRelative(p), true, p);
  }
  assert.equal(isDeniedRelative('.env.example'), false);
  assert.equal(isDeniedRelative('src/app.mjs'), false);
});

test('resolveReadPath rejects malformed and traversing input', () => {
  const root = makeRepo();
  const rootReal = createContext(root).rootReal;
  const bad = [
    '/etc/passwd',
    '../outside',
    'src/../../outside',
    'a\0b',
    'src\\app.mjs',
    'C:/windows',
    42,
    'x'.repeat(LIMITS.searchQueryMax + 400),
  ];
  for (const input of bad) {
    assert.throws(() => resolveReadPath(rootReal, input), BridgeError, String(input).slice(0, 30));
  }
});

test('resolveReadPath refuses symlinks that escape the root', () => {
  const root = makeRepo();
  const outside = makeOutside();
  symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'link.txt'));
  const rootReal = createContext(root).rootReal;
  assert.throws(() => resolveReadPath(rootReal, 'link.txt'), (e) => e.code === 'OUTSIDE_ROOT');
});

test('resolveReadPath refuses a harmless-looking symlink that points at a protected file', () => {
  const root = makeRepo();
  symlinkSync(path.join(root, '.env'), path.join(root, 'notes.txt'));
  const rootReal = createContext(root).rootReal;
  assert.throws(() => resolveReadPath(rootReal, 'notes.txt'), (e) => e.code === 'DENIED');
});

test('resolveReadPath returns the real relative path for an inside symlink', () => {
  const root = makeRepo();
  symlinkSync(path.join(root, 'src', 'app.mjs'), path.join(root, 'alias.mjs'));
  const rootReal = createContext(root).rootReal;
  assert.equal(resolveReadPath(rootReal, 'alias.mjs').rel, 'src/app.mjs');
});

test('createContext rejects a missing or non-directory root', () => {
  assert.throws(() => createContext(path.join(tmpdir(), 'does-not-exist-bridge')), (e) => e.code === 'BAD_ROOT');
  const root = makeRepo();
  assert.throws(() => createContext(path.join(root, 'README.md')), (e) => e.code === 'BAD_ROOT');
});

// ---------- read_file ----------

test('read_file returns text and refuses secrets, binaries, directories and oversized files', () => {
  const root = makeRepo();
  const ctx = createContext(root);
  const ok = readFileTool(ctx, { path: 'src/app.mjs' });
  assert.equal(ok.path, 'src/app.mjs');
  assert.match(ok.content, /needle here/);

  assert.throws(() => readFileTool(ctx, { path: '.env' }), (e) => e.code === 'DENIED');
  assert.throws(() => readFileTool(ctx, { path: '.git/config' }), (e) => e.code === 'DENIED');
  assert.throws(() => readFileTool(ctx, { path: 'bin.dat' }), (e) => e.code === 'BINARY');
  assert.throws(() => readFileTool(ctx, { path: 'src' }), (e) => e.code === 'NOT_A_FILE');
  assert.throws(() => readFileTool(ctx, { path: 'README.md', maxBytes: 4 }), (e) => e.code === 'TOO_LARGE');
  assert.throws(() => readFileTool(ctx, { path: 'README.md', maxBytes: 'big' }), (e) => e.code === 'BAD_ARGS');
});

test('read_file never returns secret contents even when asked for .env.example by name only', () => {
  const root = makeRepo();
  const out = readFileTool(createContext(root), { path: '.env.example' });
  assert.equal(out.content, 'GEMINI_API_KEY=\n');
});

// ---------- list_dir ----------

test('list_dir shows directories first, hides protected entries and skips symlinks that escape', () => {
  const root = makeRepo();
  const outside = makeOutside();
  symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'escape.txt'));
  const out = listDirTool(createContext(root), { path: '.' });
  const names = out.entries.map((e) => e.name);
  assert.equal(out.entries[0].type, 'dir');
  assert.ok(names.includes('src'));
  assert.ok(names.includes('README.md'));
  assert.ok(names.includes('.env.example'));
  for (const hidden of ['.env', '.git', 'server.pem', 'escape.txt']) {
    assert.ok(!names.includes(hidden), `${hidden} must be hidden`);
  }
});

// ---------- search ----------

test('search finds literal matches case-insensitively and skips protected and vendored paths', () => {
  const root = makeRepo();
  const out = searchTool(createContext(root), { query: 'needle' });
  const files = out.matches.map((m) => m.path).sort();
  assert.deepEqual(files, ['README.md', 'src/app.mjs']);
  assert.ok(out.matches.every((m) => m.text.length <= LIMITS.searchLineChars));
  assert.ok(!out.matches.some((m) => /should-never-leak/.test(m.text)));
});

test('search does not leak .env content and respects maxResults', () => {
  const root = makeRepo();
  const ctx = createContext(root);
  const leak = searchTool(ctx, { query: 'should-never-leak' });
  assert.equal(leak.matches.length, 0);
  const capped = searchTool(ctx, { query: 'ne', maxResults: 1 });
  assert.equal(capped.matches.length, 1);
  assert.equal(capped.truncated, true);
});

test('search validates its query length', () => {
  const ctx = createContext(makeRepo());
  assert.throws(() => searchTool(ctx, { query: 'a' }), (e) => e.code === 'BAD_ARGS');
  assert.throws(() => searchTool(ctx, { query: 'x'.repeat(LIMITS.searchQueryMax + 1) }), (e) => e.code === 'BAD_ARGS');
});

// ---------- git_status ----------

test('git_status reports the branch and changes of a real repository', async () => {
  const root = makeRepo();
  execFileSync('git', ['init', '-q', '-b', 'work'], { cwd: root });
  writeFileSync(path.join(root, 'new.txt'), 'x\n');
  const out = await gitStatusTool(createContext(root));
  assert.match(out.branch, /^## (No commits yet on )?work/);
  assert.ok(out.changes.some((line) => line.includes('new.txt')));
});

test('git_status turns a git failure into a BridgeError, not a crash', async () => {
  const root = makeRepo(); // not a git repository
  await assert.rejects(gitStatusTool(createContext(root)), (e) => e instanceof BridgeError && e.code === 'GIT_FAILED');
});

// ---------- dispatcher ----------

test('runJob runs read-only actions and rejects everything else', async () => {
  const root = makeRepo();
  const ctx = createContext(root);
  const out = await runJob(ctx, { action: 'read_file', args: { path: 'README.md' } });
  assert.equal(out.ok, true);
  assert.equal(out.action, 'read_file');

  for (const action of ['propose_edit', 'run_allowlisted', 'commit', 'push', 'write_file', 'delete', '__proto__', 'constructor']) {
    await assert.rejects(runJob(ctx, { action, args: {} }), (e) => e.code === 'NOT_ALLOWED', action);
  }
  await assert.rejects(runJob(ctx, null), (e) => e.code === 'BAD_JOB');
  await assert.rejects(runJob(ctx, ['read_file']), (e) => e.code === 'BAD_JOB');
});

test('runJob keeps the largest allowed read under the result size cap', async () => {
  const root = makeRepo();
  writeFileSync(path.join(root, 'max.txt'), 'a'.repeat(LIMITS.readMaxBytes));
  const out = await runJob(createContext(root), { action: 'read_file', args: { path: 'max.txt', maxBytes: LIMITS.readMaxBytes } });
  assert.equal(out.ok, true);
  assert.equal(out.result.bytes, LIMITS.readMaxBytes);
  assert.ok(JSON.stringify(out).length < 256 * 1024);
});

// ---------- static guard: P0 is read-only ----------

test('bridge source contains no write-capable filesystem or shell API', () => {
  const sources = readdirSync(here)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .map((f) => [f, readFileSync(path.join(here, f), 'utf8')]);
  // Bare calls only: a method such as regex.exec(...) is not a shell call, so a preceding '.' is allowed.
  const forbidden = /(?<![.\w])(writeFile|writeFileSync|appendFile|appendFileSync|unlink|unlinkSync|rm|rmSync|rmdir|rename|renameSync|mkdir|mkdirSync|copyFile|copyFileSync|symlink|symlinkSync|chmod|truncate|createWriteStream|spawn|exec)\s*\(|shell:\s*true/;
  for (const [file, text] of sources) {
    assert.doesNotMatch(text, forbidden, `${file} must stay read-only in P0`);
  }
});
