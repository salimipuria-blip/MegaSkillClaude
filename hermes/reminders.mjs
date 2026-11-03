// Reminders for Hermes (roadmap item #1): "یادم بنداز ساعت ۹ ..." and a morning summary.
// Storage is KV (MEMORY) so it survives isolate restarts; delivery happens from the
// Worker's scheduled() handler (cron). Pure parsing helpers are unit-testable.

const INDEX_KEY = 'reminders:index';

// All human-facing times are in the user's local timezone (Asia/Tehran by default,
// overridable with REMINDER_TZ). We build a Date from wall-clock parts using the
// offset that zone had at that instant, so DST-free zones stay exact.
export const DEFAULT_TZ = 'Asia/Tehran';

function pad(n) { return String(n).padStart(2, '0'); }

// Offset (ms) of `tz` at the given UTC instant, via Intl (available in Workers and Node >= 18).
function tzOffsetMs(tz, at) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = dtf.formatToParts(at).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return asUTC - at.getTime();
}

// Build a UTC Date from wall-clock parts expressed in `tz`.
export function wallClockToUtc(y, mo, d, h, mi, tz = DEFAULT_TZ) {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  const offset = tzOffsetMs(tz, guess);
  return new Date(guess.getTime() - offset);
}

// Current wall-clock date in `tz` (year, month, day).
function wallClockParts(at, tz = DEFAULT_TZ) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = dtf.formatToParts(at).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return { y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day) };
}

// Parse a reminder request. Returns { due: ISO string, text: string } or null.
// Supported (Persian/English), case-insensitive:
//   "یادم بنداز ساعت 9:30: متن" / "remind me at 14:00: text"
//   "یادم بنداز فردا ساعت 10: متن" / "remind me tomorrow 9am: text"
//   "remind me in 30 minutes: text" / "یادم بنداز تا 2 ساعت دیگر: متن"
//   "یادم بنداز 2026-10-20 09:00: متن"
export function parseReminder(input, now = new Date(), tz = DEFAULT_TZ) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(?:یادم\s*بنداز|یادآور|remind\s*me|reminder)\s*[:：،,.]?\s*(.*)$/i);
  if (!m) return null;
  let rest = m[1].trim();
  if (!rest) return null;

  let due = null;
  let body = rest;

  // "in N minutes/hours" / "تا N ... دیگر"
  let inm = rest.match(/^(?:in|تا)\s+(\d+)\s*(minutes|minute|mins|min|hours|hour|hrs|hr|دقیقه|ساعت)\b\s*(?:دیگر)?\s*[:：،,.]?\s*(.*)$/i);
  if (inm) {
    const n = Number(inm[1]);
    const unit = inm[2].toLowerCase();
    const ms = /hour|hr|ساعت/.test(unit) ? n * 3600000 : n * 60000;
    due = new Date(now.getTime() + ms);
    body = inm[3].trim();
  }

  // explicit date YYYY-MM-DD HH:MM
  if (!due) {
    let dm = rest.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*[:：،,.]?\s*(.*)$/);
    if (dm) {
      due = wallClockToUtc(Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(dm[4]), Number(dm[5]), tz);
      body = dm[6].trim();
    }
  }

  // day keyword + time
  if (!due) {
    let dayOffset = 0;
    let work = rest;
    // \b is useless next to Persian letters (they are not \w), so the day words are
    // anchored with a lookahead for whitespace or end-of-string instead.
    if (/^(?:فردا|tomorrow)(?=\s|$)/i.test(work)) { dayOffset = 1; work = work.replace(/^(?:فردا|tomorrow)\s*/i, ''); }
    else if (/^پس\s*فردا(?=\s|$)/i.test(work)) { dayOffset = 2; work = work.replace(/^پس\s*فردا\s*/i, ''); }
    else if (/^(?:امروز|today)(?=\s|$)/i.test(work)) { work = work.replace(/^(?:امروز|today)\s*/i, ''); }

    // time: "ساعت 9", "ساعت 9:30", "at 9", "at 9:30", "9am", "9:30pm"
    let tm = work.match(/(?:ساعت|at)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|صبح|عصر|شب)?\s*[:：،,.]?\s*(.*)$/i);
    if (!tm) tm = work.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|صبح|عصر|شب)\s*[:：،,.]?\s*(.*)$/i);
    // bare "9:30" is unambiguous; a bare "9" only counts when a day word already said when.
    if (!tm) {
      const bare = work.match(/^(\d{1,2}):(\d{2})\s*[:：،,.]?\s*(.*)$/);
      if (bare) tm = [bare[0], bare[1], bare[2], '', bare[3]];
    }
    if (!tm && dayOffset > 0) {
      const bare = work.match(/^(\d{1,2})\s*[:：،,.]?\s*(.*)$/);
      if (bare) tm = [bare[0], bare[1], '', '', bare[2]];
    }
    if (tm) {
      let h = Number(tm[1]);
      const min = tm[2] ? Number(tm[2]) : 0;
      const ap = (tm[3] || '').toLowerCase();
      if (ap === 'pm' || ap === 'عصر' || ap === 'شب') { if (h < 12) h += 12; }
      else if (ap === 'am' || ap === 'صبح') { if (h === 12) h = 0; }
      const wp = wallClockParts(now, tz);
      const shifted = new Date(Date.UTC(wp.y, wp.mo - 1, wp.d + dayOffset, h, min, 0));
      let candidate = wallClockToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(),
        shifted.getUTCHours(), shifted.getUTCMinutes(), tz);
      // if no day keyword and time already passed today, move to tomorrow
      if (dayOffset === 0 && candidate.getTime() <= now.getTime()) {
        candidate = wallClockToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate() + 1,
          shifted.getUTCHours(), shifted.getUTCMinutes(), tz);
      }
      due = candidate;
      body = (tm[4] || '').trim();
    }
  }

  if (!due || isNaN(due.getTime())) return null;
  if (!body) return null;
  return { due: due.toISOString(), text: body.slice(0, 500) };
}

