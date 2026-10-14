import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEvent, instrument, recordEvent, telemetryEnabled} from '../engine/telemetry.mjs';
import skills from '../api/skills.js';
import tasks from '../api/tasks.js';

const TOKEN = 'telemetry-test-token-0123456789abcdef';
const SECRET_QUERY = 'SECRET-QUERY-ماهیت-محرمانه-42';
const CLIENT_IP = '203.0.113.77';
const ALLOWED_KEYS = ['evt', 'v', 'route', 'method', 'status', 'ms', 'results', 'mode'];

function res() {
  return {statusCode: null, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; },
    status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; }};
}

// Capture everything written to console.log while `fn` runs (the telemetry sink).
async function captureLogs(fn, env = {}) {
  const lines = [];
  const original = console.log;
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  console.log = (...args) => { lines.push(args.map(String).join(' ')); };
  try {
    const value = await fn();
    return {value, lines};
  } finally {
    console.log = original;
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

const baseEnv = {ENGINE_TOKEN: TOKEN, PSK_TELEMETRY: undefined, GROQ_API_KEY: undefined, GEMINI_API_KEY: undefined,
  CEREBRAS_API_KEY: undefined, OPENROUTER_API_KEY: undefined, VERCEL: undefined};
const auth = {authorization: 'Bearer ' + TOKEN, 'x-forwarded-for': CLIENT_IP, 'user-agent': 'probe/1.0'};

test('telemetry is off by default: no sink call and no network', async () => {
  assert.equal(telemetryEnabled({}), false);
  for (const v of ['', '0', 'false', 'yes', 'on', ' ']) assert.equal(telemetryEnabled({PSK_TELEMETRY: v}), false, v);
  let calls = 0;
  assert.equal(recordEvent({route: 'skills', status: 200}, {env: {}, sink: () => calls++}), false);
  assert.equal(calls, 0);

  const realFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error('network must not be used'); };
  try {
    const {value: r, lines} = await captureLogs(async () => {
      const a = res(); skills({method: 'GET', headers: auth, query: {q: SECRET_QUERY}}, a);
      const b = res(); await tasks({method: 'POST', headers: auth, body: {input: SECRET_QUERY, mode: 'plan'}}, b);
      return [a.statusCode, b.statusCode];
    }, baseEnv);
    assert.deepEqual(r, [200, 200]);
    assert.deepEqual(lines, []);
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('when enabled, exactly one allowlisted JSON line per request is written', async () => {
  const {lines} = await captureLogs(async () => {
    const a = res(); skills({method: 'GET', headers: auth, query: {q: SECRET_QUERY}}, a);
    const b = res(); await tasks({method: 'POST', headers: auth, body: {input: SECRET_QUERY, mode: 'plan'}}, b);
  }, {...baseEnv, PSK_TELEMETRY: '1'});
  assert.equal(lines.length, 2, lines.join('\n'));
  const [skillsLine, tasksLine] = lines.map((l) => JSON.parse(l));
  assert.deepEqual(Object.keys(skillsLine).sort(), ['evt', 'method', 'ms', 'results', 'route', 'status', 'v']);
  assert.equal(skillsLine.evt, 'psk.request');
  assert.equal(skillsLine.v, 1);
  assert.equal(skillsLine.route, 'skills');
  assert.equal(skillsLine.method, 'GET');
  assert.equal(skillsLine.status, 200);
  assert.equal(Number.isInteger(skillsLine.ms) && skillsLine.ms >= 0, true);
  assert.ok(skillsLine.results > 0 && skillsLine.results <= 25);
  assert.deepEqual(Object.keys(tasksLine).sort(), ['evt', 'method', 'mode', 'ms', 'results', 'route', 'status', 'v']);
  assert.equal(tasksLine.route, 'tasks');
  assert.equal(tasksLine.mode, 'plan');
  assert.equal(tasksLine.status, 200);
  assert.ok(tasksLine.results >= 0 && tasksLine.results <= 25);
  for (const line of lines) assert.ok(Object.keys(JSON.parse(line)).every((k) => ALLOWED_KEYS.includes(k)));
});

test('enabled telemetry never leaks query text, tokens, headers, IP, task ids or routing tokens', async () => {
  const {lines} = await captureLogs(async () => {
    const a = res(); skills({method: 'GET', headers: auth, query: {q: SECRET_QUERY}}, a);
    const b = res(); await tasks({method: 'POST', headers: auth, body: {input: SECRET_QUERY + ' poster', mode: 'answer'}}, b);
    const c = res(); await tasks({method: 'POST', headers: {}, body: {input: SECRET_QUERY, mode: 'plan'}}, c); // 401 path
    const d = res(); await tasks({method: 'POST', headers: auth, body: {input: '', mode: 'plan'}}, d); // 400 path
  }, {...baseEnv, PSK_TELEMETRY: 'true'});
  const text = lines.join('\n');
  assert.equal(lines.length, 4);
  for (const forbidden of [SECRET_QUERY, 'SECRET', 'ماهیت', TOKEN, 'Bearer', 'authorization', 'ENGINE_TOKEN', CLIENT_IP, 'x-forwarded-for', 'user-agent',
    'queryTokens', 'input', 'selectedSkills', 'skillContent', 'events', 'poster', 'createdAt', 'taskId', 'sha256', 'GROQ', 'GEMINI']) {
    assert.ok(!text.includes(forbidden), `telemetry leaked: ${forbidden}`);
  }
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(text), 'task id leaked');
  for (const line of lines) assert.ok(Object.keys(JSON.parse(line)).every((k) => ALLOWED_KEYS.includes(k)), line);
});

test('buildEvent is an allowlist: unknown fields and invalid values are dropped or clamped', () => {
  const event = buildEvent({route: 'x', method: 'PUT', status: 'bad', ms: Number.NaN, results: 999, mode: 'publish',
    query: SECRET_QUERY, token: TOKEN, ip: CLIENT_IP, headers: auth, error: new Error('secret-boom'), body: {input: SECRET_QUERY}});
  assert.deepEqual(event, {evt: 'psk.request', v: 1, route: 'other', method: 'other', status: 0, ms: 0, results: 25});
  assert.deepEqual(buildEvent({route: 'skills', method: 'GET', status: 200, ms: 12.6, results: -1}),
    {evt: 'psk.request', v: 1, route: 'skills', method: 'GET', status: 200, ms: 13});
  assert.equal(buildEvent({ms: 1e12}).ms, 60000);
  assert.equal(buildEvent(null).route, 'other');
  assert.equal(buildEvent({mode: 'answer'}).mode, 'answer');
});

test('a failing logger is inert: routing still answers the same and the sink error is swallowed', async () => {
  const broken = () => { throw new Error('sink exploded with ' + TOKEN); };
  assert.equal(recordEvent({route: 'skills', status: 200}, {env: {PSK_TELEMETRY: '1'}, sink: broken}), false);

  const expected = res();
  await captureLogs(async () => skills({method: 'GET', headers: auth, query: {q: 'پوستر اینستاگرام'}}, expected), baseEnv);

  // Same request with telemetry enabled while console.log itself throws.
  const actual = res();
  const originalLog = console.log;
  process.env.PSK_TELEMETRY = '1';
  console.log = () => { throw new Error('console is broken'); };
  try {
    assert.doesNotThrow(() => skills({method: 'GET', headers: auth, query: {q: 'پوستر اینستاگرام'}}, actual));
  } finally {
    console.log = originalLog;
    delete process.env.PSK_TELEMETRY;
  }
  assert.equal(actual.statusCode, expected.statusCode);
  assert.deepEqual(actual.body, expected.body);
});

test('instrument keeps return values and thrown errors unchanged', async () => {
  const sentinel = new Error('handler failure');
  const logs = [];
  const sink = (line) => logs.push(line);
  const original = console.log;
  process.env.PSK_TELEMETRY = '1';
  console.log = sink;
  try {
    const sync = instrument('skills', (req, res, ctx) => { ctx.results = 3; res.statusCode = 201; return 'value'; });
    assert.equal(sync({method: 'GET'}, res()), 'value');
    const asyncOk = instrument('tasks', async (req, res, ctx) => { ctx.mode = 'plan'; res.statusCode = 200; return 'later'; });
    assert.equal(await asyncOk({method: 'POST'}, res()), 'later');
    const boom = instrument('tasks', async () => { throw sentinel; });
    await assert.rejects(boom({method: 'POST'}, res()), (e) => e === sentinel);
    const syncBoom = instrument('skills', () => { throw sentinel; });
    assert.throws(() => syncBoom({method: 'GET'}, res()), (e) => e === sentinel);
  } finally {
    console.log = original;
    delete process.env.PSK_TELEMETRY;
  }
  assert.equal(logs.length, 4);
  assert.ok(!logs.join('').includes('handler failure'));
  assert.equal(JSON.parse(logs[0]).results, 3);
  assert.equal(JSON.parse(logs[0]).status, 201);
  assert.equal(JSON.parse(logs[1]).mode, 'plan');
  assert.equal(JSON.parse(logs[3]).status, 500);
});

test('enabling telemetry does not change API responses (skills and plan mode)', async () => {
  const skillsReq = () => ({method: 'GET', headers: auth, query: {q: 'سه استوری برای اینستاگرام طراحی کن'}});
  const planReq = () => ({method: 'POST', headers: auth, body: {input: 'طراحی سه استوری اینستاگرام', mode: 'plan'}});
  const stable = (body) => {
    const copy = JSON.parse(JSON.stringify(body));
    delete copy.id; delete copy.createdAt;
    for (const e of copy.events) { delete e.at; delete e.taskId; }
    return copy;
  };
  const off = {}, onRes = {};
  await captureLogs(async () => { const a = res(); skills(skillsReq(), a); off.skills = a; const b = res(); await tasks(planReq(), b); off.plan = b; }, baseEnv);
  const {lines} = await captureLogs(async () => { const a = res(); skills(skillsReq(), a); onRes.skills = a; const b = res(); await tasks(planReq(), b); onRes.plan = b; }, {...baseEnv, PSK_TELEMETRY: '1'});
  assert.equal(lines.length, 2);
  assert.equal(onRes.skills.statusCode, off.skills.statusCode);
  assert.deepStrictEqual(onRes.skills.body, off.skills.body);
  assert.equal(onRes.plan.statusCode, off.plan.statusCode);
  assert.deepStrictEqual(stable(onRes.plan.body), stable(off.plan.body));
  assert.deepStrictEqual(Object.keys(onRes.plan.body).sort(), Object.keys(off.plan.body).sort());
});
