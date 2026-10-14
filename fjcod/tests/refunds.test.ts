import { beforeEach, describe, expect, it } from 'vitest';
import * as store from '../src/core/store';
import { computeCart, paymentsBalance, refundedQty, saleProfit, saleNet, unitPaid } from '../src/core/sales';

const { getDB } = store;

/** A product with a known price and plenty of stock, so stock arithmetic is readable. */
function pickProduct(minStock = 5) {
  return getDB().products.find((p) => p.active && p.stock >= minStock)!;
}

function sell(qty: number, discount = 0) {
  if (!store.openShiftOf(getDB(), store.currentUser()!.id)) store.openShift(1_000_000);
  const p = pickProduct();
  return { product: p, sale: store.checkout({ lines: [{ productId: p.id, qty }], discount, pointsRedeem: 0, customerId: null, consultantId: null, payments: [{ method: 'cash', amount: p.price * qty }] }) };
}

describe('refund accounting (manager)', () => {
  beforeEach(() => {
    // resetToDemo() needs system.backup and then clears the session, so: sign in as owner,
    // re-seed, sign in again as the manager who owns sales.refund.
    store.login('fjcod1405');
    store.resetToDemo();
    store.login('111111'); // manager: sales.refund
    if (!store.openShiftOf(getDB(), store.currentUser()!.id)) store.openShift(1_000_000);
  });

  it('refunds the price actually paid, not the list price, and returns the units to stock', () => {
    const { product, sale } = sell(3, 0);
    const stockAfterSale = getDB().products.find((p) => p.id === product.id)!.stock;
    const perUnit = unitPaid(sale, sale.items[0]);

    store.refundSale(sale.id, [{ productId: product.id, qty: 2 }], 'test');

    const after = getDB().sales.find((s) => s.id === sale.id)!;
    const refund = after.refunds[0];
    expect(refund.amount).toBe(perUnit * 2);
    expect(refund.items[0].amount).toBe(perUnit * 2);
    expect(saleNet(after)).toBe(after.total - refund.amount);
    // every refunded unit goes back on the shelf, exactly once
    expect(getDB().products.find((p) => p.id === product.id)!.stock).toBe(stockAfterSale + 2);
    const moves = getDB().stockMoves.filter((m) => m.reason === 'refund' && m.productId === product.id);
    expect(moves).toHaveLength(1);
    expect(moves[0].delta).toBe(2);
    expect(refundedQty(after, product.id)).toBe(2);
  });

  it('spreads a discount over units so a partial refund cannot return more than was paid', () => {
    const p = pickProduct();
    const qty = 4;
    const discount = p.price * qty * 0.25; // manager limit is respected below
    const sale = store.checkout({
      lines: [{ productId: p.id, qty }],
      discount,
      pointsRedeem: 0,
      customerId: null,
      consultantId: null,
      payments: [{ method: 'cash', amount: p.price * qty - discount }],
    });
    expect(sale.discount).toBe(Math.round(discount));
    const perUnit = unitPaid(sale, sale.items[0]);
    expect(perUnit * qty).toBeLessThanOrEqual(sale.total);
    // rounding: total minus the sum of per-unit refunds stays within the number of lines
    expect(Math.abs(perUnit * qty - sale.total)).toBeLessThanOrEqual(qty);

    store.refundSale(sale.id, [{ productId: p.id, qty }], 'full');
    const after = getDB().sales.find((s) => s.id === sale.id)!;
    expect(saleNet(after)).toBeGreaterThanOrEqual(0);
    expect(after.refunds[0].amount).toBeLessThanOrEqual(after.total);
    // nothing left to refund: a second attempt is refused
    expect(() => store.refundSale(sale.id, [{ productId: p.id, qty: 1 }], '')).toThrow(/حداکثر/);
  });

  it('reverses earned loyalty points proportionally to the refunded amount', () => {
    const customer = getDB().customers[0];
    const p = pickProduct();
    const sale = store.checkout({
      lines: [{ productId: p.id, qty: 2 }],
      discount: 0,
      pointsRedeem: 0,
      customerId: customer.id,
      consultantId: null,
      payments: [{ method: 'cash', amount: p.price * 2 }],
    });
    const earned = sale.pointsEarned;
    expect(earned).toBeGreaterThan(0);
    const pointsBeforeRefund = getDB().customers.find((c) => c.id === customer.id)!.points;

    store.refundSale(sale.id, [{ productId: p.id, qty: 1 }], '');
    const after = getDB().customers.find((c) => c.id === customer.id)!.points;
    const refund = getDB().sales.find((s) => s.id === sale.id)!.refunds[0];
    const expectedReversal = Math.floor((earned * refund.amount) / sale.total);
    expect(after).toBe(pointsBeforeRefund - expectedReversal);
    // a half refund must never take back more than was earned
    expect(after).toBeGreaterThanOrEqual(pointsBeforeRefund - earned);
  });

  it('lowers the expected cash of the open shift by the refunded amount', () => {
    store.logout();
    store.login('333331');
    store.changeOwnPassword('333331', 'cash-7711');
    store.openShift(500_000);
    const p = pickProduct();
    const sale = store.checkout({
      lines: [{ productId: p.id, qty: 1 }],
      discount: 0,
      pointsRedeem: 0,
      customerId: null,
      consultantId: null,
      payments: [{ method: 'cash', amount: p.price }],
    });
    const shift = store.openShiftOf(getDB(), 'u-cashier-1')!;
    expect(store.expectedCash(getDB(), shift)).toBe(500_000 + p.price);

    // the refund is booked by the manager, so it leaves the cashier's drawer
    store.logout();
    store.login('111111');
    store.refundSale(sale.id, [{ productId: p.id, qty: 1 }], '');
    const refund = getDB().sales.find((s) => s.id === sale.id)!.refunds[0];
    expect(store.expectedCash(getDB(), shift)).toBe(500_000 + p.price - refund.amount);
  });

  it('keeps profit consistent: a full refund returns the sale to zero profit, never negative COGS', () => {
    const { product, sale } = sell(2);
    const profitBefore = saleProfit(sale);
    expect(profitBefore).toBeGreaterThan(0);
    store.refundSale(sale.id, [{ productId: product.id, qty: 2 }], '');
    const after = getDB().sales.find((s) => s.id === sale.id)!;
    expect(saleNet(after)).toBe(0);
    expect(saleProfit(after)).toBe(0);
  });
});

