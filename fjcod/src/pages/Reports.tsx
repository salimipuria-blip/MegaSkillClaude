import { useMemo, useState } from 'react';
import { Download, FileBarChart, Percent, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import { useStore } from '../core/store';
import { aggregate, inRange, sellerOf, topProducts } from '../core/growth';
import { saleNet, saleProfit } from '../core/sales';
import { addDays, addJMonths, fa, jDateShort, startOfDay, startOfJMonth, startOfWeek, tomanShort } from '../lib/format';
import { Kpi } from '../components/ui';
import { METHOD_LABEL } from '../lib/format';
import type { PaymentMethod } from '../core/types';

type Range = 'today' | 'week' | 'month' | 'lastMonth' | '90';
const RANGES: { id: Range; title: string }[] = [
  { id: 'today', title: 'امروز' },
  { id: 'week', title: 'این هفته' },
  { id: 'month', title: 'این ماه' },
  { id: 'lastMonth', title: 'ماه قبل' },
  { id: '90', title: '۹۰ روز' },
];

function bounds(r: Range, now: number): [number, number] {
  switch (r) {
    case 'today': return [startOfDay(now), now + 1];
    case 'week': return [startOfWeek(now), now + 1];
    case 'month': return [startOfJMonth(now), now + 1];
    case 'lastMonth': { const s = startOfJMonth(now); return [addJMonths(s, -1), s]; }
    default: return [addDays(startOfDay(now), -89), now + 1];
  }
}

export function Reports() {
  const { db } = useStore();
  const [range, setRange] = useState<Range>('month');
  const now = Date.now();
  const [from, to] = bounds(range, now);

  const r = useMemo(() => {
    const sales = db.sales.filter((s) => inRange(s, from, to));
    const agg = aggregate(sales);
    const discounts = sales.reduce((a, s) => a + s.discount + s.pointsValue, 0);
    const refunds = sales.reduce((a, s) => a + s.refunds.reduce((b, x) => b + x.amount, 0), 0);
    const byCat = new Map<string, number>();
    for (const s of sales) {
      const ratio = s.subtotal ? saleNet(s) / s.subtotal : 0;
      for (const i of s.items) {
        const cat = db.products.find((p) => p.id === i.productId)?.category ?? 'سایر';
        byCat.set(cat, (byCat.get(cat) ?? 0) + i.price * i.qty * ratio);
      }
    }
    const byMethod = new Map<string, number>();
    for (const s of sales) for (const p of s.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
    const bySeller = new Map<string, { revenue: number; count: number; profit: number }>();
    for (const s of sales) {
      const id = sellerOf(s);
      const x = bySeller.get(id) ?? { revenue: 0, count: 0, profit: 0 };
      x.revenue += saleNet(s); x.count++; x.profit += saleProfit(s);
      bySeller.set(id, x);
    }
    return { sales, agg, discounts, refunds, byCat: [...byCat].sort((a, b) => b[1] - a[1]), byMethod: [...byMethod].sort((a, b) => b[1] - a[1]), bySeller: [...bySeller].sort((a, b) => b[1].revenue - a[1].revenue), top: topProducts(sales, db.products, from, to, 10) };
  }, [db, from, to]);

  const exportCsv = () => {
    const head = ['شماره', 'تاریخ', 'مشتری', 'صندوقدار', 'مشاور', 'جمع', 'تخفیف', 'امتیاز', 'مالیات', 'مبلغ', 'مرجوعی', 'خالص', 'روش پرداخت'];
    const name = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? '';
    const rows = r.sales.map((s) => [
      s.number, jDateShort(s.at), db.customers.find((c) => c.id === s.customerId)?.name ?? '', name(s.cashierId), name(s.consultantId),
      s.subtotal, s.discount, s.pointsValue, s.tax, s.total, s.total - saleNet(s), saleNet(s), s.payments.map((p) => METHOD_LABEL[p.method]).join('+'),
    ]);
    const csv = '﻿' + [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cham-sales-${range}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const share = (v: number, total: number) => (total ? (v / total) * 100 : 0);
  const totalCat = r.byCat.reduce((a, [, v]) => a + v, 0);
  const totalPay = r.byMethod.reduce((a, [, v]) => a + v, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <p>{jDateShort(from)} تا {jDateShort(Math.min(to, now))}</p>
        </div>
        <button className="btn" onClick={exportCsv} disabled={!r.sales.length}><Download size={16} /> خروجی اکسل (CSV)</button>
      </div>
      <div className="chips">
        {RANGES.map((x) => <button key={x.id} className="chip" aria-pressed={range === x.id} onClick={() => setRange(x.id)}>{x.title}</button>)}
      </div>
      <div className="grid grid-4">
        <Kpi icon={<Wallet size={16} />} label="فروش خالص" value={tomanShort(r.agg.revenue)} unit="تومان" foot={`مرجوعی: ${tomanShort(r.refunds)}`} />
        <Kpi icon={<FileBarChart size={16} />} label="سود ناخالص" value={tomanShort(r.agg.profit)} unit="تومان" foot={`حاشیه: ${fa(r.agg.revenue ? (r.agg.profit / r.agg.revenue) * 100 : 0)}٪`} />
        <Kpi icon={<Receipt size={16} />} label="تعداد فاکتور" value={fa(r.agg.count)} foot={`${fa(r.agg.items)} قلم کالا`} />
        <Kpi icon={<ShoppingCart size={16} />} label="میانگین سبد" value={tomanShort(r.agg.avgBasket)} unit="تومان" />
        <Kpi icon={<Percent size={16} />} label="تخفیف و امتیاز اعطایی" value={tomanShort(r.discounts)} unit="تومان" foot={`${fa(share(r.discounts, r.agg.revenue + r.discounts))}٪ از فروش ناخالص`} />
      </div>
      <div className="grid grid-2">
        <Breakdown title="فروش به تفکیک دسته" rows={r.byCat.map(([k, v]) => ({ k, v, p: share(v, totalCat) }))} />
        <Breakdown title="روش‌های پرداخت" rows={r.byMethod.map(([k, v]) => ({ k: METHOD_LABEL[k as PaymentMethod] ?? k, v, p: share(v, totalPay) }))} />
        <section className="card table-wrap">
          <div className="card-head"><h3>عملکرد فروشندگان</h3></div>
          <table className="table">
            <thead><tr><th>فروشنده</th><th className="num">فاکتور</th><th className="num">فروش</th><th className="num">سود</th></tr></thead>
            <tbody>
              {r.bySeller.map(([id, x]) => (
                <tr key={id}><td>{db.users.find((u) => u.id === id)?.name ?? '—'}</td><td className="num">{fa(x.count)}</td><td className="num">{fa(x.revenue)}</td><td className="num">{fa(x.profit)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card table-wrap">
          <div className="card-head"><h3>۱۰ کالای برتر</h3></div>
          <table className="table">
            <thead><tr><th>کالا</th><th className="num">تعداد</th><th className="num">فروش</th></tr></thead>
            <tbody>
              {r.top.map((t) => <tr key={t.productId}><td>{t.name}</td><td className="num">{fa(t.qty)}</td><td className="num">{fa(t.revenue)}</td></tr>)}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { k: string; v: number; p: number }[] }) {
  return (
    <section className="card">
      <div className="card-head"><h3>{title}</h3></div>
      <div className="card-body stack" style={{ gap: 12 }}>
        {rows.length === 0 ? <span className="subtle">داده‌ای نیست</span> : rows.map((r) => (
          <div key={r.k} className="stack" style={{ gap: 4 }}>
            <div className="row between"><span>{r.k}</span><span className="num"><b>{tomanShort(r.v)}</b> <span className="subtle">({fa(r.p)}٪)</span></span></div>
            <div className="progress"><i style={{ width: `${r.p}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}
