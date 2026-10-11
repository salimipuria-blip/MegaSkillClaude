import { useMemo, useState } from 'react';
import { Crown, Search, UserPlus, UsersRound } from 'lucide-react';
import type { Customer } from '../core/types';
import { can, currentUser, saveCustomer, useStore } from '../core/store';
import { customerStats, nextTier, tierOf, TIERS } from '../core/growth';
import { saleNet } from '../core/sales';
import { fa, fa0, jDate, jDateTime, toLatinDigits, toman, tomanShort } from '../lib/format';
import { Empty, Field, Kpi, Modal, Progress, run } from '../components/ui';

export function Customers() {
  const { db } = useStore();
  const user = currentUser(db)!;
  const canEdit = can(user.role, 'customers.edit');
  const [q, setQ] = useState('');
  const [tier, setTier] = useState<string>('all');
  const [edit, setEdit] = useState<Customer | 'new' | null>(null);
  const [view, setView] = useState<Customer | null>(null);
  const stats = useMemo(() => customerStats(db.sales), [db.sales]);

  const rows = useMemo(() => {
    const term = toLatinDigits(q.trim());
    return db.customers
      .map((c) => ({ c, st: stats.get(c.id), t: tierOf(stats.get(c.id)?.spend ?? 0) }))
      .filter((r) => (tier === 'all' || r.t.id === tier) && (!term || r.c.name.includes(q.trim()) || r.c.phone.includes(term)))
      .sort((a, b) => (b.st?.spend ?? 0) - (a.st?.spend ?? 0));
  }, [db.customers, stats, q, tier]);

  const counts = TIERS.map((t) => ({ t, n: db.customers.filter((c) => tierOf(stats.get(c.id)?.spend ?? 0).id === t.id).length }));
  const repeaters = [...stats.values()].filter((s) => s.count >= 2).length;

  return (
    <>
      <div className="page-head">
        <div>
          <p>امتیاز هر {tomanShort(db.settings.tomanPerPoint)} تومان خرید = ۱ امتیاز · ارزش هر امتیاز {toman(db.settings.pointValue)}</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit('new')}><UserPlus size={18} /> مشتری جدید</button>}
      </div>
      <div className="grid grid-4">
        <Kpi icon={<UsersRound size={16} />} label="اعضای باشگاه" value={fa(db.customers.length)} unit="نفر" />
        <Kpi icon={<UsersRound size={16} />} label="مشتریان وفادار (۲+ خرید)" value={fa(repeaters)} unit="نفر" foot={<>{fa(stats.size ? (repeaters / stats.size) * 100 : 0)}٪ از خریداران</>} />
        {counts.slice(0, 2).map(({ t, n }) => <Kpi key={t.id} icon={<Crown size={16} />} label={`سطح ${t.title}`} value={fa(n)} unit="نفر" foot={<>از {tomanShort(t.min)} تومان خرید</>} />)}
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input className="input" placeholder="نام یا موبایل" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجوی مشتری" />
        </div>
        <div className="chips">
          <button className="chip" aria-pressed={tier === 'all'} onClick={() => setTier('all')}>همه</button>
          {TIERS.map((t) => <button key={t.id} className="chip" aria-pressed={tier === t.id} onClick={() => setTier(t.id)}>{t.title}</button>)}
        </div>
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <Empty icon={<UsersRound size={30} />} title="مشتری‌ای یافت نشد" />
        ) : (
          <table className="table">
            <thead>
              <tr><th>مشتری</th><th>موبایل</th><th>سطح</th><th className="num">تعداد خرید</th><th className="num">مجموع خرید</th><th className="num">امتیاز</th><th>آخرین خرید</th></tr>
            </thead>
            <tbody>
              {rows.map(({ c, st, t }) => (
                <tr key={c.id} className="clickable" onClick={() => setView(c)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setView(c)}>
                  <td><b>{c.name}</b></td>
                  <td className="num" dir="ltr" style={{ textAlign: 'right' }}>{fa0(c.phone)}</td>
                  <td><span className={`badge tier-${t.id}`}>{t.title}</span></td>
                  <td className="num">{fa(st?.count ?? 0)}</td>
                  <td className="num">{fa(st?.spend ?? 0)}</td>
                  <td className="num">{fa(c.points)}</td>
                  <td>{st ? jDate(st.lastAt) : <span className="subtle">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <CustomerModal customer={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {view && <CustomerView customer={db.customers.find((c) => c.id === view.id) ?? view} canEdit={canEdit} onEdit={() => { setEdit(view); setView(null); }} onClose={() => setView(null)} />}
    </>
  );
}

function CustomerModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [note, setNote] = useState(customer?.note ?? '');
  const save = () => {
    if (run(() => saveCustomer({ id: customer?.id, name, phone, note }), customer ? 'اطلاعات مشتری به‌روز شد.' : 'مشتری ثبت شد.')) onClose();
  };
  return (
    <Modal title={customer ? 'ویرایش مشتری' : 'مشتری جدید'} onClose={onClose} footer={<><button className="btn btn-primary" onClick={save}>ذخیره</button><button className="btn btn-ghost" onClick={onClose}>انصراف</button></>}>
      <Field label="نام و نام خانوادگی"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="موبایل"><input className="input" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09121234567" /></Field>
      <Field label="یادداشت (سلیقه، سایز، مناسبت‌ها)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function CustomerView({ customer, canEdit, onEdit, onClose }: { customer: Customer; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const { db } = useStore();
  const sales = db.sales.filter((s) => s.customerId === customer.id).slice().reverse();
  const spend = sales.reduce((a, s) => a + saleNet(s), 0);
  const t = tierOf(spend);
  const nt = nextTier(spend);
  return (
    <Modal wide title={customer.name} onClose={onClose} footer={canEdit ? <button className="btn" onClick={onEdit}>ویرایش</button> : undefined}>
      <div className="row between">
        <span className={`badge tier-${t.id}`} style={{ fontSize: 14, padding: '4px 14px' }}>سطح {t.title}</span>
        <span className="num muted" dir="ltr">{fa0(customer.phone)}</span>
      </div>
      <div className="grid grid-4">
        <div><div className="subtle">مجموع خرید</div><b className="num">{toman(spend)}</b></div>
        <div><div className="subtle">تعداد خرید</div><b className="num">{fa(sales.length)}</b></div>
        <div><div className="subtle">امتیاز</div><b className="num">{fa(customer.points)}</b></div>
        <div><div className="subtle">میانگین سبد</div><b className="num">{toman(sales.length ? spend / sales.length : 0)}</b></div>
      </div>
      {nt && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="subtle">تا سطح {nt.tier.title}: {toman(nt.remaining)}</div>
          <Progress value={(spend / nt.tier.min) * 100} />
        </div>
      )}
      {customer.note && <div className="card card-pad" style={{ padding: 14 }}>{customer.note}</div>}
      <div className="list card">
        {sales.length === 0 ? <Empty icon={<UsersRound size={24} />} title="هنوز خریدی ثبت نشده" /> : sales.slice(0, 10).map((s) => (
          <div key={s.id} className="list-row">
            <span className="badge num">#{fa(s.number)}</span>
            <span className="grow subtle">{jDateTime(s.at)} · {s.items.map((i) => i.name).join('، ')}</span>
            <b className="num">{fa(saleNet(s))}</b>
          </div>
        ))}
      </div>
    </Modal>
  );
}
