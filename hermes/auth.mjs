// Team accounts for the web app: username + password, then a signed session token.
// Passwords are only ever stored as salted PBKDF2-SHA256 hashes (users.mjs, or KV after a change).
import { USERS } from './users.mjs';

const enc = new TextEncoder();
const ITERATIONS = 100000;            // the Workers runtime's PBKDF2 maximum
const SESSION_DAYS = 30;
const MAX_FAILS = 8;                  // per username, per 15 minutes

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITERATIONS }, key, 256);
  return hex(bits);
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The account, with a password changed in the app (KV) taking precedence over users.mjs.
async function account(env, username) {
  const base = Object.hasOwn(USERS, username) ? USERS[username] : null;
  if (!base) return null;
  const changed = env.MEMORY ? await env.MEMORY.get(`pw:${username}`, 'json') : null;
  return { ...base, ...(changed || {}) };
}

async function sign(env, data) {
  const secret = await crypto.subtle.digest('SHA-256', enc.encode(`session:${env.TELEGRAM_BOT_TOKEN}`));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// Returns { token, user } or { error, status }.
export async function login(env, username, password) {
  username = String(username || '').trim().toLowerCase();
  password = String(password || '');
  const failKey = `fail:${username}`;
  const fails = env.MEMORY ? Number(await env.MEMORY.get(failKey)) || 0 : 0;
  if (fails >= MAX_FAILS) return { error: 'تلاش زیاد بود. ۱۵ دقیقهٔ دیگر دوباره امتحان کن.', status: 429 };
  const acc = await account(env, username);
  const ok = acc && sameText(await hashPassword(password, acc.salt), acc.hash);
  if (!ok) {
    if (env.MEMORY) await env.MEMORY.put(failKey, String(fails + 1), { expirationTtl: 900 });
    return { error: 'نام کاربری یا رمز اشتباه است.', status: 401 };
  }
  if (fails && env.MEMORY) await env.MEMORY.delete(failKey);
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const data = `${username}.${exp}`;
  return { token: `${data}.${await sign(env, data)}`, user: { username, name: acc.name, role: acc.role } };
}

// The user a session token belongs to, or null.
export async function sessionUser(env, token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [username, exp, sig] = parts;
  if (!(Number(exp) > Date.now())) return null;
  if (!sameText(await sign(env, `${username}.${exp}`), sig)) return null;
  const acc = await account(env, username);
  return acc ? { username, name: acc.name, role: acc.role } : null;
}

export async function changePassword(env, username, oldPassword, newPassword) {
  if (!env.MEMORY) return { error: 'حافظه وصل نیست.', status: 500 };
  if (String(newPassword || '').length < 8) return { error: 'رمز جدید حداقل ۸ حرف باشد.', status: 400 };
  const acc = await account(env, username);
  if (!acc || !sameText(await hashPassword(String(oldPassword || ''), acc.salt), acc.hash)) {
    return { error: 'رمز فعلی اشتباه است.', status: 401 };
  }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.MEMORY.put(`pw:${username}`, JSON.stringify({ salt, hash: await hashPassword(newPassword, salt) }));
  return { ok: true };
}
