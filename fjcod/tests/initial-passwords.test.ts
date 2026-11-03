import { describe, expect, it } from 'vitest';
import { forgetInitialPasswords, issueInitialPasswords, peekInitialPasswords, randomPasswords } from '../src/core/initial-passwords';
import { SEED_USER_IDS } from '../src/core/seed';

// Every text file that could leak a password: source, scripts, docs, tests and the folder's guides.
const TEXTS = import.meta.glob(
  ['../src/**/*.{ts,tsx,css}', '../scripts/**/*.mjs', '../docs/**/*.md', './**/*.ts', '../*.md', '../index.html'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

describe('first-login passwords', () => {
  it('random passwords are 8 digits and unique per account', () => {
    for (let round = 0; round < 50; round++) {
      const map = randomPasswords([...SEED_USER_IDS]);
      const values = Object.values(map);
      expect(values).toHaveLength(SEED_USER_IDS.length);
      for (const v of values) expect(v).toMatch(/^\d{8}$/);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('issued passwords are readable until forgotten, then gone', () => {
    forgetInitialPasswords();
    const map = issueInitialPasswords(['u-owner']);
    expect(peekInitialPasswords()).toMatchObject(map);
    forgetInitialPasswords();
    expect(peekInitialPasswords()).toBeNull();
  });

  // Regression: the old shared seed passwords were committed in source and README (2026-10-18 fix).
  it('no former seed password is written anywhere in source, scripts or docs', () => {
    const banned = ['fjcod' + '1405', ...[1, 2].map((d) => String(d).repeat(6)), ...[1, 2].map((d) => '33333' + d), ...[1, 2, 3].map((d) => '44444' + d)];
    expect(Object.keys(TEXTS).length).toBeGreaterThan(30);
    expect(Object.keys(TEXTS)).toContain('../README.md');
    const hits = Object.entries(TEXTS).flatMap(([path, text]) => banned.filter((b) => text.includes(b)).map((b) => `${path}: ${b}`));
    expect(hits).toEqual([]);
  });
});

describe('leaked default rotation (migrate)', () => {
  it('rotates accounts still on a once-public default and leaves changed ones alone', async () => {
    const store = await import('../src/core/store');
    const { hashPassword, verifyPassword } = await import('../src/lib/crypto');
    const v2 = JSON.parse(JSON.stringify(store.getDB()));
    const leaked = 'fjcod' + '1405';
    const owner = v2.users.find((u: { id: string }) => u.id === 'u-owner');
    owner.salt = 'u-owner-salt';
    owner.passwordHash = hashPassword(leaked, owner.salt);
    owner.mustChangePassword = false;
    const manager = v2.users.find((u: { id: string }) => u.id === 'u-manager');
    manager.salt = 'u-manager-salt';
    manager.passwordHash = hashPassword('a-private-choice', manager.salt);
    forgetInitialPasswords();

    const m = store.migrate(v2);
    const o = m.users.find((u) => u.id === 'u-owner')!;
    expect(verifyPassword(leaked, o.salt, o.passwordHash)).toBe(false);
    expect(verifyPassword('fx-owner-0', o.salt, o.passwordHash)).toBe(true);
    expect(o.mustChangePassword).toBe(true);
    expect(peekInitialPasswords()).toEqual({ 'u-owner': 'fx-owner-0' });
    expect(m.audit.at(-1)?.action).toBe('auth.rotate-defaults');
    expect(m.users.find((u) => u.id === 'u-manager')).toEqual(manager);
    // idempotent: the rotated account has a random salt and never matches again
    forgetInitialPasswords();
    store.migrate(m);
    expect(peekInitialPasswords()).toBeNull();
  });
});
