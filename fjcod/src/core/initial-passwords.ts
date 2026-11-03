import { randomSalt } from '../lib/crypto';

/**
 * First-login passwords. They are never written in source or docs: each fresh seed (or v1 → v2
 * migration) draws new random ones, stores only their hashes, and keeps the plain values in memory
 * for a single read by the login screen. Every account must replace its password on first sign-in.
 */
export type PasswordMap = Record<string, string>;

/** 8 random digits, unique across the given ids (the password alone identifies the user). */
export function randomPasswords(ids: string[]): PasswordMap {
  const out: PasswordMap = {};
  const used = new Set<string>();
  for (const id of ids) {
    let pwd = '';
    while (!pwd || used.has(pwd)) {
      pwd = Array.from(randomSalt().slice(0, 16).match(/../g)!, (h) => String(parseInt(h, 16) % 10)).join('').slice(0, 8);
    }
    used.add(pwd);
    out[id] = pwd;
  }
  return out;
}

let provider: (ids: string[]) => PasswordMap = randomPasswords;
let pending: PasswordMap | null = null;

/** Test hook: deterministic passwords for unit tests. Never called by the app. */
export function setInitialPasswordProvider(fn: (ids: string[]) => PasswordMap): void {
  provider = fn;
}

/** New first-login passwords for these accounts; remembered once for the login screen. */
export function issueInitialPasswords(ids: string[]): PasswordMap {
  const map = provider(ids);
  pending = { ...(pending ?? {}), ...map };
  return map;
}

/** The passwords issued in this page instance (memory only; gone on reload). */
export function peekInitialPasswords(): PasswordMap | null {
  return pending;
}

/** Called once the operator has noted the passwords. */
export function forgetInitialPasswords(): void {
  pending = null;
}
