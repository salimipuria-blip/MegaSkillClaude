import { describe, expect, it } from 'vitest';
import * as store from '../src/core/store';
import { saleNet } from '../src/core/sales';
import { hashPassword, verifyPassword } from '../src/lib/crypto';

const { getDB } = store;

describe('store flows (in-memory storage fallback)', () => {
  it('identifies the user (and position) from the password alone', () => {
    const res = store.login('222222');
    expect(res.ok && res.user.role).toBe('deputy');
    store.logout();
    const c2 = store.login('333332');
    expect(c2.ok && c2.user.id).toBe('u-cashier-2');
    store.logout();
  });

  it('throttles globally after 5 wrong passwords', () => {
    for (let i = 0; i < 5; i++) expect(store.login('nope-' + i).ok).toBe(false);
    const locked = store.login('222222');
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error).toMatch(/صبر/);
    getDB().authGuard.lockedUntil = 0; // test-only reset of the throttle
  });

  it('cashier: forced password change, shift, checkout, change returned', () => {
    const id = 'u-cashier-1';
    const res = store.login('333331');
    expect(res.ok && res.mustChange).toBe(true);
    expect(() => store.changeOwnPassword('333331', '333331')).toThrow();
    // a password already used by another account is refused (password = identity)
    expect(() => store.changeOwnPassword('333331', '111111')).toThrow(/قابل استفاده نیست/);
    store.changeOwnPassword('333331', 'cash-9988');
    expect(store.currentUser()!.mustChangePassword).toBe(false);

    const p = getDB().products.find((x) => x.stock > 3)!;
    expect(() => store.checkout({ lines: [{ productId: p.id, qty: 1 }], discount: 0, pointsRedeem: 0, customerId: null, consultantId: null, payments: [{ method: 'cash', amount: p.price }] })).toThrow(/شیفت/);
    store.openShift(1_000_000);

    // discount over the 10% cashier limit is refused
    expect(() =>
      store.checkout({ lines: [{ productId: p.id, qty: 1 }], discount: p.price * 0.5, pointsRedeem: 0, customerId: null, consultantId: null, payments: [{ method: 'card', amount: p.price }] }),
    ).toThrow(/سقف تخفیف/);

    const before = p.stock;
    const sale = store.checkout({ lines: [{ productId: p.id, qty: 2 }], discount: 0, pointsRedeem: 0, customerId: 'c-1', consultantId: 'u-cons-1', payments: [{ method: 'cash', amount: p.price * 2 + 50_000 }] });
    expect(sale.payments[0].amount).toBe(p.price * 2);
    expect(getDB().products.find((x) => x.id === p.id)!.stock).toBe(before - 2);
    expect(sale.pointsEarned).toBeGreaterThan(0);

    // cashiers cannot refund
    expect(() => store.refundSale(sale.id, [{ productId: p.id, qty: 1 }], '')).toThrow(/مجوز/);

    const shift = store.openShiftOf(getDB(), id)!;
    expect(store.expectedCash(getDB(), shift)).toBe(1_000_000 + p.price * 2);
    store.closeShift(1_000_000 + p.price * 2, '');
    expect(getDB().shifts.find((s) => s.id === shift.id)!.closedAt).not.toBeNull();
    store.logout();
    expect(store.currentUser()).toBeNull();
  });

  it('manager: refunds restock and respect remaining quantity', () => {
    store.login('111111');
    const s = getDB().sales.find((x) => x.refunds.length === 0 && x.items[0].qty >= 1)!;
    const pid = s.items[0].productId;
    const stock = getDB().products.find((p) => p.id === pid)!.stock;
    store.refundSale(s.id, [{ productId: pid, qty: 1 }], 'test');
    const after = getDB().sales.find((x) => x.id === s.id)!;
    expect(saleNet(after)).toBeLessThan(after.total);
    expect(getDB().products.find((p) => p.id === pid)!.stock).toBe(stock + 1);
    expect(() => store.refundSale(s.id, [{ productId: pid, qty: s.items[0].qty }], '')).toThrow();
    // manager cannot touch the license or create an owner
    expect(() => store.renewLicense('yearly')).toThrow();
    expect(() => store.saveUser({ name: 'x', role: 'owner', active: true, monthlyTarget: 0, commissionPct: 0, password: 'abcdef' })).toThrow();
    expect(() => store.saveUser({ name: 'تکراری', role: 'cashier', active: true, monthlyTarget: 0, commissionPct: 0, password: 'cash-9988' })).toThrow();
    store.saveUser({ name: 'صندوقدار ۳', role: 'cashier', active: true, monthlyTarget: 0, commissionPct: 0, password: 'abcdef' });
    expect(getDB().users.some((u) => u.name === 'صندوقدار ۳' && u.mustChangePassword)).toBe(true);
    store.logout();
  });

  it('consultant: holds a cart for the cashier queue but cannot sell', () => {
    store.login('444442');
    const p = getDB().products[0];
    expect(() => store.checkout({ lines: [{ productId: p.id, qty: 1 }], discount: 0, pointsRedeem: 0, customerId: null, consultantId: null, payments: [] })).toThrow(/مجوز/);
    store.holdCart({ label: 'پرو ۲', customerId: null, items: [{ productId: p.id, qty: 1 }] });
    expect(getDB().heldCarts.length).toBe(1);
    store.logout();
  });

  it('owner: license renewal, backup round-trip and clean start', () => {
    store.login('fjcod1405');
    const exp = getDB().license.expiresAt;
    store.renewLicense('monthly');
    expect(getDB().license.expiresAt).toBeGreaterThan(exp);
    const json = store.exportBackup();
    expect(() => store.importBackup('{"bad":1}')).toThrow();
    store.startClean();
    expect(getDB().sales.length).toBe(0);
    store.importBackup(json);
    expect(getDB().sales.length).toBeGreaterThan(0);
    expect(store.currentUser()?.role).toBe('owner');
    expect(store.licenseState(getDB()).state).toBe('active');
  });

  it('migrates v1 data: shared default passwords become unique per account', () => {
    const v1 = JSON.parse(JSON.stringify(getDB()));
    v1.schema = 1;
    delete v1.authGuard;
    const c2 = v1.users.find((u: { id: string }) => u.id === 'u-cashier-2');
    c2.mustChangePassword = true;
    c2.salt = 'old';
    c2.passwordHash = hashPassword('333333', 'old'); // v1 shared cashier default
    const m = store.migrate(v1);
    const migrated = m.users.find((u) => u.id === 'u-cashier-2')!;
    expect(verifyPassword('333333', migrated.salt, migrated.passwordHash)).toBe(false);
    expect(verifyPassword('333332', migrated.salt, migrated.passwordHash)).toBe(true);
    expect(m.authGuard).toEqual({ fails: 0, lockedUntil: 0 });
    expect(m.schema).toBe(2);
  });
});
