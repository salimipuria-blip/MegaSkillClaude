import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

beforeEach(async () => {
  vi.resetModules();
  await import('./setup'); // fresh module graph: re-apply the fixture password provider
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('local session hardening (not a server authentication substitute)', () => {
  it('never restores owner privileges from a persisted bare user id', async () => {
    sessionStorage.setItem('cham.session', 'u-owner');
    const store = await import('../src/core/store');
    expect(store.currentUser()).toBeNull();
    expect(() => store.exportBackup()).toThrow(/نشست/);
    expect(sessionStorage.getItem('cham.session')).toBeNull();
  });

  it('storage edits cannot switch a logged-in cashier into another account', async () => {
    const store = await import('../src/core/store');
    expect(store.login('fx-cashier-1').ok).toBe(true);
    sessionStorage.setItem('cham.session', 'u-owner');
    expect(store.currentUser()?.role).toBe('cashier');
    expect(() => store.exportBackup()).toThrow(/مجوز/);
  });

  it('a page reload locks the session without resetting persisted business data', async () => {
    const before = await import('../src/core/store');
    expect(before.login('fx-owner-0').ok).toBe(true);
    const sales = before.getDB().sales.length;
    expect(sessionStorage.getItem('cham.session')).toBeNull();
    vi.resetModules();
    const after = await import('../src/core/store');
    expect(after.currentUser()).toBeNull();
    expect(after.getDB().sales.length).toBe(sales);
  });

  it('changing the current record role cannot grant permissions to the existing session', async () => {
    const store = await import('../src/core/store');
    store.login('fx-cashier-1');
    const cashier = store.getDB().users.find((u) => u.id === 'u-cashier-1')!;
    cashier.role = 'owner';
    expect(store.currentUser()).toBeNull();
    expect(() => store.exportBackup()).toThrow(/نشست/);
  });

  it('a legitimate password change keeps the verified local session usable', async () => {
    const store = await import('../src/core/store');
    store.login('fx-cashier-1');
    store.changeOwnPassword('fx-cashier-1', 'fixture-new-pass');
    expect(store.currentUser()?.role).toBe('cashier');
    expect(store.currentUser()?.mustChangePassword).toBe(false);
    store.logout();
    expect(store.login('fixture-new-pass').ok).toBe(true);
  });

  it('restoring a backup with different owner credentials requires reauthentication', async () => {
    const store = await import('../src/core/store');
    store.login('fx-owner-0');
    const backup = JSON.parse(store.exportBackup());
    const owner = backup.users.find((u: { role: string }) => u.role === 'owner');
    owner.passwordHash = 'changed-fixture-hash';
    store.importBackup(JSON.stringify(backup));
    expect(store.currentUser()).toBeNull();
    expect(store.getDB().sales.length).toBe(backup.sales.length);
    expect(() => store.exportBackup()).toThrow(/نشست/);
  });
});
