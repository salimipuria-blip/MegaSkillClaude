/*
 * Growth engine — "رشد و تکرار رشد".
 * Pure functions: every number on the dashboards and growth page comes from here.
 */
import type { Customer, DB, Product, Sale, User } from './types';
import { saleNet, saleProfit } from './sales';
import { addDays, addJMonths, fa, jMonthLength, startOfDay, startOfJMonth, startOfWeek } from '../lib/format';

export type Period = 'day' | 'week' | 'month';

export function periodStart(ts: number, p: Period): number {
  if (p === 'day') return startOfDay(ts);
  if (p === 'week') return startOfWeek(ts);
  return startOfJMonth(ts);
}

export function previousPeriodStart(start: number, p: Period): number {
  if (p === 'day') return addDays(start, -1);
  if (p === 'week') return addDays(start, -7);
  return addJMonths(start, -1);
}

export const inRange = (s: Sale, from: number, to: number) => s.at >= from && s.at < to;

export interface Agg {
  revenue: number;
  profit: number;
  count: number;
  items: number;
  avgBasket: number;
}

export function aggregate(sales: Sale[], from = -Infinity, to = Infinity): Agg {
  let revenue = 0, profit = 0, count = 0, items = 0;
  for (const s of sales) {
    if (!inRange(s, from, to)) continue;
    revenue += saleNet(s);
    profit += saleProfit(s);
    count += 1;
    items += s.items.reduce((a, i) => a + i.qty, 0);
  }
  return { revenue, profit, count, items, avgBasket: count ? revenue / count : 0 };
}

export function growthPct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export interface Comparison {
  current: Agg;
  previous: Agg;
  revenueGrowth: number;
  countGrowth: number;
  basketGrowth: number;
}

/** Period-to-date vs the same elapsed span of the previous period (fair comparison). */
export function comparePeriod(sales: Sale[], now: number, p: Period): Comparison {
  const start = periodStart(now, p);
  const prevStart = previousPeriodStart(start, p);
  const elapsed = now - start;
  const prevEnd = Math.min(prevStart + elapsed, start);
  const current = aggregate(sales, start, now + 1);
  const previous = aggregate(sales, prevStart, prevEnd + 1);
  return {
    current,
    previous,
    revenueGrowth: growthPct(current.revenue, previous.revenue),
    countGrowth: growthPct(current.count, previous.count),
    basketGrowth: growthPct(current.avgBasket, previous.avgBasket),
  };
}

export interface DayPoint {
  day: number;
  revenue: number;
  count: number;
}

export function dailySeries(sales: Sale[], now: number, days: number): DayPoint[] {
  const end = startOfDay(now);
  const points: DayPoint[] = [];
  const index = new Map<number, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(end, -i);
    const pt = { day, revenue: 0, count: 0 };
    points.push(pt);
    index.set(day, pt);
  }
  const from = points[0]?.day ?? end;
  for (const s of sales) {
    if (s.at < from) continue;
    const pt = index.get(startOfDay(s.at));
    if (pt) {
      pt.revenue += saleNet(s);
      pt.count += 1;
    }
  }
  return points;
}

export function weeklySeries(sales: Sale[], now: number, weeks: number): DayPoint[] {
  const cur = startOfWeek(now);
  const out: DayPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(cur, -7 * i);
    const a = aggregate(sales, from, addDays(from, 7));
    out.push({ day: from, revenue: a.revenue, count: a.count });
  }
  return out;
}

/**
 * Growth streak: number of consecutive *completed* weeks where revenue beat the
 * week before. This is the core "repeat the growth" lever shown to the team.
 */
export function growthStreak(sales: Sale[], now: number, maxWeeks = 52): number {
  const series = weeklySeries(sales, now, maxWeeks + 2).slice(0, -1); // drop current, incomplete week
  let streak = 0;
  for (let i = series.length - 1; i > 0; i--) {
    if (series[i].revenue > series[i - 1].revenue && series[i].revenue > 0) streak++;
    else break;
  }
  return streak;
}

export interface CustomerStat {
  count: number;
  spend: number;
  firstAt: number;
  lastAt: number;
}

