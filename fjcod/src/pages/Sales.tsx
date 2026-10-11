import { useMemo, useState } from 'react';
import { Printer, Receipt, RotateCcw, Search } from 'lucide-react';
import type { Sale } from '../core/types';
import { can, currentUser, refundSale, useStore } from '../core/store';
import { refundedAmount, refundedQty, saleNet, unitPaid } from '../core/sales';
import { sellerOf } from '../core/growth';
import { addDays, fa, jDateTime, startOfDay, startOfJMonth, startOfWeek, toLatinDigits, toman } from '../lib/format';
import { Empty, Field, Modal, run } from '../components/ui';
import { ReceiptModal } from './POS';
import { METHOD_LABEL } from '../lib/format';

type Range = 'today' | 'week' | 'month' | '90';
const RANGES: { id: Range; title: string }[] = [
  { id: 'today', title: 'امروز' },
  { id: 'week', title: 'این هفته' },
  { id: 'month', title: 'این ماه' },
  { id: '90', title: '۹۰ روز' },
];

export function Sales() {
  const { db } = useStore();
  const user = currentUser(db)!;
  const all = can(user.role, 'sales.viewAll');
  const [range, setRange] = useState<Range>('week');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Sale | null>(null);
  const [print, setPrint] = useState<Sale | null>(null);
  const now = Date.now();
  const from = range === 'today' ? startOfDay(now) : range === 'week' ? startOfWeek(now) : range === 'month' ? startOfJMonth(now) : addDays(now, -90);

  const list = useMemo(() => {
    const term = toLatinDigits(q.trim());
    return db.sales
      .filter((s) => s.at >= from && (all || s.cashierId === user.id || sellerOf(s) === user.id))
      .filter((s) => {
        if (!term) return true;
        const c = db.customers.find((x) => x.id === s.customerId);
        return String(s.number).includes(term) || (c && (c.name.includes(q.trim()) || c.phone.includes(term)));
      })
      .slice()
      .reverse();
  }, [db, from, q, all, user.id]);

  const total = list.reduce((a, s) => a + saleNet(s), 0);
  const name = (id: string | null) => db.users.find((u) => u.id === id)?.name ?? '—';
  const current = open ? db.sales.find((s) => s.id === open.id) ?? open : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p>{all ? 'همهٔ فروش‌های فروشگاه' : 'فروش‌هایی که شما ثبت کرده یا مشاور آن بوده‌اید'} · {fa(list.length)} فاکتور · {toman(total)}</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="chips">
          {RANGES.map((r) => <button key={r.id} className="chip" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.title}</button>)}
        </div>
        <div className="search">
          <Search size={16} />
          <input className="input" placeholder="شمارهٔ فاکتور، نام یا موبایل مشتری" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجوی فاکتور" />
        </div>
      </div>
      <div className="card table-wrap">
        {list.length === 0 ? (
          <Empty icon={<Receipt size={30} />} title="فاکتوری در این بازه نیست" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>شماره</th><th>تاریخ</th><th>مشتری</th><th>صندوقدار</th><th>مشاور</th><th>پرداخت</th><th className="num">مبلغ</th><th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 300).map((s) => {
                const refunded = refundedAmount(s);
                return (
                  <tr key={s.id} className="clickable" onClick={() => setOpen(s)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(s)}>
                    <td className="num"><b>#{fa(s.number)}</b></td>
                    <td className="num">{jDateTime(s.at)}</td>
                    <td>{db.customers.find((c) => c.id === s.customerId)?.name ?? <span className="subtle">مهمان</span>}</td>
                    <td>{name(s.cashierId)}</td>
                    <td>{s.consultantId ? name(s.consultantId) : <span className="subtle">—</span>}</td>
                    <td>{s.payments.map((p) => METHOD_LABEL[p.method]).join('، ')}</td>
                    <td className="num"><b>{fa(saleNet(s))}</b></td>
                    <td>{refunded === 0 ? <span className="badge good">قطعی</span> : refunded >= s.total ? <span className="badge bad">مرجوع کامل</span> : <span className="badge warn">مرجوع جزئی</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {list.length > 300 && <div className="subtle" style={{ padding: 12 }}>۳۰۰ فاکتور آخر نمایش داده شده است؛ بازه را محدودتر کنید.</div>}
      </div>
      {current && <SaleDetail sale={current} canRefund={can(user.role, 'sales.refund')} onClose={() => setOpen(null)} onPrint={() => { setPrint(current); setOpen(null); }} />}
      {print && <ReceiptModal sale={print} onClose={() => setPrint(null)} />}
    </>
  );
}

function SaleDetail({ sale, canRefund, onClose, onPrint }: { sale: Sale; canRefund: boolean; onClose: () => void; onPrint: () => void }) {
  const { db } = useStore();
  const [refunding, setRefunding] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const remaining = sale.total - refundedAmount(sale);
  const preview = sale.items.reduce((a, i) => a + unitPaid(sale, i) * (qty[i.productId] || 0), 0);

  const doRefund = () => {
    if (run(() => refundSale(sale.id, Object.entries(qty).map(([productId, q]) => ({ productId, qty: q })), reason), 'مرجوعی ثبت شد و کالا به انبار بازگشت.')) {
      setRefunding(false);
      setQty({});
    }
  };

  return (
    <Modal
      wide
      title={`فاکتور #${fa(sale.number)}`}
      onClose={onClose}
      footer={
        refunding ? (
          <>
            <button className="btn btn-danger" onClick={doRefund} disabled={preview <= 0}><RotateCcw size={16} /> ثبت مرجوعی ({toman(Math.min(preview, remaining))})</button>
            <button className="btn btn-ghost" onClick={() => setRefunding(false)}>انصراف</button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={onPrint}><Printer size={16} /> چاپ مجدد</button>
            {canRefund && remaining > 0 && <button className="btn btn-danger" onClick={() => setRefunding(true)}><RotateCcw size={16} /> مرجوعی</button>}
          </>
        )
      }
    >
      <div className="subtle">{jDateTime(sale.at)} · {db.customers.find((c) => c.id === sale.customerId)?.name ?? 'مهمان'}</div>
      <table className="table">
        <thead>
          <tr><th>کالا</th><th className="num">تعداد</th><th className="num">قیمت واحد</th><th className="num">پرداختی واحد</th>{refunding && <th>مرجوعی</th>}</tr>
        </thead>
        <tbody>
          {sale.items.map((i) => {
            const left = i.qty - refundedQty(sale, i.productId);
            return (
              <tr key={i.productId}>
                <td>{i.name}{left < i.qty && <span className="badge warn" style={{ marginInlineStart: 6 }}>{fa(i.qty - left)} مرجوع</span>}</td>
                <td className="num">{fa(i.qty)}</td>
                <td className="num">{fa(i.price)}</td>
                <td className="num">{fa(unitPaid(sale, i))}</td>
                {refunding && (
                  <td>
                    <select className="select" style={{ minWidth: 80 }} value={qty[i.productId] || 0} onChange={(e) => setQty({ ...qty, [i.productId]: Number(e.target.value) })} disabled={left === 0} aria-label={`تعداد مرجوعی ${i.name}`}>
                      {Array.from({ length: left + 1 }, (_, n) => <option key={n} value={n}>{fa(n)}</option>)}
                    </select>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="totals" style={{ borderRadius: 12 }}>
        <div className="row"><span>جمع</span><span className="num">{toman(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div className="row"><span>تخفیف</span><span className="num">−{toman(sale.discount)}</span></div>}
        {sale.pointsValue > 0 && <div className="row"><span>امتیاز</span><span className="num">−{toman(sale.pointsValue)}</span></div>}
        {sale.tax > 0 && <div className="row"><span>مالیات</span><span className="num">{toman(sale.tax)}</span></div>}
        <div className="row grand"><span>مبلغ فاکتور</span><span className="num">{toman(sale.total)}</span></div>
        {sale.refunds.map((r) => (
          <div key={r.id} className="row" style={{ color: 'var(--bad)' }}><span>مرجوعی {jDateTime(r.at)} — {r.reason}</span><span className="num">−{toman(r.amount)}</span></div>
        ))}
      </div>
      {refunding && (
        <Field label="دلیل مرجوعی">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً تعویض سایز" />
        </Field>
      )}
    </Modal>
  );
}
