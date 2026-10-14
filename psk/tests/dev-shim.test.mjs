import test from 'node:test';
import assert from 'node:assert/strict';
import {vercelResponse} from '../scripts/dev-shim.mjs';
import {instrument} from '../engine/telemetry.mjs';

function nodeRes() {
  return {statusCode: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; }};
}

test('local shim exposes the status it sets, as Vercel and Node res.statusCode do', () => {
  const raw = nodeRes();
  const shim = vercelResponse(raw);
  shim.status(201);
  assert.equal(raw.statusCode, 201);
  assert.equal(shim.statusCode, 201);
});

test('telemetry reports the real status (not 0) through the local dev shim', async () => {
  const lines = [];
  const original = console.log;
  process.env.PSK_TELEMETRY = '1';
  console.log = (line) => lines.push(line);
  try {
    const handler = instrument('skills', (req, res) => { res.status(404).json({error: 'missing'}); return 'done'; });
    const raw = nodeRes();
    assert.equal(handler({method: 'GET'}, vercelResponse(raw)), 'done');
    assert.equal(raw.statusCode, 404);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).status, 404);
  } finally {
    console.log = original;
    delete process.env.PSK_TELEMETRY;
  }
});