export function customerStats(sales: Sale[]): Map<string, CustomerStat> {
  const m = new Map<string, CustomerStat>();
  for (const s of sales) {
    if (!s.customerId) continue;
    const st = m.get(s.customerId) ?? { count: 0, spend: 0, firstAt: s.at, lastAt: s.at };
    st.count += 1;
    st.spend += saleNet(s);
    st.firstAt = Math.min(st.firstAt, s.at);
    st.lastAt = Math.max(st.lastAt, s.at);
    m.set(s.customerId, st);
  }
  return m;
}

/** Share of customers active in [from,to) who have purchased at least twice (lifetime up to `to`). */
export function repeatRate(sales: Sale[], from: number, to: number): number {
  const active = new Set<string>();
  const counts = new Map<string, number>();
  for (const s of sales) {
    if (!s.customerId || s.at >= to) continue;
    counts.set(s.customerId, (counts.get(s.customerId) ?? 0) + 1);
    if (s.at >= from) active.add(s.customerId);
  }
  if (active.size === 0) return 0;
  let repeat = 0;
  for (const id of active) if ((counts.get(id) ?? 0) >= 2) repeat++;
  return (repeat / active.size) * 100;
}

export interface Tier {
  id: 'bronze' | 'silver' | 'gold' | 'diamond';
  title: string;
  min: number;
}

export const TIERS: Tier[] = [
  { id: 'diamond', title: 'الماس', min: 80_000_000 },
  { id: 'gold', title: 'طلایی', min: 30_000_000 },
  { id: 'silver', title: 'نقره‌ای', min: 10_000_000 },
  { id: 'bronze', title: 'برنزی', min: 0 },
];

export function tierOf(spend: number): Tier {
  return TIERS.find((t) => spend >= t.min) ?? TIERS[TIERS.length - 1];
}

export function nextTier(spend: number): { tier: Tier; remaining: number } | null {
  const ordered = [...TIERS].reverse();
  const next = ordered.find((t) => t.min > spend);
  return next ? { tier: next, remaining: next.min - spend } : null;
}

export interface WinBack {
  customer: Customer;
  stat: CustomerStat;
  daysAway: number;
}

/** Customers who bought before but have not returned for `days` — ranked by lifetime value. */
export function winBackList(customers: Customer[], sales: Sale[], now: number, days: number): WinBack[] {
  const stats = customerStats(sales);
  const out: WinBack[] = [];
  for (const c of customers) {
    const st = stats.get(c.id);
    if (!st) continue;
    const daysAway = Math.floor((now - st.lastAt) / 86_400_000);
    const contactedRecently = c.lastContactAt > st.lastAt && now - c.lastContactAt < 7 * 86_400_000;
    if (daysAway >= days && !contactedRecently) out.push({ customer: c, stat: st, daysAway });
  }
  return out.sort((a, b) => b.stat.spend - a.stat.spend);
}

export interface TargetProgress {
  achieved: number;
  target: number;
  pct: number;
  projected: number;
  projectedPct: number;
  dailyNeeded: number;
  daysLeft: number;
}

export function targetProgress(sales: Sale[], now: number, target: number, filter?: (s: Sale) => boolean): TargetProgress {
  const start = startOfJMonth(now);
  const len = jMonthLength(now);
  const relevant = filter ? sales.filter(filter) : sales;
  const achieved = aggregate(relevant, start, now + 1).revenue;
  const elapsedDays = Math.max(1, (now - start) / 86_400_000);
  const projected = (achieved / elapsedDays) * len;
  const daysLeft = Math.max(0, Math.ceil(len - elapsedDays));
  return {
    achieved,
    target,
    pct: target > 0 ? (achieved / target) * 100 : 0,
    projected,
    projectedPct: target > 0 ? (projected / target) * 100 : 0,
    dailyNeeded: daysLeft > 0 ? Math.max(0, (target - achieved) / daysLeft) : 0,
    daysLeft,
  };
}

export const sellerOf = (s: Sale) => s.consultantId ?? s.cashierId;

export interface LeaderRow {
  user: User;
  revenue: number;
  count: number;
  commission: number;
  target: number;
  pct: number;
}

