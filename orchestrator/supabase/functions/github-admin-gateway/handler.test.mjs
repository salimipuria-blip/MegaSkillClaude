import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubAdminHandler } from './handler.mjs';

// Fixture ids only; no platform credentials or network calls.
const SERVER_FIXTURE = 'server-fixture';
const OWNER = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
function fixture(overrides = {}, auth = { id: OWNER }, authStatus = 200) {
  const env = { SUPABASE_URL: 'https://auth.fixture.invalid', SUPABASE_ANON_KEY: 'public-fixture', GITHUB_ADMIN_USER_IDS: OWNER, GITHUB_ADMIN_TOKEN: SERVER_FIXTURE, ...overrides };
  const calls = [];
  const handler = createGithubAdminHandler({ getEnv: (name) => env[name], fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith(env.SUPABASE_URL)) return Response.json(auth, { status: authStatus });
    assert.ok(url.startsWith('https://api.github.com/'));
    return Response.json({ full_name: 'fixture/repo', content: { sha: 'content' }, commit: { sha: 'commit' } });
  } });
  const invoke = (body = { action: 'update_repo', owner: 'fixture', repo: 'repo', archived: true }, token = 'owner-session', method = 'POST') => handler(new Request('https://fixture.invalid/?action=update_repo', {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  }));
  return { handler, invoke, calls };
}
const githubCalls = (f) => f.calls.filter((c) => c.url.startsWith('https://api.github.com/'));

test('missing or malformed owner configuration fails closed before any API call', async () => {
  for (const env of [{ GITHUB_ADMIN_USER_IDS: '' }, { GITHUB_ADMIN_USER_IDS: 'owner' }, { SUPABASE_ANON_KEY: '' }, { SUPABASE_URL: 'http://auth.fixture.invalid' }]) {
    const f = fixture(env);
    assert.equal((await f.invoke()).status, 503);
    assert.equal(f.calls.length, 0);
  }
});

test('missing auth, anon JWTs and fabricated sessions cannot use the GitHub token', async () => {
  const missing = fixture();
  assert.equal((await missing.invoke(undefined, '')).status, 401);
  assert.equal(missing.calls.length, 0);
  for (const token of ['anon-fixture-jwt', 'forged-owner-claims']) {
    const f = fixture({}, { error: 'not a user' }, 401);
    assert.equal((await f.invoke(undefined, token)).status, 401);
    assert.equal(githubCalls(f).length, 0);
  }
  const noUser = fixture({}, { role: 'anon' });
  assert.equal((await noUser.invoke()).status, 401);
  assert.equal(githubCalls(noUser).length, 0);
});

test('an authenticated non-owner is rejected even if user metadata claims admin', async () => {
  const f = fixture({}, { id: MEMBER, user_metadata: { role: 'owner', id: OWNER } });
  const res = await f.invoke();
  assert.equal(res.status, 403);
  assert.equal(githubCalls(f).length, 0);
});

test('auth outages fail closed; no GitHub request is made', async () => {
  const f = fixture({}, {}, 500);
  assert.equal((await f.invoke()).status, 503);
  assert.equal(githubCalls(f).length, 0);
  const handler = createGithubAdminHandler({ getEnv: (name) => ({ SUPABASE_URL: 'https://auth.fixture.invalid', SUPABASE_ANON_KEY: 'public', GITHUB_ADMIN_USER_IDS: OWNER })[name], fetchImpl: async () => { throw new Error('private upstream details'); } });
  const response = await handler(new Request('https://fixture.invalid', { headers: { authorization: 'Bearer fixture' } }));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private upstream/);
});

test('only a server-verified allowlisted user can perform GitHub writes', async () => {
  const f = fixture();
  const res = await f.invoke();
  assert.equal(res.status, 200);
  assert.equal(f.calls[0].url, 'https://auth.fixture.invalid/auth/v1/user');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer owner-session');
  assert.equal(githubCalls(f).length, 1);
  assert.equal(githubCalls(f)[0].init.method, 'PATCH');
  assert.equal(githubCalls(f)[0].init.headers.Authorization, 'Bearer server-fixture');
  assert.doesNotMatch(await res.text(), /server-fixture|owner-session/);
});

test('writes require POST; malformed and oversized payloads are rejected', async () => {
  const f = fixture();
  assert.equal((await f.invoke(undefined, 'owner-session', 'GET')).status, 405);
  assert.equal(githubCalls(f).length, 0);
  const malformed = await f.handler(new Request('https://fixture.invalid', { method: 'POST', headers: { authorization: 'Bearer owner-session' }, body: '{' }));
  assert.equal(malformed.status, 400);
  assert.equal((await f.invoke({ action: 'put_file', content: 'x'.repeat(33000) })).status, 413);
  assert.equal((await f.invoke({ action: 'put_file', owner: 'fixture', repo: 'repo', path: '../file', content: 'x' })).status, 400);
  assert.equal(githubCalls(f).length, 0);
});

test('authenticated UTF-8 file updates use the requested branch and safe encoding', async () => {
  const f = fixture();
  const res = await f.invoke({ action: 'put_file', owner: 'fixture', repo: 'repo', path: 'docs/سلام.md', content: 'سلام', branch: 'fixture-branch' });
  assert.equal(res.status, 200);
  const call = githubCalls(f)[0];
  assert.equal(call.init.method, 'PUT');
  const payload = JSON.parse(call.init.body);
  assert.equal(Buffer.from(payload.content, 'base64').toString(), 'سلام');
  assert.equal(payload.branch, 'fixture-branch');
});
