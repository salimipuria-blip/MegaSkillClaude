import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectWebhook } from './webhook-setup.mjs';
import { setupKey } from './security.mjs';

const env = () => ({ HERMES_URL: 'https://hermes.example.workers.dev', TELEGRAM_BOT_TOKEN: '1:fixture', ALLOWED_USER_ID: '123456789' });

test('owner CLI uses POST with a separate authorization key, never secrets in the URL', async () => {
  const fixture = env();
  let observed;
  const output = await connectWebhook(fixture, async (url, options) => {
    observed = { url, options };
    return new Response('server body must not be echoed');
  });
  assert.equal(observed.url, 'https://hermes.example.workers.dev/setup');
  assert.equal(observed.options.method, 'POST');
  assert.equal(observed.options.headers.authorization, `Bearer ${await setupKey(fixture)}`);
  assert.ok(!observed.url.includes(fixture.TELEGRAM_BOT_TOKEN));
  assert.ok(!output.includes(await setupKey(fixture)));
  assert.ok(!output.includes('server body'));
});

test('owner CLI rejects insecure/decorated origins without calling fetch', async () => {
  let calls = 0;
  const fetchFn = async () => { calls++; return new Response(); };
  for (const origin of ['http://worker.test', 'https://user:password@worker.test', 'https://worker.test/telegram', 'https://worker.test/?key=secret', 'https://worker.test/#key', 'not a URL']) {
    await assert.rejects(connectWebhook({ ...env(), HERMES_URL: origin }, fetchFn), /HTTPS Worker origin/);
  }
  assert.equal(calls, 0);
});

test('missing owner configuration is named without printing secret values', async () => {
  for (const key of ['HERMES_URL', 'TELEGRAM_BOT_TOKEN', 'ALLOWED_USER_ID']) {
    await assert.rejects(connectWebhook({ ...env(), [key]: '' }, async () => { throw new Error('unexpected fetch'); }), new RegExp(`Set ${key}`));
  }
});

test('transport and HTTP errors do not echo headers or upstream bodies', async () => {
  const fixture = env();
  const token = await setupKey(fixture);
  await assert.rejects(connectWebhook(fixture, async () => { throw new Error(`transport leak ${token}`); }), (error) => !error.message.includes(token));
  await assert.rejects(connectWebhook(fixture, async () => new Response(`upstream leak ${token}`, { status: 403 })), (error) => error.message.includes('403') && !error.message.includes(token));
});
