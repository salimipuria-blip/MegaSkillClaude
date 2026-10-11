import type { Sale, SaleItem } from './types';

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  cost: number;
  qty: number;
}

export interface CartInput {
  lines: CartLine[];
  discount: number;
  pointsRedeem: number;
  pointValue: number;
  availablePoints: number;
  taxPct: number;
  tomanPerPoint: number;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  pointsRedeemed: number;
  pointsValue: number;
  tax: number;
  total: number;
  pointsEarned: number;
  itemCount: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const safe = (n: number) => (Number.isFinite(n) ? n : 0);

export function computeCart(c: CartInput): CartTotals {
  const subtotal = c.lines.reduce((s, l) => s + Math.round(safe(l.price)) * Math.max(0, Math.floor(safe(l.qty))), 0);
  const itemCount = c.lines.reduce((s, l) => s + Math.max(0, Math.floor(safe(l.qty))), 0);
  const discount = clamp(Math.round(safe(c.discount)), 0, subtotal);
  const afterDiscount = subtotal - discount;
  const maxPointsByValue = c.pointValue > 0 ? Math.floor(afterDiscount / c.pointValue) : 0;
  const pointsRedeemed = clamp(Math.floor(safe(c.pointsRedeem)), 0, Math.min(Math.max(0, c.availablePoints), maxPointsByValue));
  const pointsValue = pointsRedeemed * c.pointValue;
  const taxable = afterDiscount - pointsValue;
  const tax = Math.round((taxable * clamp(safe(c.taxPct), 0, 100)) / 100);
  const total = taxable + tax;
  const pointsEarned = c.tomanPerPoint > 0 ? Math.floor(taxable / c.tomanPerPoint) : 0;
  return { subtotal, discount, pointsRedeemed, pointsValue, tax, total, pointsEarned, itemCount };
}

export const refundedAmount = (s: Sale) => s.refunds.reduce((a, r) => a + r.amount, 0);

/** Net collected revenue for a sale after refunds */
export const saleNet = (s: Sale) => s.total - refundedAmount(s);

export function refundedQty(s: Sale, productId: string): number {
  return s.refunds.reduce((a, r) => a + r.items.filter((i) => i.productId === productId).reduce((b, i) => b + i.qty, 0), 0);
}

/** Price actually paid per unit of an item (discount, points and tax distributed proportionally) */
export function unitPaid(s: Sale, item: SaleItem): number {
  if (s.subtotal <= 0) return 0;
  return Math.round((item.price * s.total) / s.subtotal);
}

/** Gross profit after discounts/points and refunds (tax excluded) */
export function saleProfit(s: Sale): number {
  const cogs = s.items.reduce((a, i) => a + i.cost * i.qty, 0);
  const netBeforeTax = s.total - s.tax;
  const taxShare = s.total > 0 ? s.tax / s.total : 0;
  const refundEffect = s.refunds.reduce(
    (a, r) =>
      a +
      r.items.reduce((b, it) => {
        const item = s.items.find((x) => x.productId === it.productId);
        return b + it.amount * (1 - taxShare) - (item ? item.cost * it.qty : 0);
      }, 0),
    0,
  );
  return netBeforeTax - cogs - refundEffect;
}

export function paymentsBalance(total: number, payments: { amount: number }[]): number {
  return payments.reduce((a, p) => a + Math.round(safe(p.amount)), 0) - total;
}
