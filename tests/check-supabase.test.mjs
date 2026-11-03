/**
 * Mock tests for scripts/check-supabase.mjs (backlog task 37).
 *
 * Nothing here touches the network: `runChecks` receives an injected `fetchImpl`, and `main`
 * receives one too. The suite also pins EXPECTED to the SQL files on disk, so adding a table to
 * `viking_supabase_schema.sql` without teaching the checker about it fails the build instead of
 * silently shrinking what "ready" means.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXPECTED, PG, describeExpectations, main, renderReport, runChecks } from '../scripts/check-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://example-project.supabase.co';
const KEY = 'sb_publishable_test_key_not_a_secret_value';

const ok = (status, data) => ({ status, ok: status < 400, text: async () => JSON.stringify(data ?? null) });

/** Build a fetch mock from a routing table: `{ 'rest/v1/<table>?…': response, … }`. */
function mockFetch(routes, calls = []) {
  return async (target, init = {}) => {
    const path = target.replace(`${URL}/`, '');
    calls.push({ target, method: init.method ?? 'GET', body: init.body ?? null, headers: init.headers ?? {} });
    for (const [pattern, response] of Object.entries(routes)) {
      if (path.startsWith(pattern)) return typeof response === 'function' ? response(path, init) : response;
    }
    return ok(404, { code: PG.undefinedTable, message: `unmocked path: ${path}` });
  };
}

const HEALTHY = {
  'rest/v1/viking_': ok(200, []),
  'rest/v1/rpc/viking_is_': ok(403, { code: PG.insufficientPrivilege, message: 'permission denied for function' }),
  'rest/v1/rpc/viking_enforce_': ok(403, { code: PG.insufficientPrivilege, message: 'permission denied for function' }),
  'storage/v1/bucket/': ok(400, { message: 'bucket not found or not public' }),
};

test('a correctly applied schema reports ready and keeps permission-denied as proof of existence', async () => {
  const report = await runChecks({ url: URL, key: KEY, fetchImpl: mockFetch(HEALTHY) });
  assert.equal(report.ok, true);
  for (const table of EXPECTED.tables) {
    const check = report.checks.find((item) => item.name === table.name);
    assert.equal(check.state, 'ready', `${table.name} should be reachable`);
  }
  for (const fn of EXPECTED.functions) {
    const check = report.checks.find((item) => item.name === fn);
    assert.equal(check.state, 'ready', `${fn} is revoked from anon, which is the intended state`);
    assert.equal(check.code, PG.insufficientPrivilege);
  }
  const bucket = report.checks.find((item) => item.kind === 'bucket');
  assert.equal(bucket.state, 'unknown');
  assert.match(bucket.detail, /dashboard/u, 'a private bucket cannot be proven with the publishable key');
  assert.equal(report.counts.missing, 0);
  assert.equal(report.counts.insecure, 0);
});

test('an unapplied schema is reported as missing, per object, with the file to run', async () => {
  const routes = {
    'rest/v1/rpc/': ok(404, { code: PG.undefinedFunction, message: 'function does not exist' }),
    'rest/v1/viking_': ok(404, { code: PG.undefinedTable, message: 'relation does not exist' }),
    'storage/v1/bucket/': ok(404, { message: 'Bucket not found' }),
  };
  const report = await runChecks({ url: URL, key: KEY, fetchImpl: mockFetch(routes) });
  assert.equal(report.ok, false);
  assert.equal(report.counts.missing, EXPECTED.tables.length + EXPECTED.functions.length + 1);
  assert.ok(report.checks.every((check) => check.state === 'missing'));
  assert.match(renderReport(report), /apply viking-team\/sql/u);
});

test('a renamed column, an over-granted function and a public bucket are each called out', async () => {
  const drift = await runChecks({
    url: URL, key: KEY,
    fetchImpl: mockFetch({ 'rest/v1/viking_trip_media': ok(400, { code: PG.undefinedColumn, message: 'column viking_trip_media.size does not exist' }), ...HEALTHY }),
  });
  assert.equal(drift.ok, false);
  assert.equal(drift.checks.find((c) => c.name === 'viking_trip_media').state, 'drift');

  const granted = await runChecks({
    url: URL, key: KEY,
    fetchImpl: mockFetch({ 'rest/v1/rpc/viking_is_admin': ok(200, false), ...HEALTHY }),
  });
  assert.equal(granted.ok, false);
  const admin = granted.checks.find((c) => c.name === 'viking_is_admin');
  assert.equal(admin.state, 'insecure');
  assert.match(admin.detail, /granted to anon/u);

  const publicBucket = await runChecks({
    url: URL, key: KEY,
    // same key as HEALTHY's entry, so it must come *after* the spread to win (a new, narrower
  // pattern instead has to come first, because matching walks insertion order)
  fetchImpl: mockFetch({ ...HEALTHY, 'storage/v1/bucket/': ok(200, { id: EXPECTED.bucket, public: true }) }),
  });
  assert.equal(publicBucket.checks.find((c) => c.kind === 'bucket').state, 'insecure');
});

