// Regression tests for the 2026-10-18 audit: provider body handling, frame protection, dev-server resilience.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chat} from '../engine/providers.mjs';

const env = {GROQ_API_KEY: 'g', GEMINI_API_KEY: 'm', PROVIDER_ORDER: 'groq,gemini'};
const msgs = [{role: 'user', content: 'x'}];
const ok = (text) => ({ok: true, status: 200, json: async () => ({choices: [{message: {content: text}}], model: 'm'})});

test('a 200 with a non-JSON body is recorded as invalid-json and the next provider answers', async () => {
  let n = 0;
  const fetchImpl = async () => (++n === 1
    ? {ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); }}
    : ok('سلام'));
  const out = await chat(msgs, {env, fetchImpl});
  assert.equal(out.text, 'سلام');
  assert.deepEqual(out.attempts.map((a) => a.status), ['invalid-json', 200]);
});

test('an error response body is released before trying the next provider', async () => {
  let cancelled = 0, n = 0;
  const fetchImpl = async () => (++n === 1
    ? {ok: false, status: 429, body: {cancel: async () => { cancelled++; }}}
    : ok('done'));
  const out = await chat(msgs, {env, fetchImpl});
  assert.equal(out.text, 'done');
  assert.equal(cancelled, 1);
});

test('every page forbids framing (clickjacking on the token field) and keeps nosniff', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const all = cfg.headers.find((h) => h.source === '/(.*)').headers;
  const get = (k) => all.find((h) => h.key === k)?.value;
  assert.equal(get('X-Frame-Options'), 'DENY');
  assert.equal(get('Content-Security-Policy'), "frame-ancestors 'none'");
  assert.equal(get('X-Content-Type-Options'), 'nosniff');
  assert.match(get('Permissions-Policy'), /camera=\(\)/);
});

test('dev server answers 400 to a malformed URL and keeps serving', async () => {
  const port = 39000 + Math.floor(Math.random() * 900);
  const server = spawn(process.execPath, [fileURLToPath(new URL('../scripts/dev-server.mjs', import.meta.url))],
    {env: {...process.env, PORT: String(port), ENGINE_TOKEN: ''}, stdio: ['ignore', 'pipe', 'pipe']});
  try {
    await new Promise((resolve, reject) => {
      server.stdout.on('data', (d) => String(d).includes('localhost') && resolve());
      server.on('exit', (code) => reject(new Error('dev server exited ' + code)));
    });
    const bad = await fetch(`http://127.0.0.1:${port}/%E0%A4%A`);
    assert.equal(bad.status, 400);
    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    const escape = await fetch(`http://127.0.0.1:${port}/..%2fpackage.json`);
    assert.equal(escape.status, 404);
  } finally {
    server.kill();
  }
});
