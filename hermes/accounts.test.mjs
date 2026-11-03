// Team account management for the owner: create, disable/enable, reset — app API and Telegram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { appKey } from './worker.mjs';
import { createAccount, listAccounts, setDisabled, resetPassword, accountCommand, generatePassword } from './accounts.mjs';

const OWNER = '123456789';

function kv() {
  const store = new Map();
  return {
    store,
    async get(k, type) {
      if (!store.has(k)) return null;
      const v = store.get(k);
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}
const baseEnv = () => ({ FREE_TEXT: 'off', TELEGRAM_BOT_TOKEN: '1:abc', ALLOWED_USER_ID: OWNER, MEMORY: kv() });

const call = (env, path, { key, body, method } = {}) => worker.fetch(new Request(`https://h.workers.dev${path}`, {
  method: method || (body ? 'POST' : 'GET'),
  headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}), env, { waitUntil() {} });

const login = async (env, username, password) => {
  const res = await call(env, '/api/login', { body: { username, password } });
  return { status: res.status, data: await res.json() };
};

test('generatePassword: three groups of 4 unambiguous characters', () => {
  const p = generatePassword();
  assert.match(p, /^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
  assert.doesNotMatch(p, /[01lIoO]/);
});

test('created account can log in; listing never exposes hashes', async () => {
  const env = baseEnv();
  const a = await createAccount(env, { username: 'Sara', name: 'سارا', role: 'member', locks: ['viking', 'nope'] }, { viking: {} });
  assert.equal(a.username, 'sara');
  const ok = await login(env, 'sara', a.password);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data.user.locks, ['viking']);
  const list = await listAccounts(env);
  const sara = list.find((x) => x.username === 'sara');
  assert.equal(sara.builtin, false);
  assert.ok(list.every((x) => !('hash' in x) && !('salt' in x)));
});

test('createAccount rejects bad usernames, missing names, bad roles and duplicates', async () => {
  const env = baseEnv();
  await assert.rejects(createAccount(env, { username: '1bad', name: 'x' }), /نام کاربری/);
  await assert.rejects(createAccount(env, { username: 'okname', name: '' }), /نام نمایشی/);
  await assert.rejects(createAccount(env, { username: 'okname', name: 'x', role: 'owner' }), /نقش/);
  await assert.rejects(createAccount(env, { username: 'pouria', name: 'x' }), /وجود دارد/); // built-in
  await createAccount(env, { username: 'okname', name: 'x' });
  await assert.rejects(createAccount(env, { username: 'okname', name: 'y' }), /وجود دارد/);
});

test('disabling blocks login and ends open sessions; enabling restores login', async () => {
  const env = baseEnv();
  const a = await createAccount(env, { username: 'nima', name: 'نیما' });
  const { data } = await login(env, 'nima', a.password);
  assert.equal((await call(env, '/api/me', { key: data.token })).status, 200);
  await setDisabled(env, 'nima', true);
  assert.equal((await call(env, '/api/me', { key: data.token })).status, 401);
  assert.equal((await login(env, 'nima', a.password)).status, 403);
  await setDisabled(env, 'nima', false);
  assert.equal((await login(env, 'nima', a.password)).status, 200);
});

test('reset issues a new password, kills the old one and old sessions', async () => {
  const env = baseEnv();
  const a = await createAccount(env, { username: 'reza', name: 'رضا' });
  const { data } = await login(env, 'reza', a.password);
  await new Promise((r) => setTimeout(r, 5));
  const r = await resetPassword(env, 'reza');
  assert.notEqual(r.password, a.password);
  assert.equal((await call(env, '/api/me', { key: data.token })).status, 401);
  assert.equal((await login(env, 'reza', a.password)).status, 401);
  assert.equal((await login(env, 'reza', r.password)).status, 200);
});

test('built-in accounts can be disabled and reset too', async () => {
  const env = baseEnv();
  await setDisabled(env, 'hesam', true);
  assert.equal((await listAccounts(env)).find((x) => x.username === 'hesam').disabled, true);
  const r = await resetPassword(env, 'hesam');
  await setDisabled(env, 'hesam', false);
  assert.equal((await login(env, 'hesam', r.password)).status, 200);
  await assert.rejects(setDisabled(env, 'ghost', true), /پیدا نشد/);
});

test('admin API is owner-only', async () => {
  const env = baseEnv();
  const owner = await appKey(env);
  const created = await call(env, '/api/admin/accounts', { key: owner, body: { username: 'mina', name: 'مینا', role: 'admin' } });
  assert.equal(created.status, 200);
  const { account } = await created.json();
  const { data } = await login(env, 'mina', account.password);
  // An admin teammate is not the owner.
  assert.equal((await call(env, '/api/admin/accounts', { key: data.token })).status, 403);
  const list = await (await call(env, '/api/admin/accounts', { key: owner })).json();
  assert.ok(list.accounts.some((x) => x.username === 'mina'));
  const off = await call(env, '/api/admin/accounts/disable', { key: owner, body: { username: 'mina' } });
  assert.deepEqual(await off.json(), { username: 'mina', disabled: true });
  const bad = await call(env, '/api/admin/accounts', { key: owner, body: { username: 'x', name: 'y' } });
  assert.equal(bad.status, 400);
  // Disabled people drop out of the team list admins see.
  const team = await (await call(env, '/api/team', { key: owner })).json();
  assert.ok(!team.team.some((x) => x.username === 'mina'));
});

test('Telegram commands: /users, /user_add, /user_off, /user_on, /user_reset', async () => {
  const env = baseEnv();
  assert.equal(await accountCommand(env, 'hello'), null);
  assert.match(await accountCommand(env, '/user_add'), /مثال/);
  const added = await accountCommand(env, '/user_add sara member سارا جان');
  assert.match(added, /sara \(سارا جان\)/);
  assert.match(added, /[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}/);
  assert.match(await accountCommand(env, '/users'), /✅ sara — سارا جان/);
  assert.match(await accountCommand(env, '/user_off sara'), /غیرفعال/);
  assert.match(await accountCommand(env, '/users'), /⛔ sara/);
  assert.match(await accountCommand(env, '/user_on sara'), /دوباره فعال/);
  assert.match(await accountCommand(env, '/user_reset sara'), /رمز جدید sara/);
  assert.match(await accountCommand(env, '/user_off'), /نام کاربری/);
});
