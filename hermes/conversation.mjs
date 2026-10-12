import { ask, SYSTEM } from './brain.mjs';
import { relevantSkills, skillsBlock } from './skill-router.mjs';
import { CONTEXT_MESSAGES, MAX_NOTES, requireConversationBinding, conversationCall, withLegacyMemoryLock, loadLog, loadNotes, addNote, appendTurn, noteFrom, toContents } from './memory.mjs';

async function respond(env, input, system, log, notes) {
  const skills = await relevantSkills(env, input);
  const fullSystem = (notes.length
    ? `${system}\n\nLONG-TERM NOTES the user asked you to remember (always take them into account):\n- ${notes.join('\n- ')}`
    : system) + skillsBlock(skills);
  return ask(env, [...toContents(log), { role: 'user', parts: [{ text: input }] }], fullSystem);
}

export async function converse(env, key, input, system = SYSTEM) {
  requireConversationBinding(env);
  if (env.CONVERSATIONS) return (await conversationCall(env, key, 'turn', { input, system })).reply;
  // Backwards-compatible local adapter only. Production wrangler.toml always binds the DO.
  return withLegacyMemoryLock(env, key, async () => {
    const note = noteFrom(input);
    if (note) await addNote(env, key, note);
    const [log, notes] = await Promise.all([loadLog(env, key), loadNotes(env, key)]);
    const reply = await respond(env, input, system, log, notes);
    await appendTurn(env, key, log, input, reply);
    return reply;
  });
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// SQLite-backed Durable Object, provisioned by wrangler's new_sqlite_classes migration.
// All operations (including resets/notes) enter one queue. DO events CAN interleave during a
// model fetch, so relying on single-threaded JS alone would still lose context/reset ordering.
export class ConversationStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.pending = Promise.resolve();
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, epoch INTEGER NOT NULL, role TEXT NOT NULL, parts TEXT NOT NULL, t INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS messages_by_epoch ON messages(epoch, id)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL UNIQUE)');
  }

  fetch(request) {
    const work = this.pending.catch(() => {}).then(() => this.handle(request));
    this.pending = work;
    return work;
  }

  meta(name) { return this.sql.exec('SELECT value FROM meta WHERE name = ?', name).toArray()[0]?.value; }
  epoch() { return Number(this.meta('epoch') || 0); }
  notes() { return this.sql.exec('SELECT text FROM notes ORDER BY id').toArray().map((n) => n.text); }
  history(limit) {
    return this.sql.exec('SELECT role, parts, t FROM messages WHERE epoch = ? ORDER BY id DESC LIMIT ?', this.epoch(), limit)
      .toArray().reverse().map((m) => ({ role: m.role, parts: JSON.parse(m.parts), t: m.t }));
  }
  saveNote(text) {
    // Moving duplicates to the end matches the legacy memory's bounded note ordering.
    this.sql.exec('DELETE FROM notes WHERE text = ?', text);
    this.sql.exec('INSERT INTO notes(text) VALUES (?)', text);
    this.sql.exec('DELETE FROM notes WHERE id NOT IN (SELECT id FROM notes ORDER BY id DESC LIMIT ?)', MAX_NOTES);
  }

  async initialize(key) {
    const existing = this.meta('key');
    if (existing && existing !== key) throw new Error('Conversation key mismatch');
    if (existing) return;
    // Import the current KV conversation/notes exactly once. Do not delete its source or archives.
    // Reading KV can fail: leave initialization unset in that case, so a retry cannot silently
    // replace existing data with a fresh empty conversation.
    const [log, notes] = this.env.MEMORY ? await Promise.all([
      this.env.MEMORY.get(key, 'json'), this.env.MEMORY.get(`notes:${key}`, 'json'),
    ]) : [[], []];
    if (log && !Array.isArray(log)) throw new Error('Invalid legacy conversation');
    if (notes && !Array.isArray(notes)) throw new Error('Invalid legacy notes');
    this.state.storage.transactionSync(() => {
      for (const message of log || []) {
        if (!['user', 'model'].includes(message.role) || !Array.isArray(message.parts)) throw new Error('Invalid legacy message');
        this.sql.exec('INSERT INTO messages(epoch, role, parts, t) VALUES (0, ?, ?, ?)', message.role, JSON.stringify(message.parts), Number(message.t) || Date.now());
      }
      for (const note of (notes || []).slice(-MAX_NOTES)) {
        if (typeof note !== 'string') throw new Error('Invalid legacy note');
        this.saveNote(note);
      }
      this.sql.exec("INSERT INTO meta(name, value) VALUES ('epoch', '0')");
      this.sql.exec("INSERT INTO meta(name, value) VALUES ('key', ?)", key);
    });
  }

  async handle(request) {
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.key !== 'string' || !/^history:(?:[1-9]\d{0,20}|user:[a-z0-9_-]{1,64})$/.test(body.key)) return json({ error: 'Invalid conversation' }, 400);
    try {
      await this.initialize(body.key);
      const path = new URL(request.url).pathname;
      if (path === '/history') return json({ messages: this.history(200) });
      if (path === '/notes') return json({ notes: this.notes() });
      if (path === '/notes/clear') {
        this.sql.exec('DELETE FROM notes');
        return json({ ok: true });
      }
      if (path === '/note') {
        if (typeof body.note !== 'string' || !body.note.trim()) return json({ error: 'Empty note' }, 400);
        this.state.storage.transactionSync(() => this.saveNote(body.note.trim().slice(0, 300)));
        return json({ ok: true });
      }
      if (path === '/reset') {
        // Archive by changing the active epoch, never by deleting/copying old messages.
        this.sql.exec("UPDATE meta SET value = ? WHERE name = 'epoch'", String(this.epoch() + 1));
        return json({ ok: true });
      }
      if (path === '/turn') {
        if (typeof body.input !== 'string' || !body.input.trim() || body.input.length > 4096 || typeof body.system !== 'string') return json({ error: 'Invalid turn' }, 400);
        const note = noteFrom(body.input);
        if (note) this.state.storage.transactionSync(() => this.saveNote(note));
        const reply = await respond(this.env, body.input, body.system, this.history(CONTEXT_MESSAGES), this.notes());
        const epoch = this.epoch(), t = Date.now();
        this.state.storage.transactionSync(() => {
          this.sql.exec('INSERT INTO messages(epoch, role, parts, t) VALUES (?, ?, ?, ?)', epoch, 'user', JSON.stringify([{ text: body.input }]), t);
          this.sql.exec('INSERT INTO messages(epoch, role, parts, t) VALUES (?, ?, ?, ?)', epoch, 'model', JSON.stringify([{ text: reply }]), t);
        });
        return json({ reply });
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      return json({ error: error.message || 'Conversation unavailable' }, 502);
    }
  }
}
