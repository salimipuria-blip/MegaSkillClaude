// Integration regressions run in workerd with real SQLite DO storage, never remote services.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { appKey } from './worker.mjs';

const bindings = { TELEGRAM_BOT_TOKEN: 'fixture-token', ALLOWED_USER_ID: '12345', GEMINI_API_KEY: 'fixture-key', REQUIRE_CONVERSATIONS: 'true' };
const historyKey = 'history:12345';
const modules = ['entry', 'worker', 'security', 'app', 'auth', 'users', 'skills', 'skill-router', 'memory', 'brain', 'conversation']
  .map((name) => ({ type: 'ESModule', path: fileURLToPath(new URL(`${name}.mjs`, import.meta.url)) }));

async function fixture(t, brain) {
  const prompts = [];
  const outboundService = async (request) => {
    assert.equal(new URL(request.url).hostname, 'generativelanguage.googleapis.com', 'unexpected outbound request');
    const body = await request.json();
    prompts.push(body);
    if (brain) return brain(body);
    await delay(10); // allow a second worker/reset request to reach the same actor during model I/O
    return Response.json({ candidates: [{ content: { parts: [{ text: `answer ${body.contents.at(-1).parts[0].text}` }] } }] });
  };
  const workerOptions = (name) => ({
    name, modules, compatibilityDate: '2026-09-01', bindings,
    kvNamespaces: { MEMORY: 'fixture-memory' },
    durableObjects: { CONVERSATIONS: { className: 'HermesConversation', scriptName: 'hermes', useSQLite: true } },
    outboundService,
  });
  const mf = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', unsafeInspectDurableObjects: true, workers: [workerOptions('hermes'), workerOptions('second-client')] }));
  t.after(() => mf.dispose());
  const clients = [await mf.getWorker('hermes'), await mf.getWorker('second-client')];
  const token = await appKey(bindings);
  const api = async (path, body, client = 0) => {
    const response = await clients[client].fetch(`https://fixture.invalid/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const namespace = await mf.getDurableObjectNamespace('CONVERSATIONS', 'hermes');
  const actor = namespace.get(namespace.idFromName(historyKey));
  const internal = async (action, body = {}) => {
    const response = await actor.fetch(`https://conversation.internal/${action}`, { method: 'POST', body: JSON.stringify({ ...body, key: historyKey }) });
    return { status: response.status, body: await response.json() };
  };
  const sql = await mf.unsafeGetDurableObjectStorage('hermes', 'HermesConversation', { name: historyKey });
  return { mf, api, internal, sql, prompts };
}

test('independent Workers sharing a DO preserve all concurrent turns and ordered context', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => f.api('chat', { message: `turn-${i}` }, i % 2)));
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results));
  const history = (await f.api('history')).body.messages;
  assert.equal(history.length, 12);
  assert.deepEqual(new Set(history.filter((m) => m.role === 'user').map((m) => m.text)), new Set(Array.from({ length: 6 }, (_, i) => `turn-${i}`)));
  assert.deepEqual(f.prompts.map((p) => p.contents.length), [1, 3, 5, 7, 9, 11]);
  assert.ok(f.prompts.every((p) => p.contents.every((m) => !('t' in m))));
});

test('legacy KV import is non-destructive and not repeated after actor eviction', async (t) => {
  const f = await fixture(t);
  const kv = await f.mf.getKVNamespace('MEMORY', 'hermes');
  const original = [{ role: 'user', parts: [{ text: 'old question' }], t: 1 }, { role: 'model', parts: [{ text: 'old answer' }], t: 2 }];
  await kv.put(historyKey, JSON.stringify(original));
  await kv.put(`notes:${historyKey}`, JSON.stringify(['keep this note']));
  assert.equal((await f.api('history')).body.messages.length, 2);
  assert.equal((await f.api('chat', { message: 'new question' })).status, 200);
  await f.mf.unsafeEvictDurableObject('hermes', 'HermesConversation', { name: historyKey });
  assert.equal((await f.api('history', undefined, 1)).body.messages.length, 4);
  assert.deepEqual(await kv.get(historyKey, 'json'), original);
  assert.deepEqual((await f.api('notes')).body.notes, ['keep this note']);
});

test('reset waits for an in-flight turn, archives it and preserves notes', async (t) => {
  let started, release;
  const ready = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const f = await fixture(t, async () => {
    started(); await gate;
    return Response.json({ candidates: [{ content: { parts: [{ text: 'done' }] } }] });
  });
  const turn = f.api('chat', { message: 'remember that notes survive' });
  await ready;
  let resetFinished = false;
  const reset = f.api('reset', {}, 1).then((r) => { resetFinished = true; return r; });
  await delay(30);
  assert.equal(resetFinished, false, 'a reset must not overtake a model call');
  release();
  assert.equal((await turn).status, 200);
  assert.equal((await reset).status, 200);
  assert.deepEqual((await f.api('history')).body.messages, []);
  assert.deepEqual((await f.api('notes')).body.notes, ['notes survive']);
  const archived = await f.sql.exec('SELECT epoch, count(*) AS n FROM messages GROUP BY epoch');
  assert.deepEqual(archived, [{ epoch: 0, n: 2 }]);
  assert.equal((await f.api('chat', { message: 'fresh conversation' })).status, 200);
  assert.equal(f.prompts.at(-1).contents.length, 1);
});

test('a failed atomic append rolls back both messages and the queue recovers', async (t) => {
  const f = await fixture(t);
  await f.api('history'); // initialize the schema/import before installing the test-only fault
  await f.sql.exec("CREATE TRIGGER reject_model BEFORE INSERT ON messages WHEN NEW.role = 'model' BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END");
  assert.equal((await f.api('chat', { message: 'fails to persist' })).status, 502);
  assert.equal((await f.sql.exec('SELECT count(*) AS n FROM messages'))[0].n, 0);
  await f.sql.exec('DROP TRIGGER reject_model');
  assert.equal((await f.api('chat', { message: 'retry works' })).status, 200);
  assert.equal((await f.api('history')).body.messages.length, 2);
});

test('invalid legacy data does not initialize an empty replacement and can be retried', async (t) => {
  const f = await fixture(t), kv = await f.mf.getKVNamespace('MEMORY', 'hermes');
  await kv.put(historyKey, JSON.stringify({ malformed: true }));
  const bad = await f.internal('history');
  assert.equal(bad.status, 502);
  assert.deepEqual(await f.sql.exec("SELECT * FROM meta WHERE name = 'key'"), []);
  await kv.put(historyKey, JSON.stringify([{ role: 'user', parts: [{ text: 'recovered' }] }]));
  assert.equal((await f.api('history')).body.messages[0].text, 'recovered');
});

test('notes stay bounded and duplicate-free; clearing them does not delete messages', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 105 }, (_, i) => f.internal('note', { note: `note ${i}` })));
  assert.ok(results.every((r) => r.status === 200));
  await f.internal('note', { note: 'note 104' });
  const notes = (await f.api('notes')).body.notes;
  assert.equal(notes.length, 100);
  assert.equal(new Set(notes).size, 100);
  assert.equal((await f.api('chat', { message: 'hello' })).status, 200);
  await f.api('notes/clear', {});
  assert.deepEqual((await f.api('notes')).body.notes, []);
  assert.equal((await f.api('history')).body.messages.length, 2);
});