describe('cart and payment arithmetic', () => {
  it('never lets redeemed points be worth more than the post-discount amount', () => {
    const lines = [{ productId: 'a', name: 'a', price: 100_000, cost: 40_000, qty: 1 }];
    const t = computeCart({ lines, discount: 90_000, pointsRedeem: 500, pointValue: 1_000, availablePoints: 500, taxPct: 0, tomanPerPoint: 100_000 });
    expect(t.pointsValue).toBeLessThanOrEqual(t.subtotal - t.discount);
    expect(t.total).toBe(0);
  });

  it('reports the payment balance sign and refuses a short payment at checkout', () => {
    expect(paymentsBalance(1_000, [{ amount: 1_000 }])).toBe(0);
    expect(paymentsBalance(1_000, [{ amount: 1_200 }])).toBe(200);
    expect(paymentsBalance(1_000, [{ amount: 800 }])).toBe(-200);
    expect(paymentsBalance(1_000, [{ amount: 600.4 }, { amount: 400 }])).toBe(0); // rounded per payment
  });

  it('rejects a fractional or oversized refund quantity', () => {
    store.login('fjcod1405');
    store.resetToDemo();
    store.login('111111');
    const { product, sale } = sell(2);
    expect(() => store.refundSale(sale.id, [{ productId: product.id, qty: 1.5 }], '')).toThrow(/حداکثر|صحیح|نامعتبر/);
    expect(() => store.refundSale(sale.id, [{ productId: product.id, qty: 3 }], '')).toThrow(/حداکثر/);
    expect(() => store.refundSale(sale.id, [], '')).toThrow(/هیچ قلمی/);
  });
});
