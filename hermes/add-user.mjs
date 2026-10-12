// Create a team account: node hermes/add-user.mjs <username> "<display name>" <admin|member>
// Prints a fresh password ONCE (give it to the person privately) and the line to paste into users.mjs.
// Only the salted hash goes into the repo; the password itself is never stored anywhere.
import { hashPassword } from './auth.mjs';

const [username, name, role = 'member'] = process.argv.slice(2);
if (!/^[a-z][a-z0-9_]{2,19}$/.test(username || '') || !name || !['admin', 'member'].includes(role)) {
  console.error('usage: node hermes/add-user.mjs <username a-z0-9_> "<display name>" <admin|member>');
  process.exit(1);
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const pick = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ALPHABET[b % ALPHABET.length]).join('');
const password = `${pick(4)}-${pick(4)}-${pick(4)}`;
const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const hash = await hashPassword(password, salt);

console.log(`password for ${username}: ${password}`);
console.log(`  ${username}: { name: ${JSON.stringify(name)}, role: '${role}', salt: '${salt}', hash: '${hash}' },`);
