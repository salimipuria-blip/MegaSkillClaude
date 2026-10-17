// Team account management for the owner (roadmap #6): create, disable/enable and reset
// passwords from the app or Telegram, without a PR. Built-in accounts stay in users.mjs;
// everything the owner changes lives in KV under acct:<username> and is never deleted
// (disabling is reversible). Passwords are generated here, shown to the owner once, and
// only their salted PBKDF2 hash is stored.
import { USERS } from './users.mjs';
import { hashPassword } from './auth.mjs';

const INDEX_KEY = 'acct:index';
export const ROLES = ['admin', 'member'];
export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export function generatePassword() {
  const pick = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
}

function needMemory(env) {
  if (!env.MEMORY) throw new Error('حافظه (KV) وصل نیست.');
}

const record = (env, username) => env.MEMORY.get(`acct:${username}`, 'json');
const saveRecord = (env, username, rec) => env.MEMORY.put(`acct:${username}`, JSON.stringify(rec));

async function readIndex(env) {
  const list = await env.MEMORY.get(INDEX_KEY, 'json');
  return Array.isArray(list) ? list : [];
}

async function exists(env, username) {
  if (Object.hasOwn(USERS, username)) return true;
  const rec = await record(env, username);
  return Boolean(rec && rec.hash);
}

async function requireAccount(env, username) {
  username = String(username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(username) || !(await exists(env, username))) throw new Error(`حساب «${username}» پیدا نشد.`);
  return username;
}

function cleanLocks(locks, abilities) {
  const list = Array.isArray(locks) ? locks : String(locks || '').split(/[\s,،]+/);
  return [...new Set(list.map((l) => String(l).trim().toLowerCase()).filter((l) => Object.hasOwn(abilities, l)))];
}

/** Every account, built-in first, with its current state. Never includes hashes. */
export async function listAccounts(env) {
  needMemory(env);
  const names = [...new Set([...Object.keys(USERS), ...(await readIndex(env))])];
  const out = [];
  for (const username of names) {
    const rec = (await record(env, username)) || {};
    const base = USERS[username] || {};
    if (!Object.hasOwn(USERS, username) && !rec.hash) continue;
    out.push({
      username,
      name: rec.name || base.name,
      role: rec.role || base.role,
      locks: rec.locks || base.locks || [],
      disabled: Boolean(rec.disabled),
      builtin: Object.hasOwn(USERS, username),
    });
  }
  return out;
}

/** Creates an account and returns its one-time password. */
export async function createAccount(env, { username, name, role = 'member', locks = [] }, abilities = {}) {
  needMemory(env);
  username = String(username || '').trim().toLowerCase();
  name = String(name || '').trim().slice(0, 40);
  if (!USERNAME_RE.test(username)) throw new Error('نام کاربری: ۳ تا ۲۰ حرف انگلیسی کوچک، عدد یا _ و با حرف شروع شود.');
  if (!name) throw new Error('نام نمایشی لازم است.');
  if (!ROLES.includes(role)) throw new Error('نقش باید admin یا member باشد.');
  if (await exists(env, username)) throw new Error(`حساب «${username}» از قبل وجود دارد.`);
  const password = generatePassword();
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await saveRecord(env, username, {
    name, role, locks: cleanLocks(locks, abilities), salt, hash: await hashPassword(password, salt),
    disabled: false, created: new Date().toISOString(),
  });
  const index = await readIndex(env);
  if (!index.includes(username)) await env.MEMORY.put(INDEX_KEY, JSON.stringify([...index, username]));
  return { username, name, role, password };
}

/** Disables (or re-enables) an account. Disabling also ends every open session. */
export async function setDisabled(env, username, disabled) {
  needMemory(env);
  username = await requireAccount(env, username);
  const rec = (await record(env, username)) || {};
  rec.disabled = Boolean(disabled);
  if (rec.disabled) rec.validAfter = Date.now();
  await saveRecord(env, username, rec);
  return { username, disabled: rec.disabled };
}

/** Issues a new password (shown once) and signs the person out everywhere. */
export async function resetPassword(env, username) {
  needMemory(env);
  username = await requireAccount(env, username);
  const password = generatePassword();
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.MEMORY.put(`pw:${username}`, JSON.stringify({ salt, hash: await hashPassword(password, salt) }));
  const rec = (await record(env, username)) || {};
  rec.validAfter = Date.now();
  await saveRecord(env, username, rec);
  return { username, password };
}

const ROLE_FA = { admin: 'مدیر', member: 'عضو' };

/** Telegram commands for the owner. Returns the reply text, or null when the input is not one. */
export async function accountCommand(env, input, abilities = {}) {
  const m = input.match(/^\/(users|user_add|user_off|user_on|user_reset)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const args = (m[2] || '').trim();
  if (cmd === 'users') {
    const list = await listAccounts(env);
    return '👥 حساب‌های تیم:\n' + list.map((a) => `${a.disabled ? '⛔' : '✅'} ${a.username} — ${a.name} (${ROLE_FA[a.role] || a.role})${a.locks.length ? ` 🔒${a.locks.join(',')}` : ''}`).join('\n') +
      '\n\nساخت: /user_add نام‌کاربری member|admin نام نمایشی\nغیرفعال/فعال: /user_off نام‌کاربری · /user_on نام‌کاربری\nرمز جدید: /user_reset نام‌کاربری';
  }
  if (cmd === 'user_add') {
    const p = args.match(/^(\S+)\s+(admin|member)\s+(.+)$/i);
    if (!p) return 'مثال: /user_add sara member سارا';
    const a = await createAccount(env, { username: p[1], role: p[2].toLowerCase(), name: p[3] }, abilities);
    return `✅ حساب ${a.username} (${a.name}) ساخته شد.\nرمز یک‌بار مصرف: ${a.password}\n\nفقط خصوصی به خودش بده؛ بعد از ورود از اپ رمزش را عوض کند.`;
  }
  if (!args) return `نام کاربری را هم بنویس، مثلاً /${cmd} sara`;
  if (cmd === 'user_off') { const r = await setDisabled(env, args, true); return `⛔ ${r.username} غیرفعال شد و از همهٔ دستگاه‌ها خارج شد.`; }
  if (cmd === 'user_on') { const r = await setDisabled(env, args, false); return `✅ ${r.username} دوباره فعال شد.`; }
  const r = await resetPassword(env, args);
  return `🔑 رمز جدید ${r.username}: ${r.password}\nاز همهٔ دستگاه‌ها خارج شد؛ فقط خصوصی به خودش بده.`;
}
