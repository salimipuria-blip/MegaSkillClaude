// Owner-only GitHub tools for Telegram: CI state, open PRs, reading a repo file and a professional review of it.
// Read-only. The repo is private, so it needs the Cloudflare secret GITHUB_REPO_TOKEN (fine-grained, read-only:
// Contents, Actions, Pull requests); GITHUB_REPO overrides the default repository.
import { fetchWithTimeout } from './resilience.mjs';

export const DEFAULT_REPO = 'salimipuria-blip/MegaSkillClaude';
export const FILE_CHARS = 12000; // what a review sends to the model; longer files are cut with a note
const PATH_RE = /^[\w.\-/]{1,200}$/;
const TOKEN_HELP = 'ریپو خصوصی است؛ برای دسترسی، در Cloudflare secret به نام GITHUB_REPO_TOKEN بگذار ' +
  '(توکن fine-grained فقط Read برای Contents، Actions و Pull requests): https://github.com/settings/personal-access-tokens/new';

const repoOf = (env) => String(env.GITHUB_REPO || DEFAULT_REPO).trim();

async function gh(env, path) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'hermes-bot', 'x-github-api-version': '2022-11-28' };
  if (env.GITHUB_REPO_TOKEN) headers.authorization = `Bearer ${String(env.GITHUB_REPO_TOKEN).trim()}`;
  const res = await fetchWithTimeout(`https://api.github.com/repos/${repoOf(env)}/${path}`, { headers });
  if (res.status === 401) throw new Error('توکن GitHub پذیرفته نشد (۴۰۱)؛ GITHUB_REPO_TOKEN را عوض کن.');
  if (res.status === 403 || res.status === 429) throw new Error('GitHub فعلاً اجازه نداد (سقف درخواست یا دسترسی توکن).');
  if (res.status === 404) throw new Error(env.GITHUB_REPO_TOKEN ? 'پیدا نشد (مسیر یا دسترسی توکن را چک کن).' : TOKEN_HELP);
  if (!res.ok) throw new Error(`GitHub جواب نداد (${res.status}).`);
  return res.json();
}

export function safePath(path) {
  const p = String(path || '').trim().replace(/^\/+/, '');
  if (!PATH_RE.test(p) || p.split('/').includes('..')) throw new Error('مسیر فایل نامعتبر است؛ مثال: /file hermes/worker.mjs');
  return p;
}

const ICON = { success: '✅', failure: '❌', cancelled: '⚪', skipped: '⚪', timed_out: '⌛', action_required: '⚠️' };

/** Latest result of each workflow on the default branch. */
export async function ciStatus(env) {
  const data = await gh(env, 'actions/runs?branch=main&per_page=20');
  const seen = new Map();
  for (const r of data.workflow_runs || []) if (!seen.has(r.name)) seen.set(r.name, r);
  if (!seen.size) return 'هیچ اجرای CI روی main پیدا نشد.';
  const lines = [...seen.values()].map((r) => {
    const state = r.status === 'completed' ? (ICON[r.conclusion] || '❔') : '⏳';
    return `${state} ${r.name} — ${String(r.head_sha || '').slice(0, 7)} ${String(r.display_title || '').slice(0, 60)}`;
  });
  return `وضعیت CI روی main (${repoOf(env)}):\n${lines.join('\n')}`;
}

/** Open pull requests, people's first; bot PRs only counted. */
export async function openPRs(env) {
  const list = await gh(env, 'pulls?state=open&per_page=50');
  const bots = list.filter((p) => p.user && /\[bot\]$/.test(p.user.login));
  const people = list.filter((p) => !bots.includes(p));
  if (!list.length) return 'هیچ PR بازی نیست.';
  const lines = people.slice(0, 15).map((p) => `${p.draft ? '📝' : '🔵'} #${p.number} ${String(p.title).slice(0, 70)}`);
  return `PRهای باز (${repoOf(env)}):\n${lines.join('\n') || '—'}${bots.length ? `\n\n+ ${bots.length} PR خودکار (مثل Dependabot)` : ''}`;
}

const decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, '')), (c) => c.charCodeAt(0)));

/** A file's text, or a directory listing, from the default branch. */
export async function readFile(env, path) {
  const p = safePath(path);
  const data = await gh(env, `contents/${p.split('/').map(encodeURIComponent).join('/')}?ref=main`);
  if (Array.isArray(data)) {
    return { path: p, dir: true, text: data.map((e) => `${e.type === 'dir' ? '📁' : '📄'} ${e.name}`).join('\n') };
  }
  if (data.type !== 'file' || typeof data.content !== 'string') throw new Error('این مسیر فایل متنی نیست.');
  // Over 1 MB the contents API returns encoding "none" and an empty content: say so instead of an empty file.
  if (data.encoding && data.encoding !== 'base64') throw new Error(`فایل بزرگ‌تر از ۱ مگابایت است (${Number(data.size || 0).toLocaleString('fa-IR')} بایت)؛ فقط فایل‌های کوچک‌تر خوانده می‌شوند.`);
  return { path: p, dir: false, text: decode(data.content) };
}

export const LANG = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'tsx', jsx: 'jsx', py: 'python',
  sql: 'sql', sh: 'bash', json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml', toml: 'toml', html: 'html', css: 'css' };
export const langOf = (path) => LANG[String(path).split('.').pop().toLowerCase()] || '';

/** The message that asks the model for a professional review of a repo file (goes through coding mode). */
export function reviewPrompt(path, text) {
  const cut = text.length > FILE_CHARS;
  const body = cut ? `${text.slice(0, FILE_CHARS)}\n… [${text.length - FILE_CHARS} more characters not shown]` : text;
  return `Code review this file from my repository (${path})${cut ? ' — only its first part fits, say so' : ''}. ` +
    'Find real bugs, security problems and missing tests; rank findings 🔴/🟠/🟡 with the breaking input and a minimal patch. ' +
    `Answer in Persian.\n\n\`\`\`${langOf(path)}\n${body}\n\`\`\``;
}

/**
 * Telegram commands for the owner. Returns null when the input is not one, otherwise
 * { reply } (plain text), { file: { name, text, caption } } (send as a document) or { review } (a prompt for the brain).
 */
export async function githubCommand(env, input) {
  const m = String(input).match(/^\/(ci|prs|file|review)(?:@\w+)?(?:\s+(\S+))?\s*$/i);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  if (cmd === 'ci') return { reply: await ciStatus(env) };
  if (cmd === 'prs') return { reply: await openPRs(env) };
  if (!m[2]) return { reply: `مسیر فایل را هم بنویس، مثلاً /${cmd} hermes/worker.mjs` };
  const f = await readFile(env, m[2]);
  if (f.dir) return { reply: `📁 ${f.path}\n${f.text}` };
  if (cmd === 'review') return { review: reviewPrompt(f.path, f.text) };
  return { file: { name: f.path.split('/').pop(), text: f.text, caption: `📄 ${f.path} (${f.text.length.toLocaleString('fa-IR')} کاراکتر)` } };
}