export function newId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

export async function addReminder(env, chatId, parsed) {
  if (!env.MEMORY) throw new Error('MEMORY binding required');
  const id = newId();
  const entry = { id, chatId: String(chatId), due: parsed.due, text: parsed.text, sent: false, created: new Date().toISOString() };
  const idx = (await env.MEMORY.get(INDEX_KEY, 'json')) || [];
  idx.push(entry);
  // keep last 500
  const trimmed = idx.slice(-500);
  await env.MEMORY.put(INDEX_KEY, JSON.stringify(trimmed));
  return entry;
}

export async function listReminders(env, chatId) {
  if (!env.MEMORY) return [];
  const idx = (await env.MEMORY.get(INDEX_KEY, 'json')) || [];
  return idx.filter((r) => String(r.chatId) === String(chatId) && !r.sent);
}

export async function allReminders(env) {
  if (!env.MEMORY) return [];
  return (await env.MEMORY.get(INDEX_KEY, 'json')) || [];
}

export async function dueReminders(env, now = new Date()) {
  if (!env.MEMORY) return [];
  const idx = (await env.MEMORY.get(INDEX_KEY, 'json')) || [];
  const t = now.getTime();
  return idx.filter((r) => !r.sent && new Date(r.due).getTime() <= t);
}

export async function markSent(env, id) {
  if (!env.MEMORY) return;
  const idx = (await env.MEMORY.get(INDEX_KEY, 'json')) || [];
  const next = idx.map((r) => (r.id === id ? { ...r, sent: true, sentAt: new Date().toISOString() } : r));
  await env.MEMORY.put(INDEX_KEY, JSON.stringify(next));
}

export async function deleteReminder(env, id) {
  if (!env.MEMORY) return;
  const idx = (await env.MEMORY.get(INDEX_KEY, 'json')) || [];
  await env.MEMORY.put(INDEX_KEY, JSON.stringify(idx.filter((r) => r.id !== id)));
}

export function formatReminder(r) {
  const d = new Date(r.due);
  return `⏰ ${d.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })} — ${r.text}`;
}

export function dayKey(at, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function morningSummary(reminders, now = new Date(), tz = DEFAULT_TZ) {
  const today = dayKey(now, tz);
  const todays = (reminders || []).filter((r) => !r.sent && dayKey(new Date(r.due), tz) === today);
  if (!todays.length) return '';
  const lines = todays.map((r) => `• ${new Date(r.due).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' })} — ${r.text}`);
  return `☀️ یادآورهای امروز:\n${lines.join('\n')}`;
}

// One digest per chat that has reminders due today (Tehran by default).
export function morningDigest(all, now = new Date(), tz = DEFAULT_TZ) {
  const today = dayKey(now, tz);
  const byChat = new Map();
  for (const r of all || []) {
    if (r.sent) continue;
    const d = dayKey(new Date(r.due), tz);
    if (d !== today) continue;
    if (!byChat.has(r.chatId)) byChat.set(r.chatId, []);
    byChat.get(r.chatId).push(r);
  }
  const out = [];
  for (const [chatId, list] of byChat) {
    out.push({ chatId, text: morningSummary(list, now, tz) });
  }
  return out;
}
