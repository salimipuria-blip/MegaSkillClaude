// The adapter layer, checked provider by provider. These are the cheapest bugs in the app to ship
// and the most expensive to debug in the field: a URL that is missing /v1, a key echoed into a body,
// a stream event that a vendor renamed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS,
  redactSecrets,
  PROVIDER_BY_ID,
  getProvider,
  resolveUrl,
  buildRequest,
  readResponse,
  readStreamEvent,
  explainHttpError,
} from '../core/providers.js';

const KEY = 'sk-test-SECRET-123';

test('every provider is complete, unique and honest about what it can do', () => {
  assert.ok(PROVIDERS.length >= 12, `expected the full list, got ${PROVIDERS.length}`);
  const ids = new Set();
  for (const p of PROVIDERS) {
    assert.ok(p.id && !ids.has(p.id), `duplicate or missing id: ${p.id}`);
    ids.add(p.id);
    for (const field of ['label', 'kind', 'models', 'note']) {
      assert.ok(p[field], `${p.id}: missing ${field}`);
    }
    if (p.id === 'custom') {
      assert.ok(!p.url, 'custom has no default URL by design: the user supplies it');
      assert.match(p.note, /آدرس|baseUrl/, 'custom must tell the user it needs a base URL');
    } else {
      assert.ok(p.url, `${p.id}: missing url`);
    }
    assert.ok(Array.isArray(p.models) && p.models.length > 0, `${p.id}: no models`);
    assert.equal(typeof p.browser, 'boolean', `${p.id}: browser must be a boolean, not marketing`);
    assert.ok(['openai', 'anthropic', 'gemini', 'proxy'].includes(p.kind), `${p.id}: unknown kind ${p.kind}`);
    if (p.id === 'custom') continue;
    const remote = /^https:\/\//.test(p.url);
    const local = /^http:\/\/(localhost|127\.0\.0\.1)/.test(p.url);
    assert.ok(remote || local || p.id === 'proxy', `${p.id}: url must be https (or localhost/proxy)`);
  }
  assert.equal(getProvider('openrouter').id, 'openrouter');
  assert.equal(getProvider('nope').id, 'openrouter', 'an unknown id falls back instead of throwing');
  assert.equal(PROVIDER_BY_ID.size, PROVIDERS.length);
});

