// Memory: the laws, the notes, the journal. Append-only where it matters.
//
// A law is a directive from the owner that the agent may never silently rewrite. Notes are
// learned context. The journal is the audit trail: every run leaves one entry with what was
// claimed, what was proven, and how much context compression cost.

export const LAW_KINDS = {
  law: { label: 'قانون', locked: true, tone: 'gold' },
  note: { label: 'یادداشت', locked: false, tone: 'cyan' },
  decision: { label: 'تصمیم', locked: false, tone: 'violet' },
};

/** The owner's standing orders, seeded once. Copy is deliberate: these are quotes, not vibes. */
export const DEFAULT_LAWS = [
  {
    id: 'law-no-stop',
    kind: 'law',
    text: 'تا رسیدن به هدف، توقف ممنوع؛ پرسیدن سؤال هم ممنوع. تصمیم‌ها با خودِ ایجنت است.',
    source: 'دستور مالک · ۲۰۲۶-۱۰-۳۰',
  },
  {
    id: 'law-three',
    kind: 'law',
    text: 'برای کوچک‌ترین تغییر هم سه احتمال دقیق بساز و هر سه را بسنج؛ یک پاسخ کافی نیست.',
    source: 'دستور مالک · ۲۰۲۶-۱۰-۳۰',
  },
  {
    id: 'law-compress',
    kind: 'law',
    text: 'کانتکست را به‌موقع فشرده کن و رشد را تا بی‌نهایت ادامه بده؛ نشتی و فراموشی ممنوع.',
    source: 'دستور مالک · ۲۰۲۶-۱۰-۳۰',
  },
  {
    id: 'law-prove',
    kind: 'law',
    text: 'هیچ تغییری بدون اجرای واقعی تست تأیید نمی‌شود؛ «انجام شد» فقط با خروجی دیده‌شده.',
    source: 'مهارت خودبهسازی',
  },
  {
    id: 'law-persian',
    kind: 'law',
    text: 'زبان پاسخ فارسی است؛ فقط کد، دستور و نام فنی انگلیسی می‌ماند.',
    source: 'CLAUDE.md مخزن',
  },
  {
    id: 'law-secret',
    kind: 'law',
    text: 'هیچ کلید، توکن یا رمزی در کد، لاگ، خروجی زیپ یا حافظهٔ مشترک نوشته نمی‌شود.',
    source: 'SECURITY.md',
  },
  {
    id: 'law-honest',
    kind: 'law',
    text: 'اگر کاری انجام نشد، همان‌جا گفته می‌شود؛ تست ساختگی و نتیجهٔ جعلی، بدترین شکست است.',
    source: 'اصل صداقت',
  },
];

export function createMemory({ laws = DEFAULT_LAWS, notes = [], journal = [] } = {}) {
  const store = {
    laws: laws.map((l) => ({ ...l })),
    notes: notes.map((n) => ({ ...n })),
    journal: journal.map((j) => ({ ...j })),
  };

  let seq = 1;

  function addNote(text, kind = 'note', meta = {}) {
    const clean = String(text || '').trim();
    if (!clean) return null;
    if (store.notes.some((n) => n.text === clean)) return store.notes.find((n) => n.text === clean);
    const note = { id: `n${Date.now().toString(36)}-${seq++}`, text: clean, kind, at: Date.now(), ...meta };
    store.notes.unshift(note);
    if (store.notes.length > 500) store.notes.length = 500;
    return note;
  }

  return {
    get laws() {
      return [...store.laws];
    },
    get notes() {
      return [...store.notes];
    },
    get journal() {
      return [...store.journal];
    },
    remember: addNote,
    note: addNote,
    journalEntry(entry) {
      store.journal.unshift({ at: Date.now(), ...entry });
      if (store.journal.length > 300) store.journal.length = 300;
    },
    removeNote(id) {
      const idx = store.notes.findIndex((n) => n.id === id);
      if (idx === -1) return false;
      store.notes.splice(idx, 1);
      return true;
    },
    /** Laws are locked: adding is allowed, editing an existing law is not. */
    addLaw(text, source = 'مالک') {
      const clean = String(text || '').trim();
      if (!clean) return null;
      const law = { id: `law-${Date.now().toString(36)}`, kind: 'law', text: clean, source };
      store.laws.push(law);
      return law;
    },
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return { laws: store.laws, notes: store.notes };
      const hit = (t) => String(t).toLowerCase().includes(q);
      return {
        laws: store.laws.filter((l) => hit(l.text) || hit(l.source)),
        notes: store.notes.filter((n) => hit(n.text)),
      };
    },
    export() {
      return { laws: store.laws, notes: store.notes, journal: store.journal, exportedAt: Date.now() };
    },
    import(data) {
      if (!data || typeof data !== 'object') return false;
      if (Array.isArray(data.laws)) store.laws = data.laws.map((l) => ({ ...l }));
      if (Array.isArray(data.notes)) store.notes = data.notes.map((n) => ({ ...n }));
      if (Array.isArray(data.journal)) store.journal = data.journal.map((j) => ({ ...j }));
      return true;
    },
    stats() {
      return {
        laws: store.laws.length,
        notes: store.notes.length,
        journal: store.journal.length,
        lastRun: store.journal[0]?.at || null,
      };
    },
  };
}

/** Markdown export for a human (or another agent) to read. */
export function memoryToMarkdown(memory) {
  const { laws, notes, journal } = memory.export();
  const lines = ['# حافظهٔ ایجنت', '', '## قوانین', ...laws.map((l) => `- ${l.text} _( ${l.source} )_`), '', '## یادداشت‌ها'];
  lines.push(...(notes.length ? notes.map((n) => `- ${new Date(n.at).toISOString().slice(0, 16)} · ${n.text}`) : ['(خالی)']));
  lines.push('', '## دفتر جریان');
  lines.push(...(journal.length
    ? journal.slice(0, 60).map((j) => `- ${new Date(j.at).toISOString().slice(0, 16)} · ${j.ok ? '✅' : '⛔'} ${j.goal || j.event || ''} ${j.score != null ? `· امتیاز ${j.score}` : ''}`)
    : ['(خالی)']));
  return lines.join('\n');
}
