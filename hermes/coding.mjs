// Coding mode: when a message is about code, Hermes answers like a senior engineer — complete runnable files,
// tests and run commands — with the matching Pro coding skill(s) from the Mega Skills library and the providers'
// code-specialist models first. Detection is cheap and local (no model call).
import { skillByName } from './skill-router.mjs';

// Pro coding skills (library/skills/pro-*) and the requests each one serves, most specific first.
export const CODE_INTENTS = [
  ['pro-security-review', /امنیت|آسیب[‌ ]?پذیر|نفوذ|هک|\b(security|vulnerab\w*|xss|csrf|sql injection|owasp|auth[a-z]*|jwt|secrets?)\b/i],
  ['pro-debugging', /باگ|ارور|خطا|کار نمی[‌ ]?کن|درست کار نمی|کرش|\b(bug|debug\w*|error|exception|traceback|stack ?trace|crash\w*|undefined is not|null pointer|segfault|failing)\b/i],
  ['pro-code-review', /ریویو|بازبینی|\b(review|pull request|pr|diff|code smell|refactor\w*)\b/i],
  ['pro-testing-strategy', /تست|\b(tests?|testing|unit|e2e|coverage|jest|vitest|pytest|playwright|mock\w*)\b/i],
  ['pro-backend-api-design', /بک[‌ ]?اند|دیتابیس|پایگاه داده|\b(api|endpoint|rest|graphql|backend|database|schema|sql|postgres|supabase|migration)\b/i],
  ['pro-frontend-engineering', /فرانت|کامپوننت|\b(react|vue|svelte|next\.?js|css|html|tailwind|frontend|component|dom)\b/i],
  ['pro-git-workflow', /کامیت|برنچ|\b(git|commit|branch|merge|rebase|cherry-pick|github actions)\b/i],
];
export const MAX_CODE_SKILLS = 2;

// "کد" alone is ambiguous in Persian (membership, discount, tracking codes), so those uses never count as code.
const NOT_CODE = /کد\s*(عضویت|تخفیف|رهگیری|ملی|پستی|تایید|تأیید|معرف|پیگیری|اقتصادی)/;
const STRONG = [
  /```/,
  /^\s*(def|class|import|from \S+ import|function|const|let|var|async function|export|package|public class|#include)\b/m,
  /\b(Traceback \(most recent call last\)|TypeError|ReferenceError|SyntaxError|NullPointerException|ModuleNotFoundError|Uncaught)\b/,
  /\bat \S+ \(\S+:\d+:\d+\)/,
  /=>\s*[{(]|\)\s*\{\s*$|;\s*$/m,
  /\b(SELECT .+ FROM|INSERT INTO|CREATE TABLE)\b/i,
];
const WORDS = /کدنویسی|ریویو|پول ریکوئست|برنامه[‌ ]?نویس|اسکریپت|دیباگ|ریپازیتوری|ریپو|کامپایل|ترمینال|(?<!\p{L})کد(?:م|ش|ت|ها)?(?!\p{L})|\b(code|coding|script|function|python|javascript|typescript|node\.?js|react|java|golang|rust|kotlin|swift|php|sql|bash|shell|regex|api|json|yaml|docker|kubernetes|npm|pip|git|bug|debug|compile|deploy|frontend|backend|algorithm|pr|pull request|repo|commit)\b|c\+\+|c#/iu;

/** True when the message asks for or contains code. */
export function isCodeRequest(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (STRONG.some((re) => re.test(t))) return true;
  return WORDS.test(t.replace(NOT_CODE, ''));
}

/** Pro skill names for a coding message, most specific first (at most MAX_CODE_SKILLS). */
export function codeSkillNames(text) {
  const t = String(text || '');
  return CODE_INTENTS.filter(([, re]) => re.test(t)).map(([name]) => name).slice(0, MAX_CODE_SKILLS);
}

/** The Pro skills for this message as [{ name, text }] (empty when the deploy has no skill assets). Never throws. */
export async function codeSkills(env, text) {
  const docs = await Promise.all(codeSkillNames(text).map((n) => skillByName(env, n)));
  return docs.filter(Boolean);
}

export const CODE_PLAYBOOK = `

CODING MODE — answer as a senior software engineer:
1. Restate the goal and your assumptions in one line. Ask one question only if a missing detail blocks a correct answer.
2. Give complete, runnable code: each file in its own fenced block with the language tag, its path as the first comment line (e.g. "// path: src/app.js"). Never write placeholders such as "...rest of the code".
3. Use the user's existing stack and the standard library first; name and pin any new dependency and say why it is needed.
4. Validate input at the boundaries and handle errors and edge cases (empty or null values, Persian/RTL text and half-spaces, timeouts, concurrency). Never put keys, tokens or passwords in code — read them from environment variables.
5. Include tests in the stack's usual framework and the exact commands to install, run and test.
6. Bugs: reproduce → root cause → minimal fix → regression test. Reviews: findings ranked 🔴 blocking / 🟠 important / 🟡 optional, each with the concrete input that breaks it and a minimal patch.
7. Flag security risks (injection, missing authorization, leaked secrets), performance traps (N+1 queries, work in hot paths) and anything that costs money.
8. You cannot run the code here: say it is untested, and list exactly what to run to verify it. Never claim it was executed.
9. Code, identifiers and code comments in English; the explanation after the code in the user's language, short.`;

const EXT = { javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', tsx: 'tsx', jsx: 'jsx', python: 'py', py: 'py', sql: 'sql',
  bash: 'sh', sh: 'sh', shell: 'sh', json: 'json', yaml: 'yml', yml: 'yml', html: 'html', css: 'css', go: 'go', rust: 'rs',
  java: 'java', kotlin: 'kt', swift: 'swift', php: 'php', toml: 'toml', dockerfile: 'Dockerfile' };
const PATH_LINE = /^\s*(?:\/\/|#|--|<!--)\s*(?:path|file)\s*:\s*([\w.\-/]{1,120})/i;

/**
 * Big fenced code blocks of a reply, as files to send next to the text (Telegram splits long messages, which
 * breaks copy-paste). Name from a "// path: …" first line, else code-N.<ext>. Blocks under `min` characters stay inline.
 */
export function codeFiles(reply, min = 1500) {
  const out = [];
  const re = /```([\w+#-]*)[^\n]*\n([\s\S]*?)```/g;
  let m, n = 0;
  while ((m = re.exec(String(reply || ''))) && out.length < 5) {
    const body = m[2];
    if (body.length < min) continue;
    n++;
    const named = body.match(PATH_LINE);
    const ext = EXT[m[1].toLowerCase()] || 'txt';
    out.push({ name: named ? named[1].split('/').pop() : `code-${n}.${ext}`, text: body });
  }
  return out;
}
