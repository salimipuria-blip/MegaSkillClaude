// Production conversations use strongly-consistent SQLite Durable Objects (one per history key).
// KV remains readable for non-destructive migration. The legacy helpers support local/unit tests;
// their isolate-local lock is NOT a substitute for the CONVERSATIONS binding in a deployment.
export const CONTEXT_MESSAGES = 40;
export const MAX_NOTES = 100;
const ROLL_CHARS = 1_500_000;
const NOTE_RE = /^(?:یادت\s*(?:باشه|باشد|بمونه|بماند)|به\s*خاطر\s*بسپار|remember(?:\s+that)?)\s*[:：،,.\-]?\s*/i;
const locks = new WeakMap();

export function requireConversationBinding(env) {
  if (!env.CONVERSATIONS && (env.REQUIRE_CONVERSATIONS === 'true' || env.REQUIRE_CONVERSATIONS === true)) {
    throw new Error('حافظهٔ امن گفتگو وصل نیست؛ تنظیم CONVERSATIONS را بررسی کن.');
  }
}

export async function conversationCall(env, key, action, payload = {}) {
  requireConversationBinding(env);
  const stub = env.CONVERSATIONS.get(env.CONVERSATIONS.idFromName(key));
  const response = await stub.fetch(new Request(`https://conversation.internal/${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, key }),
  }));
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'حافظهٔ گفتگو در دسترس نیست.');
  return data;
}

// Only for the legacy, single-isolate adapter; the actual distributed lock lives in the DO.
export async function withLegacyMemoryLock(env, key, fn) {
  requireConversationBinding(env);
  const binding = env.MEMORY || env;
  if (!locks.has(binding)) locks.set(binding, new Map());
  const pending = locks.get(binding);
  const before = pending.get(key) || Promise.resolve();
  const work = before.catch(() => {}).then(fn);
  pending.set(key, work);
  try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
}

export async function loadLog(env, key) {
  requireConversationBinding(env);
  if (env.CONVERSATIONS) return (await conversationCall(env, key, 'history')).messages;
  return env.MEMORY ? (await env.MEMORY.get(key, 'json')) || [] : [];
}

export const toContents = (log) => log.slice(-CONTEXT_MESSAGES).map((m) => ({ role: m.role, parts: m.parts }));

export async function appendTurn(env, key, log, input, reply) {
  requireConversationBinding(env);
  if (env.CONVERSATIONS) throw new Error('Conversation appends must run inside the Durable Object');
  if (!env.MEMORY) return;
  const t = Date.now();
  let next = [...log, { role: 'user', parts: [{ text: input }], t }, { role: 'model', parts: [{ text: reply }], t }];
  if (JSON.stringify(next).length > ROLL_CHARS) {
    await env.MEMORY.put(`archive:${key}:${t}:${crypto.randomUUID()}`, JSON.stringify(next.slice(0, -CONTEXT_MESSAGES)));
    next = next.slice(-CONTEXT_MESSAGES);
  }
  await env.MEMORY.put(key, JSON.stringify(next));
}

export async function archiveAndClear(env, key) {
  requireConversationBinding(env);
  if (env.CONVERSATIONS) return conversationCall(env, key, 'reset');
  if (!env.MEMORY) return;
  return withLegacyMemoryLock(env, key, async () => {
    const log = await loadLog(env, key);
    if (log.length) await env.MEMORY.put(`archive:${key}:${Date.now()}:${crypto.randomUUID()}`, JSON.stringify(log));
    await env.MEMORY.delete(key);
  });
}

export function noteFrom(input) {
  const text = String(input);
  const m = text.match(NOTE_RE);
  if (!m) return null;
  return text.slice(m[0].length).trim().slice(0, 300) || null;
}

export async function loadNotes(env, key) {
  requireConversationBinding(env);
  if (env.CONVERSATIONS) return (await conversationCall(env, key, 'notes')).notes;
  return env.MEMORY ? (await env.MEMORY.get(`notes:${key}`, 'json')) || [] : [];
}

export async function addNote(env, key, note) {
  requireConversationBinding(env);
  if (env.CONVERSATIONS) return conversationCall(env, key, 'note', { note });
  if (!env.MEMORY) return;
  const notes = (await loadNotes(env, key)).filter((n) => n !== note);
  await env.MEMORY.put(`notes:${key}`, JSON.stringify([...notes, note].slice(-MAX_NOTES)));
}

export async function clearNotes(env, key) {
  requireConversationBinding(env);
  if (env.CONVERSATIONS) return conversationCall(env, key, 'notes/clear');
  if (env.MEMORY) return withLegacyMemoryLock(env, key, () => env.MEMORY.delete(`notes:${key}`));
}