test('every request it makes is read-only: GET, or an RPC POST with an empty argument object', async () => {
  const calls = [];
  const report = await runChecks({ url: URL, key: KEY, fetchImpl: mockFetch(HEALTHY, calls) });
  assert.equal(calls.length, EXPECTED.tables.length + EXPECTED.functions.length + 1);
  for (const call of calls) {
    if (call.method === 'GET') {
      if (call.target.includes('/rest/v1/')) {
        assert.match(call.target, /[?&]limit=1/u, `table probes must stay bounded: ${call.target}`);
      }
      assert.equal(call.body, null);
    } else {
      assert.equal(call.method, 'POST');
      assert.match(call.target, /\/rest\/v1\/rpc\//u, `only RPC calls may POST: ${call.target}`);
      assert.deepEqual(JSON.parse(call.body), {}, 'an RPC probe must send no arguments');
    }
    assert.equal(call.headers.apikey, KEY);
    assert.equal(call.headers.Authorization, `Bearer ${KEY}`);
  }
  assert.deepEqual(report.requests.map((request) => request.method).filter((method) => method !== 'GET').length,
    EXPECTED.functions.length);
});

test('the key never reaches the report, the rendered text or the JSON output', async () => {
  const report = await runChecks({ url: URL, key: KEY, fetchImpl: mockFetch(HEALTHY) });
  for (const rendered of [JSON.stringify(report), renderReport(report), describeExpectations()]) {
    assert.equal(rendered.includes(KEY), false);
    assert.equal(rendered.includes(KEY.slice(0, 12)), false);
  }
  assert.equal(report.keyLength, KEY.length, 'only the length is reported, as a sanity hint');
});

test('a project URL that differs from the browser client is flagged as drift', async () => {
  const drifted = await runChecks({
    url: URL, key: KEY, fetchImpl: mockFetch(HEALTHY),
    clientSource: "const SUPABASE_URL = 'https://other-project.supabase.co';",
  });
  assert.equal(drifted.warnings.length, 1);
  assert.match(drifted.warnings[0], /different project/u);

  const matching = await runChecks({
    url: URL, key: KEY, fetchImpl: mockFetch(HEALTHY),
    clientSource: `const SUPABASE_URL = '${URL}';`,
  });
  assert.deepEqual(matching.warnings, []);
});

test('missing credentials fail before any request is made', async () => {
  const never = () => { throw new Error('fetch must not be called without credentials'); };
  await assert.rejects(() => runChecks({ url: URL, key: '', fetchImpl: never }), /publishable/u);
  await assert.rejects(() => runChecks({ url: 'ftp://nope', key: KEY, fetchImpl: never }), /https/u);
  await assert.rejects(() => runChecks({ url: URL, key: KEY }), /fetchImpl/u);
  assert.equal(await main([], {}), 2, 'no env credentials ⇒ usage error, exit 2');
});

test('main() drives the same checks: exit 0 when ready, 1 when missing, JSON on request', async (t) => {
  const written = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
  t.after(() => { process.stdout.write = original; });

  assert.equal(await main(['--expected-only'], {}, never), 0);
  assert.match(written.join(''), /no writes/u);

  written.length = 0;
  assert.equal(await main([], { SUPABASE_URL: URL, SUPABASE_PUBLISHABLE_KEY: KEY }, mockFetch(HEALTHY)), 0);
  assert.match(written.join(''), /VERDICT: nothing promised/u);

  written.length = 0;
  const code = await main(['--json'], { SUPABASE_URL: URL, SUPABASE_ANON_KEY: KEY },
    mockFetch({ 'rest/v1/': ok(404, { code: PG.undefinedTable, message: 'nope' }), 'storage/v1/': ok(404, {}) }));
  assert.equal(code, 1);
  const payload = JSON.parse(written.join(''));
  assert.equal(payload.ok, false);
  assert.equal(payload.requests, undefined, 'the raw request log stays out of the JSON output');
  assert.equal(JSON.stringify(payload).includes(KEY), false);
});

function never() { throw new Error('fetch must not be called in --expected-only mode'); }

test('EXPECTED is anchored to the SQL files, so a new table cannot slip past the checker', () => {
  const schema = readFileSync(join(ROOT, EXPECTED.sqlFiles[0]), 'utf8');
  const limits = readFileSync(join(ROOT, EXPECTED.sqlFiles[1]), 'utf8');
  for (const table of EXPECTED.tables) {
    assert.match(schema, new RegExp(`create table if not exists public\\.${table.name} \\(`, 'u'), `${table.name} is not created by the schema file`);
    for (const column of table.columns) {
      const block = schema.slice(schema.indexOf(`public.${table.name} (`));
      assert.match(block.slice(0, block.indexOf(');')), new RegExp(`^\\s*${column} `, 'mu'), `${table.name}.${column} is not in the schema`);
    }
  }
  for (const fn of EXPECTED.functions) {
    const source = fn === 'viking_enforce_five_active_members' ? limits : schema;
    assert.match(source, new RegExp(`create or replace function public\\.${fn}\\(\\)`, 'u'), `${fn}() is not defined in the SQL files`);
  }
  assert.match(schema, new RegExp(`'${EXPECTED.bucket}'`, 'u'), 'the private bucket id is not in the schema file');
  assert.ok(readFileSync(join(ROOT, EXPECTED.clientFile), 'utf8').includes('SUPABASE_URL'), 'the client file no longer holds SUPABASE_URL');
});
