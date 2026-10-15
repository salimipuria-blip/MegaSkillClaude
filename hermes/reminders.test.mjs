import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReminder, morningSummary } from './reminders.mjs';

const NOW = new Date('2026-10-15T05:00:00.000Z'); // 08:30 Tehran

test('parses "ساعت 9" with Persian text', () => {
  const r = parseReminder('یادم بنداز ساعت 9: جلسه با تیم', NOW);
  assert.ok(r, 'should parse');
  assert.equal(r.text, 'جلسه با تیم');
  // 09:00 local Tehran = 05:30 UTC
  assert.equal(new Date(r.due).toISOString(), '2026-10-15T05:30:00.000Z');
});

test('parses "in 30 minutes"', () => {
  const r = parseReminder('remind me in 30 minutes: call Bob', NOW);
  assert.equal(new Date(r.due).toISOString(), '2026-10-15T05:30:00.000Z');
  assert.equal(r.text, 'call Bob');
});

test('parses explicit date and time', () => {
  const r = parseReminder('یادم بنداز 2026-10-20 09:00: قرار دکتر', NOW);
  assert.equal(new Date(r.due).toISOString(), '2026-10-20T05:30:00.000Z');
});

test('parses tomorrow keyword', () => {
  const r = parseReminder('remind me tomorrow at 7: water plants', NOW);
  assert.equal(new Date(r.due).toISOString(), '2026-10-16T03:30:00.000Z');
});

test('parses pm without "at"', () => {
  const r = parseReminder('remind me 5pm: gym', NOW);
  assert.equal(new Date(r.due).toISOString(), '2026-10-15T13:30:00.000Z');
});

test('past time today rolls to tomorrow', () => {
  // 11:30 Tehran: "ساعت 9" already passed today → tomorrow
  const later = new Date('2026-10-15T08:00:00.000Z');
  const r = parseReminder('یادم بنداز ساعت 9: قدیم', later);
  assert.equal(new Date(r.due).toISOString(), '2026-10-16T05:30:00.000Z');
});

test('returns null for non-reminder input', () => {
  assert.equal(parseReminder('سلام چطوری', NOW), null);
  assert.equal(parseReminder('', NOW), null);
  assert.equal(parseReminder('remind me', NOW), null);
});

test('morningSummary only lists today unsent reminders', () => {
  const list = [
    { id: 'a', due: '2026-10-15T05:30:00.000Z', text: 'today 9', sent: false },
    { id: 'b', due: '2026-10-15T09:00:00.000Z', text: 'today 12', sent: false },
    { id: 'c', due: '2026-10-16T05:30:00.000Z', text: 'tomorrow', sent: false },
    { id: 'd', due: '2026-10-15T06:00:00.000Z', text: 'done', sent: true },
  ];
  const s = morningSummary(list, NOW);
  assert.match(s, /یادآورهای امروز/);
  assert.match(s, /today 9/);
  assert.match(s, /today 12/);
  assert.doesNotMatch(s, /tomorrow/);
  assert.doesNotMatch(s, /done/);
});

// --- runReminders with a fake Cloudflare env (KV + Telegram) ---
function fakeEnv(seed = []) {
  const store = new Map([['reminders:index', JSON.stringify(seed)]]);
  const sent = [];
  const env = {
    TELEGRAM_BOT_TOKEN: 'test-token',
    MEMORY: {
      async get(k, type) { const v = store.has(k) ? store.get(k) : null; return type === 'json' && v ? JSON.parse(v) : v; },
      async put(k, v) { store.set(k, v); },
      async delete(k) { store.delete(k); },
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      sent.push(JSON.parse(init.body));
      return Response.json({ ok: true });
    }
    return originalFetch(url, init);
  };
  return { env, sent, restore: () => { globalThis.fetch = originalFetch; } };
}

test('runReminders delivers due reminders once and marks them sent', async (t) => {
  const { runReminders } = await import('./worker.mjs');
  const now = new Date('2026-10-15T06:00:00.000Z'); // 09:30 Tehran → digest hour is 9, not 8
  const { env, sent, restore } = fakeEnv([
    { id: 'a', chatId: '42', due: '2026-10-15T05:00:00.000Z', text: 'call bank', sent: false },
    { id: 'b', chatId: '42', due: '2026-10-16T05:00:00.000Z', text: 'future', sent: false },
    { id: 'c', chatId: '42', due: '2026-10-14T05:00:00.000Z', text: 'already sent', sent: true },
  ]);
  t.after(restore);
  const res = await runReminders(env, now);
  assert.equal(res.delivered, 1);
  assert.equal(res.digests, 0);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /call bank/);
  // a second run does not re-deliver
  const again = await runReminders(env, now);
  assert.equal(again.delivered, 0);
});

test('runReminders sends the morning digest at 08:00 Tehran', async (t) => {
  const { runReminders } = await import('./worker.mjs');
  const now = new Date('2026-10-15T04:30:00.000Z'); // 08:00 Tehran
  const { env, sent, restore } = fakeEnv([
    { id: 'a', chatId: '42', due: '2026-10-15T06:30:00.000Z', text: 'gym at 10', sent: false },
    { id: 'b', chatId: '43', due: '2026-10-15T07:00:00.000Z', text: 'meeting at 11', sent: false },
    { id: 'c', chatId: '42', due: '2026-10-16T06:30:00.000Z', text: 'tomorrow', sent: false },
  ]);
  t.after(restore);
  const res = await runReminders(env, now);
  assert.equal(res.digests, 2);
  assert.ok(sent.some((m) => /یادآورهای امروز/.test(m.text) && m.chat_id === '42' && /gym at 10/.test(m.text)));
  assert.ok(sent.some((m) => /یادآورهای امروز/.test(m.text) && m.chat_id === '43'));
  assert.ok(!sent.some((m) => /tomorrow/.test(m.text)));
});

test('parses a bare time after a day word («فردا 10: متن»)', () => {
  const r = parseReminder('یادم بنداز فردا 10: قرار دکتر', NOW);
  assert.ok(r);
  assert.equal(r.text, 'قرار دکتر');
  assert.equal(new Date(r.due).toISOString(), '2026-10-16T06:30:00.000Z');
});

test('parses a bare 24h time («ساعت» omitted)', () => {
  const r = parseReminder('remind me 21:30: standup', NOW);
  assert.ok(r);
  assert.equal(new Date(r.due).toISOString(), '2026-10-15T18:00:00.000Z');
  assert.equal(r.text, 'standup');
});

test('does not treat a shopping list as a time', () => {
  assert.equal(parseReminder('یادم بنداز 3 تخم مرغ بخرم', NOW), null);
});
