// Owner-only portfolio knowledge: what every project and repo is, where it stands and what is left.
// build-knowledge.mjs (npm postinstall) copies docs/PORTFOLIO.md and each project's CLAUDE.md/ROADMAP/PROGRESS into
// ./public/knowledge at deploy time; at runtime the owner's prompt gets the portfolio plus the projects a
// message names. Never shown to team members or client workspaces.

// id = the asset name; dir = folder in the repo (default: id); names = how people refer to it, in Persian
// and English. Each project's CLAUDE.md (the agent brief: spec + work queue) comes first when it exists.
export const PROJECTS = [
  { id: 'hermes', names: ['هرمس', 'hermes'], docs: ['CLAUDE.md', 'ROADMAP.md', 'PROGRESS.md'] },
  { id: 'mega-skills-router', dir: 'plugins/mega-skills-router', names: ['مگا اسکیل', 'mega skill', 'mega-skills-router'], docs: ['CLAUDE.md', 'PROGRESS.md'] },
  { id: 'fjcod', names: ['چام', 'فروشگاه', 'cham', 'fjcod'], docs: ['CLAUDE.md', 'PROGRESS.md'] },
  { id: 'viking-team', names: ['وایکینگ', 'viking'], docs: ['CLAUDE.md', 'PROGRESS.md'] },
  { id: 'lithos', names: ['لیتوس', 'lithos'], docs: ['CLAUDE.md', 'PROGRESS.md'] },
  { id: 'psk', names: ['psk', 'mega skills 3000', 'مگا اسکیلز ۳۰۰۰'], docs: ['CLAUDE.md', 'PROGRESS.md'] },
  { id: 'bison-brand-book', names: ['بایسون', 'برندبوک', 'bison'], docs: ['CLAUDE.md', 'PROGRESS.md'] },
  { id: 'mobile', names: ['موبایل', 'کنسول', 'mobile'], docs: ['CLAUDE.md', 'PROGRESS.md'] },
  { id: 'orchestrator', names: ['ارکستراتور', 'orchestrator'], docs: ['CLAUDE.md', 'PROGRESS.md'] },
];

/**
 * The part of one project doc worth keeping (build-knowledge.mjs, at deploy time). CLAUDE.md: its yaml
 * project spec plus the "## صف کار" work queue. A roadmap: from its open queue on. Anything else: whole.
 */
export function focusDoc(name, md) {
  const text = String(md || '');
  if (name === 'CLAUDE.md') {
    const spec = text.match(/```ya?ml\n[\s\S]*?```/);
    const queue = text.match(/^##\s*صف کار[^\n]*\n[\s\S]*?(?=^##\s|(?![\s\S]))/m);
    const parts = [spec && spec[0], queue && queue[0].trim()].filter(Boolean);
    return parts.length ? parts.join('\n\n') : text;
  }
  const at = text.search(/^##\s*(صف کارها|کارهای بعدی|کار مانده|Next|TODO)/m);
  return at > 0 ? text.slice(at) : text;
}

export const PORTFOLIO_CHARS = 1800;
export const PROJECT_CHARS = 1400;
export const MAX_PROJECTS = 2;

// Questions about the work as a whole: status, repos, what is left, contracts, delivery.
const GENERAL = /پروژه|ریپو|مخزن|وضعیت|گزارش کار|کار(?:های)? مانده|باقی‌مانده|نقشهٔ راه|نقشه راه|تحویل|قرارداد|مگا ?اسکیل|\b(?:projects?|repos?|status|roadmap|portfolio|backlog)\b/i;

const norm = (s) => String(s || '').toLowerCase().replace(/[‌ً-ٟ]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک');

/** Projects a message names, in the order of PROJECTS (at most MAX_PROJECTS). */
export function mentionedProjects(text) {
  const t = norm(text);
  return PROJECTS.filter((p) => p.names.some((n) => {
    const name = norm(n);
    return /^[a-z0-9 ]+$/.test(name) ? new RegExp(`\\b${name}\\b`).test(t) : t.includes(name);
  })).slice(0, MAX_PROJECTS);
}

export function clip(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const nl = cut.lastIndexOf('\n');
  return (nl > max * 0.6 ? cut.slice(0, nl) : cut.replace(/\s+\S*$/, '')) + '\n…';
}

async function asset(env, name) {
  try {
    const res = await env.ASSETS.fetch(new Request(`https://assets.local/knowledge/${name}`));
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

/** Raw portfolio text (for /projects). Empty when the deploy has no knowledge pack. */
export async function portfolioText(env) {
  return env.ASSETS ? asset(env, 'portfolio.md') : '';
}

/** The knowledge block to append to the owner's system prompt for this message, or ''. Never throws. */
export async function projectKnowledge(env, text) {
  if (!env.ASSETS) return '';
  const projects = mentionedProjects(text);
  if (!projects.length && !GENERAL.test(norm(text))) return '';
  const [portfolio, ...docs] = await Promise.all([asset(env, 'portfolio.md'), ...projects.map((p) => asset(env, `${p.id}.md`))]);
  const parts = [];
  if (portfolio) parts.push(clip(portfolio, PORTFOLIO_CHARS));
  docs.forEach((d, i) => { if (d) parts.push(`### ${projects[i].id}\n${clip(d, PROJECT_CHARS)}`); });
  if (!parts.length) return '';
  return '\n\nOWNER PORTFOLIO KNOWLEDGE (from the repository docs at the last deploy; it can be a few days behind — ' +
    'say so when the owner asks about live state, and never invent progress, numbers or links that are not here).\n\n' +
    parts.join('\n\n');
}
