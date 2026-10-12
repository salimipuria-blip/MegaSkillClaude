// Permanent memory: every message is kept. The AI sees the most recent CONTEXT_MESSAGES of them,
// plus long-term notes the user asked it to remember ("یادت باشه ...").
// When a conversation log grows past ROLL_CHARS, older messages move to an archive key; nothing is deleted.
// "New chat" / /reset archives the conversation instead of deleting it.

export const CONTEXT_MESSAGES = 40;
export const MAX_NOTES = 100;
const ROLL_CHARS = 1_500_000; // KV values may be up to 25 MB; stay far below
const NOTE_RE = /^(?:یادت\s*(?:باشه|باشد|بمونه|بماند)|به\s*خاطر\s*بسپار|remember(?:\s+that)?)\s*[:：،,.\-]?\s*/i;

export async function loadLog(env, key) {
  return env.MEMORY ? (await env.MEMORY.get(key, 'json')) || [] : [];
}

// What the AI sees: only role + parts (extra fields such as timestamps are not valid Gemini content).
export const toContents = (log) => log.slice(-CONTEXT_MESSAGES).map((m) => ({ role: m.role, parts: m.parts }));

export async function appendTurn(env, key, log, input, reply) {
  if (!env.MEMORY) return;
  const t = Date.now();
  let next = [...log, { role: 'user', parts: [{ text: input }], t }, { role: 'model', parts: [{ text: reply }], t }];
  if (JSON.stringify(next).length > ROLL_CHARS) {
    await env.MEMORY.put(`archive:${key}:${t}`, JSON.stringify(next.slice(0, -CONTEXT_MESSAGES)));
    next = next.slice(-CONTEXT_MESSAGES);
  }
  await env.MEMORY.put(key, JSON.stringify(next));
}

// Start a fresh conversation without losing the old one.
export async function archiveAndClear(env, key) {
  if (!env.MEMORY) return;
  const log = await loadLog(env, key);
  if (log.length) await env.MEMORY.put(`archive:${key}:${Date.now()}`, JSON.stringify(log));
  await env.MEMORY.delete(key);
}

// "یادت باشه X" → "X"; anything else → null.
export function noteFrom(input) {
  const m = String(input).match(NOTE_RE);
  if (!m) return null;
  const note = input.slice(m[0].length).trim().slice(0, 300);
  return note || null;
}

export async function loadNotes(env, key) {
  return env.MEMORY ? (await env.MEMORY.get(`notes:${key}`, 'json')) || [] : [];
}

export async function addNote(env, key, note) {
  if (!env.MEMORY) return;
  const notes = (await loadNotes(env, key)).filter((n) => n !== note);
  await env.MEMORY.put(`notes:${key}`, JSON.stringify([...notes, note].slice(-MAX_NOTES)));
}

export async function clearNotes(env, key) {
  if (env.MEMORY) await env.MEMORY.delete(`notes:${key}`);
}