test('a key never appears in a request body, for any provider', () => {
  for (const p of PROVIDERS) {
    const req = buildRequest({
      providerId: p.id,
      model: p.models[0],
      key: KEY,
      baseUrl: p.id === 'custom' ? 'https://example.dev/v1' : '',
      messages: [{ role: 'user', content: 'سلام' }],
      system: 'تو یک ایجنت هستی',
    });
    assert.ok(p.id === 'proxy' ? req.url.startsWith('/') : /^https?:\/\//.test(req.url), `${p.id}: bad url ${req.url}`);
    const turns = req.body.messages || req.body.contents;
    assert.ok(Array.isArray(turns) && turns.length, `${p.id}: no messages/contents in the body`);
    assert.ok(!JSON.stringify(req.body).includes(KEY), `${p.id}: the key leaked into the body`);
    if (p.kind === 'proxy' || p.id === 'proxy') {
      assert.ok(req.headers.authorization?.includes(KEY), `${p.id}: proxy token belongs in the header`);
    } else if (p.kind === 'gemini') {
      assert.ok(req.url.includes(encodeURIComponent(KEY)) || req.headers['x-goog-api-key'], `${p.id}: gemini needs the key in the query or header`);
    } else if (p.kind === 'anthropic') {
      assert.equal(req.headers['x-api-key'], KEY);
      assert.equal(req.headers['anthropic-dangerous-direct-browser-access'], 'true', `${p.id}: browser access header`);
      assert.ok(req.headers['anthropic-version'], `${p.id}: version header`);
    } else {
      assert.equal(req.headers.authorization, `Bearer ${KEY}`, `${p.id}: bearer token`);
    }
  }
});

test('openrouter keeps its attribution headers', () => {
  const req = buildRequest({ providerId: 'openrouter', model: 'x', key: KEY, messages: [{ role: 'user', content: 'hi' }] });
  assert.match(req.headers['http-referer'], /^https?:\/\//, 'the attribution header is a real origin');
  assert.ok(req.headers['x-title']);
});

test('a custom base URL is normalised to exactly one /chat/completions', () => {
  const cases = [
    ['https://host.dev/v1', 'https://host.dev/v1/chat/completions'],
    ['https://host.dev/v1/', 'https://host.dev/v1/chat/completions'],
    ['https://host.dev/v1/chat/completions', 'https://host.dev/v1/chat/completions'],
    ['http://localhost:11434', 'http://localhost:11434/v1/chat/completions'],
    ['http://localhost:11434/', 'http://localhost:11434/v1/chat/completions'],
    ['http://localhost:11434/v1', 'http://localhost:11434/v1/chat/completions'],
  ];
  for (const [baseUrl, expected] of cases) {
    assert.equal(resolveUrl({ providerId: 'custom', kind: 'openai', baseUrl, model: 'm' }), expected, `baseUrl ${baseUrl}`);
  }
});

test('every provider has a usable default URL, and a missing base URL is an error', () => {
  for (const p of PROVIDERS) {
    if (p.id === 'proxy') continue;
    if (p.id === 'custom') {
      assert.throws(() => resolveUrl({ providerId: 'custom', model: 'm' }), /آدرس پایه/);
      continue;
    }
    const url = resolveUrl({ providerId: p.id, kind: p.kind, model: 'some-model' });
    assert.match(url, /^https?:\/\//, `${p.id}: ${url}`);
    assert.ok(!url.includes('{model}'), `${p.id}: unsubstituted model placeholder`);
    if (!url.includes('localhost')) assert.match(url, /^https:\/\//, `${p.id}: remote providers must be https`);
  }
});

test('responses are read correctly for all four wire formats', () => {
  const openai = readResponse('openai', {
    choices: [{ message: { content: 'سلام', tool_calls: [{ id: 't1', function: { name: 'read_file', arguments: '{"path":"a.js"}' } }] } }],
    usage: { prompt_tokens: 11, completion_tokens: 7 },
  });
  assert.equal(openai.text, 'سلام');
  assert.deepEqual(openai.usage, { in: 11, out: 7 });
  assert.equal(openai.toolCalls[0].args.path, 'a.js');

  const anthropic = readResponse('anthropic', {
    content: [{ type: 'text', text: 'بله' }, { type: 'tool_use', id: 'u1', name: 'write_file', input: { path: 'b.js' } }],
    usage: { input_tokens: 3, output_tokens: 4 },
  });
  assert.equal(anthropic.text, 'بله');
  assert.deepEqual(anthropic.usage, { in: 3, out: 4 });
  assert.equal(anthropic.toolCalls[0].name, 'write_file');

  const gemini = readResponse('gemini', {
    candidates: [{ content: { parts: [{ text: 'خوب' }, { functionCall: { name: 'run', args: { a: 1 } } }] } }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6 },
  });
  assert.equal(gemini.text, 'خوب');
  assert.deepEqual(gemini.usage, { in: 5, out: 6 });
  assert.equal(gemini.toolCalls[0].name, 'run');

  assert.deepEqual(readResponse('openai', null).usage, { in: 0, out: 0 });
});

test('stream events are normalised per format', () => {
  const sse = (kind, data) => readStreamEvent(kind, { event: 'message', data: JSON.stringify(data) });

  assert.deepEqual(sse('openai', { choices: [{ delta: { content: 'الف' } }] }), { type: 'delta', text: 'الف' });
  assert.deepEqual(sse('openai', { choices: [{ delta: {}, finish_reason: 'stop' }] }), { type: 'finish', reason: 'stop' });
  assert.deepEqual(sse('openai', { usage: { prompt_tokens: 2, completion_tokens: 3 } }), { type: 'usage', in: 2, out: 3 });

  assert.deepEqual(sse('anthropic', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ب' } }), { type: 'delta', text: 'ب' });
  assert.deepEqual(sse('anthropic', { type: 'message_start', message: { usage: { input_tokens: 9 } } }), { type: 'usage', in: 9 });
  assert.deepEqual(sse('anthropic', { type: 'message_stop' }), { type: 'done' });

  assert.deepEqual(readStreamEvent('openai', { event: 'x', data: '[DONE]' }), { type: 'done' });
  assert.equal(readStreamEvent('openai', { event: 'x', data: 'not json' }), null, 'garbage is ignored, not thrown');
});

test('http errors explain themselves and never echo the key', () => {
  const bodies = [
    `{"error":"bad key ${KEY}","message":"x"}`,
    '{"error":"invalid api key gsk_ABCdef1234567890"}',
    'AIzaSyD-1234567890abcdefghijklmnopq',
    'Authorization: Bearer abcdef1234567890xyz',
    'https://api.example/v1?key=supersecretvalue&model=x',
  ];
  for (const body of bodies) {
    const redacted = redactSecrets(body);
    assert.doesNotMatch(redacted, /supersecretvalue|abcdef1234567890xyz|AIzaSyD-|gsk_ABC|SECRET-123/, `redaction missed: ${body}`);
  }
  for (const status of [400, 401, 402, 403, 404, 413, 429, 500, 503]) {
    const text = explainHttpError(status, `{"error":"bad key ${KEY}","message":"x"}`);
    assert.ok(text.length > 10, `status ${status}: empty explanation`);
    assert.ok(!text.includes(KEY), `status ${status}: the explanation echoed the key`);
    assert.match(text, /[آ-ی]/, `status ${status}: the message should be Persian`);
  }
});