export function leaderboard(sales: Sale[], users: User[], from: number, to: number): LeaderRow[] {
  const by = new Map<string, { revenue: number; count: number }>();
  for (const s of sales) {
    if (!inRange(s, from, to)) continue;
    const id = sellerOf(s);
    const r = by.get(id) ?? { revenue: 0, count: 0 };
    r.revenue += saleNet(s);
    r.count += 1;
    by.set(id, r);
  }
  return users
    .filter((u) => u.active && (u.role === 'consultant' || by.has(u.id)))
    .map((u) => {
      const r = by.get(u.id) ?? { revenue: 0, count: 0 };
      return {
        user: u,
        revenue: r.revenue,
        count: r.count,
        commission: (r.revenue * u.commissionPct) / 100,
        target: u.monthlyTarget,
        pct: u.monthlyTarget > 0 ? (r.revenue / u.monthlyTarget) * 100 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export interface ProductRank {
  product: Product | undefined;
  productId: string;
  name: string;
  qty: number;
  revenue: number;
}

export function topProducts(sales: Sale[], products: Product[], from: number, to: number, n = 5): ProductRank[] {
  const m = new Map<string, ProductRank>();
  for (const s of sales) {
    if (!inRange(s, from, to)) continue;
    const ratio = s.subtotal > 0 ? s.total / s.subtotal : 0;
    for (const it of s.items) {
      const r = m.get(it.productId) ?? { product: products.find((p) => p.id === it.productId), productId: it.productId, name: it.name, qty: 0, revenue: 0 };
      r.qty += it.qty;
      r.revenue += it.price * it.qty * ratio;
      m.set(it.productId, r);
    }
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, n);
}

export interface Insight {
  tone: 'good' | 'warn' | 'info';
  title: string;
  action: string;
}

/** Rule-based "next best actions" that close the growth loop. */
export function insights(db: DB, now: number): Insight[] {
  const out: Insight[] = [];
  const week = comparePeriod(db.sales, now, 'week');
  const month = comparePeriod(db.sales, now, 'month');
  const streak = growthStreak(db.sales, now);
  const target = targetProgress(db.sales, now, db.settings.monthlyStoreTarget);
  const wb = winBackList(db.customers, db.sales, now, db.settings.winBackDays);
  const low = db.products.filter((p) => p.active && p.stock <= p.minStock);
  const top = topProducts(db.sales, db.products, addDays(now, -30), now + 1, 10);
  const lowTop = top.filter((t) => t.product && t.product.stock <= t.product.minStock);

  if (streak >= 2) out.push({ tone: 'good', title: `${fa(streak)} هفتهٔ پیاپی رشد`, action: 'زنجیره را حفظ کنید: هدف این هفته را از هفتهٔ قبل بالاتر بگذارید.' });
  if (week.revenueGrowth < 0)
    out.push({ tone: 'warn', title: 'فروش این هفته از هفتهٔ قبل عقب است', action: 'با مشتریان فهرست بازگشت تماس بگیرید و سبدهای پیشنهادی بسازید.' });
  else if (week.current.revenue > 0) out.push({ tone: 'good', title: 'این هفته جلوتر از هفتهٔ قبل هستید', action: 'روی محصولات پرفروش تمرکز کنید تا فاصله بیشتر شود.' });
  if (db.settings.monthlyStoreTarget > 0) {
    if (target.projectedPct < 100)
      out.push({ tone: 'warn', title: 'پیش‌بینی ماه زیر هدف است', action: `برای رسیدن به هدف، روزانه ${fa(target.dailyNeeded)} تومان فروش لازم است.` });
    else out.push({ tone: 'good', title: 'در مسیر عبور از هدف ماه', action: 'هدف ماه بعد را ۱۰٪ بالاتر تعریف کنید — رشد را تکرار کنید.' });
  }
  if (wb.length > 0) out.push({ tone: 'info', title: `${fa(wb.length)} مشتری منتظر دعوت به بازگشت`, action: 'از صفحهٔ «موتور رشد» با مشتریان ارزشمند تماس بگیرید.' });
  if (lowTop.length > 0) out.push({ tone: 'warn', title: `موجودی ${fa(lowTop.length)} کالای پرفروش رو به اتمام است`, action: `سفارش مجدد: ${lowTop.map((t) => t.name).slice(0, 3).join('، ')}` });
  else if (low.length > 0) out.push({ tone: 'info', title: `${fa(low.length)} کالا زیر حداقل موجودی`, action: 'فهرست کالاهای کم‌موجود را در انبار بررسی کنید.' });
  if (month.basketGrowth < -5) out.push({ tone: 'warn', title: 'میانگین سبد خرید کاهش یافته', action: 'پیشنهاد کالای مکمل (Cross-sell) را در صندوق فعال کنید.' });
  return out.slice(0, 6);
}
