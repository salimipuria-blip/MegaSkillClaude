// Mega Skills for Hermes: the repo's full skill library (6,017 skills) without blowing the Workers CPU budget.
// build-skills.mjs turns the router index into static assets at deploy time:
//   skills/t/<shard>.json  token → [skill ids]   (inverted index, sharded so each request parses only a few KB)
//   skills/s/<id>.md       the skill's instructions (trimmed)
// For each message we tokenize it, look up its tokens, score skills by IDF-weighted overlap and inject the best few.

export const SHARDS = 512;
export const MAX_SKILLS = 3;
export const SKILL_CHARS = 6000;
const MIN_SCORE = 2.2;          // weak, single-common-word matches are not worth the prompt space
const MAX_QUERY_TOKENS = 24;

// Same spirit as the router's route.py: fold Persian/Finglish synonyms onto the index vocabulary.
const ALIASES = {
  tarahi: 'design', 'طراحی': 'design', graphic: 'design', 'گرافیک': 'design',
  aks: 'image', 'عکس': 'image', 'تصویر': 'image', photo: 'image',
  tahlil: 'analysis', 'تحلیل': 'analysis', analyze: 'analysis',
  dade: 'data', 'داده': 'data', 'اطلاعات': 'data',
  'اکسل': 'excel', spreadsheet: 'excel',
  site: 'website', 'سایت': 'website', 'وبسایت': 'website', web: 'website',
  mohtava: 'content', 'محتوا': 'content',
  foroosh: 'sales', 'فروش': 'sales', sale: 'sales',
  roshd: 'growth', 'رشد': 'growth',
  sakht: 'create', 'ساخت': 'create', 'بساز': 'create',
  virayesh: 'edit', 'ویرایش': 'edit', 'اصلاح': 'edit',
  'ویدئو': 'video', 'ویدیو': 'video',
  'اینستاگرام': 'instagram', 'اینستا': 'instagram',
  'پرامپت': 'prompt', 'ایجنت': 'agent',
  'اتوماسیون': 'automation', 'خودکار': 'automation',
  'مرورگر': 'browser', 'داشبورد': 'dashboard',
  'کد': 'code', 'برنامه‌نویسی': 'code',
  'پژوهش': 'research', 'تحقیق': 'research',
  'بازاریابی': 'marketing', 'کسب‌وکار': 'business',
  'سفر': 'travel', 'سند': 'document', 'ارائه': 'presentation', 'اسلاید': 'presentation',
  'کپشن': 'caption', 'هشتگ': 'hashtag', 'ریلز': 'reels', 'تبلیغ': 'ad', 'تبلیغات': 'ad',
};
const STOPWORDS = new Set(['a', 'an', 'the', 'for', 'of', 'to', 'and', 'in', 'on', 'with', 'is', 'it', 'me', 'my', 'i', 'you',
  'va', 'و', 'در', 'برای', 'با', 'از', 'رو', 'را', 'به', 'که', 'این', 'آن', 'یک', 'هم', 'تا', 'من', 'تو', 'بده', 'کن', 'است',
  'چه', 'چی', 'چطور', 'می', 'بنویس', 'لطفا', 'لطفاً', 'هست', 'باشه', 'ها', 'های']);

const stem = (t) => {
  if (!/^[a-z]+$/.test(t)) return t;
  if (t.endsWith('ing') && t.length > 5) return t.slice(0, -3);
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1);
  return t;
};

export function tokens(text) {
  const norm = String(text).normalize('NFKC').toLowerCase().replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ');
  const out = new Set();
  for (const raw of norm.match(/[\p{L}\p{N}]+/gu) || []) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    out.add(stem(Object.hasOwn(ALIASES, raw) ? ALIASES[raw] : raw));
  }
  return out;
}

// FNV-1a, stable between the build script and the Worker.
export function shardOf(token) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % SHARDS;
}

// Build time: skills = [{ name, triggers }] → { shards: Array<Record<token, number[]>> }.
export function buildPostings(skills) {
  const shards = Array.from({ length: SHARDS }, () => ({}));
  skills.forEach((s, id) => {
    if (s.incomplete) return; // Keep packaged instructions, but do not route to missing dependencies.
    const toks = new Set([...tokens(s.name.replace(/-/g, ' ')), ...s.triggers.flatMap((t) => [...tokens(t)])]);
    for (const t of toks) { const sh = shards[shardOf(t)]; (Object.hasOwn(sh, t) ? sh[t] : (sh[t] = [])).push(id); }
  });
  return shards;
}

// Pure scoring, separated for tests: postings = Map<token, number[]>, total = number of skills.
export function rank(queryTokens, postings, total) {
  const score = new Map();
  for (const t of queryTokens) {
    const ids = postings.get(t);
    if (!ids || !ids.length) continue;
    const idf = Math.log(1 + total / ids.length);
    for (const id of ids) score.set(id, (score.get(id) || 0) + idf);
  }
  return [...score.entries()].filter(([, s]) => s >= MIN_SCORE).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

const shardCache = new Map();
let totalCache = 0;

async function asset(env, path) {
  const res = await env.ASSETS.fetch(new Request(`https://assets.local/${path}`));
  return res.ok ? res : null;
}

// Runtime: the most relevant skills for a message, as [{ name, text }]. Never throws.
export async function relevantSkills(env, text) {
  try {
    if (!env.ASSETS) return [];
    const q = [...tokens(text)].slice(0, MAX_QUERY_TOKENS);
    if (q.length < 2) return [];
    if (!totalCache) { const r = await asset(env, 'skills/meta.json'); totalCache = r ? (await r.json()).total : 0; }
    if (!totalCache) return [];
    const postings = new Map();
    const shardIds = [...new Set(q.map(shardOf))];
    await Promise.all(shardIds.map(async (n) => {
      if (!shardCache.has(n)) { const r = await asset(env, `skills/t/${n}.json`); shardCache.set(n, r ? await r.json() : {}); }
    }));
    for (const t of q) { const sh = shardCache.get(shardOf(t)); postings.set(t, Object.hasOwn(sh, t) && Array.isArray(sh[t]) ? sh[t] : []); }
    const best = rank(q, postings, totalCache).slice(0, MAX_SKILLS);
    const docs = await Promise.all(best.map(async ([id]) => { const r = await asset(env, `skills/s/${id}.md`); return r ? r.text() : ''; }));
    return docs.filter(Boolean).map((d) => {
      const nl = d.indexOf('\n');
      return { name: d.slice(0, nl).replace(/^#\s*/, ''), text: d.slice(nl + 1) };
    });
  } catch (err) {
    console.error('[Hermes] skill routing failed:', err.message);
    return [];
  }
}

// Stored skills keep up to SKILL_CHARS (6,000); in the prompt each is cut to PROMPT_SKILL_CHARS, since
// three 6k skills pushed requests past the free tiers' size limits (GitHub ~8k tokens, Groq 6–12k
// tokens/min) and spent quota on every message.
export const PROMPT_SKILL_CHARS = 2000;
const clip = (text) => (text.length > PROMPT_SKILL_CHARS ? `${text.slice(0, PROMPT_SKILL_CHARS).replace(/\s+\S*$/, '')} …` : text);

export function skillsBlock(skills) {
  if (!skills.length) return '';
  return '\n\nSPECIALIZED SKILLS selected for this request from the Mega Skills library. Apply what helps; ignore parts that ' +
    'need tools, files or actions you do not have, and never claim to have run code or opened links.\n' +
    skills.map((s) => `\n### ${s.name}\n${clip(String(s.text || ''))}`).join('\n');
}
