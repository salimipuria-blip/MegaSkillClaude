import { describe, expect, it } from 'vitest';
import { hashPassword, sha256Hex, verifyPassword } from '../src/lib/crypto';
import { computeCart, saleNet, unitPaid } from '../src/core/sales';
import { can, canManageRole, ROLES } from '../src/core/permissions';
import { aggregate, comparePeriod, growthPct, growthStreak, repeatRate, targetProgress, tierOf, winBackList } from '../src/core/growth';
import { addJMonths, parseNum, startOfJMonth, startOfWeek } from '../src/lib/format';
import { cleanStart, seedDemo } from '../src/core/seed';
import type { Sale } from '../src/core/types';

const sale = (at: number, total: number, customerId: string | null = null): Sale => ({
  id: `s${at}`, number: 1, at, cashierId: 'c', consultantId: null, customerId, shiftId: null,
  items: [{ productId: 'p', name: 'x', qty: 1, price: total, cost: total / 2 }],
  subtotal: total, discount: 0, pointsRedeemed: 0, pointsValue: 0, tax: 0, total, payments: [{ method: 'cash', amount: total }], pointsEarned: 0, refunds: [],
});

describe('crypto', () => {
  it('matches the SHA-256 test vector', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('verifies salted passwords', () => {
    const h = hashPassword('secret1', 'salt');
    expect(verifyPassword('secret1', 'salt', h)).toBe(true);
    expect(verifyPassword('secret2', 'salt', h)).toBe(false);
    expect(hashPassword('secret1', 'other')).not.toBe(h);
  });
});

describe('cart math', () => {
  const lines = [{ productId: 'a', name: 'a', price: 1_000_000, cost: 500_000, qty: 2 }];
  it('applies discount, points and tax in order', () => {
    const t = computeCart({ lines, discount: 200_000, pointsRedeem: 100, pointValue: 1000, availablePoints: 500, taxPct: 10, tomanPerPoint: 100_000 });
    expect(t.subtotal).toBe(2_000_000);
    expect(t.pointsValue).toBe(100_000);
    expect(t.tax).toBe(170_000);
    expect(t.total).toBe(1_870_000);
    expect(t.pointsEarned).toBe(17);
  });
  it('clamps invalid input', () => {
    const t = computeCart({ lines, discount: 9e9, pointsRedeem: 9999, pointValue: 1000, availablePoints: 50, taxPct: 0, tomanPerPoint: 100_000 });
    expect(t.discount).toBe(2_000_000);
    expect(t.total).toBe(0);
    const n = computeCart({ lines, discount: NaN, pointsRedeem: 999, pointValue: 1000, availablePoints: 50, taxPct: 0, tomanPerPoint: 100_000 });
    expect(n.pointsRedeemed).toBe(50);
  });
  it('net after refunds', () => {
    const s = sale(0, 1000);
    s.refunds.push({ id: 'r', at: 1, by: 'x', items: [{ productId: 'p', qty: 1, amount: 400 }], amount: 400, reason: '' });
    expect(saleNet(s)).toBe(600);
    expect(unitPaid(s, s.items[0])).toBe(1000);
  });
});

describe('permissions', () => {
  it('owner has everything; consultant cannot use the register', () => {
    expect(ROLES.owner.permissions.length).toBeGreaterThan(15);
    expect(can('consultant', 'pos.use')).toBe(false);
    expect(can('consultant', 'pos.hold')).toBe(true);
    expect(can('cashier', 'sales.refund')).toBe(false);
    expect(can('manager', 'system.license')).toBe(false);
  });
  it('rank rules for staff management', () => {
    expect(canManageRole('manager', 'deputy')).toBe(true);
    expect(canManageRole('manager', 'manager')).toBe(false);
    expect(canManageRole('manager', 'owner')).toBe(false);
    expect(canManageRole('deputy', 'cashier')).toBe(false);
    expect(canManageRole('owner', 'owner')).toBe(true);
  });
});

describe('growth engine', () => {
  const now = new Date(2026, 9, 2, 15, 0).getTime();
  it('growthPct edge cases', () => {
    expect(growthPct(110, 100)).toBeCloseTo(10);
    expect(growthPct(0, 0)).toBe(0);
    expect(growthPct(50, 0)).toBe(100);
  });
  it('weeks start on Saturday', () => {
    expect(new Date(startOfWeek(now)).getDay()).toBe(6);
  });
  it('Jalali month starts on day 1', () => {
    const s = startOfJMonth(now);
    expect(new Intl.DateTimeFormat('en-u-ca-persian', { day: 'numeric' }).format(s)).toBe('1');
    expect(addJMonths(s, -1)).toBeLessThan(s);
  });
  it('streak counts consecutive growing completed weeks', () => {
    const w = startOfWeek(now);
    const day = 86_400_000;
    const sales = [sale(w - 28 * day + 1000, 100), sale(w - 21 * day + 1000, 200), sale(w - 14 * day + 1000, 300), sale(w - 7 * day + 1000, 400)];
    expect(growthStreak(sales, now)).toBe(4); // 0→100 counts as growth too
    sales.push(sale(w - 7 * day + 2000, -350)); // last week drops below previous
    expect(growthStreak(sales, now)).toBe(0);
  });
  it('fair period-to-date comparison', () => {
    const c = comparePeriod([sale(now - 86_400_000, 100), sale(now - 3600_000, 150)], now, 'day');
    expect(c.current.revenue).toBe(150);
    expect(c.previous.revenue).toBe(100);
    expect(c.revenueGrowth).toBeCloseTo(50);
  });
  it('repeat rate and win-back', () => {
    const d = 86_400_000;
    const sales = [sale(now - 60 * d, 10, 'a'), sale(now - 5 * d, 10, 'a'), sale(now - 40 * d, 10, 'b')];
    expect(repeatRate(sales, now - 90 * d, now)).toBe(50);
    const customers = ['a', 'b'].map((id) => ({ id, name: id, phone: '', note: '', points: 0, createdAt: 0, lastContactAt: 0 }));
    const wb = winBackList(customers, sales, now, 30);
    expect(wb.map((w) => w.customer.id)).toEqual(['b']);
  });
  it('tiers', () => {
    expect(tierOf(0).id).toBe('bronze');
    expect(tierOf(30_000_000).id).toBe('gold');
    expect(tierOf(1e9).id).toBe('diamond');
  });
  it('target projection', () => {
    const t = targetProgress([sale(now - 1000, 1000)], now, 10_000);
    expect(t.pct).toBeCloseTo(10);
    expect(t.projected).toBeGreaterThan(1000);
  });
});

describe('seed', () => {
  const now = Date.now();
  const db = seedDemo(now);
  it('creates every position with a working default password', () => {
    for (const r of ['owner', 'manager', 'deputy', 'cashier', 'consultant'] as const) expect(db.users.some((u) => u.role === r)).toBe(true);
    const owner = db.users.find((u) => u.role === 'owner')!;
    expect(owner.name).toBe('FJCOD');
    expect(verifyPassword('fjcod1405', owner.salt, owner.passwordHash)).toBe(true);
  });
  it('produces consistent sales and a growing trend', () => {
    expect(db.sales.length).toBeGreaterThan(500);
    for (const s of db.sales) expect(s.total).toBe(s.subtotal - s.discount);
    const recent = aggregate(db.sales, now - 30 * 86_400_000, now + 1).revenue;
    const older = aggregate(db.sales, now - 120 * 86_400_000, now - 90 * 86_400_000).revenue;
    expect(recent).toBeGreaterThan(older);
  });
  it('is deterministic', () => {
    expect(seedDemo(now).sales.length).toBe(db.sales.length);
  });
  it('clean start keeps users and wipes history', () => {
    const c = cleanStart(db, now);
    expect(c.users.length).toBe(db.users.length);
    expect(c.sales.length + c.products.length + c.customers.length).toBe(0);
  });
});

describe('number parsing', () => {
  it('accepts Persian and Arabic digits and separators', () => {
    expect(parseNum('۱۲٬۳۴۵')).toBe(12345);
    expect(parseNum('٣٫٥')).toBe(3.5);
    expect(parseNum('1,200,000')).toBe(1200000);
    expect(Number.isNaN(parseNum(''))).toBe(true);
  });
});
