import { useState } from 'react';
import { Lock, Wallet } from 'lucide-react';
import { can, closeShift, currentUser, expectedCash, openShift, openShiftOf, useStore } from '../core/store';
import { saleNet } from '../core/sales';
import { fa, jDateTime, parseNum, toman } from '../lib/format';
import { Empty, Field, Kpi, Modal, run } from '../components/ui';
import { METHOD_LABEL } from '../lib/format';
import type { PaymentMethod } from '../core/types';

export function Shifts() {
  const { db } = useStore();
  const user = currentUser(db)!;
  const shift = openShiftOf(db, user.id);
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState(false);
  const viewAll = can(user.role, 'shifts.viewAll');
  const history = db.shifts.filter((s) => viewAll || s.userId === user.id).slice().reverse();

  const shiftSales = shift ? db.sales.filter((s) => s.shiftId === shift.id) : [];
  const byMethod = shiftSales.reduce<Record<string, number>>((a, s) => {
    for (const p of s.payments) a[p.method] = (a[p.method] ?? 0) + p.amount;
    return a;
  }, {});

  return (
    <>
      {can(user.role, 'shifts.own') && (
        shift ? (
          <>
            <div className="grid grid-4">
              <Kpi icon={<Wallet size={16} />} label="شروع شیفت" value={jDateTime(shift.openedAt).split(' · ')[1]} foot={jDateTime(shift.openedAt).split(' · ')[0]} />
              <Kpi icon={<Wallet size={16} />} label="فروش شیفت" value={fa(shiftSales.reduce((a, s) => a + saleNet(s), 0))} unit="تومان" foot={`${fa(shiftSales.length)} فاکتور`} />
              <Kpi icon={<Wallet size={16} />} label="نقد مورد انتظار در صندوق" value={fa(expectedCash(db, shift))} unit="تومان" foot={`موجودی اول: ${fa(shift.openingCash)}`} />
              <div className="card kpi">
                <div className="kpi-label">تفکیک پرداخت</div>
                {Object.keys(byMethod).length === 0 ? <span className="subtle">—</span> : Object.entries(byMethod).map(([m, v]) => (
                  <div key={m} className="row between"><span>{METHOD_LABEL[m as PaymentMethod]}</span><b className="num">{fa(v)}</b></div>
                ))}
              </div>
            </div>
            <div>
              <button className="btn btn-primary" onClick={() => setClosing(true)} data-testid="close-shift"><Lock size={16} /> بستن شیفت و تطبیق صندوق</button>
            </div>
          </>
        ) : (
          <div className="card card-pad row" style={{ alignItems: 'flex-end' }}>
            <div style={{ minWidth: 240, flex: 1, maxWidth: 360 }}>
              <Field label="موجودی نقد اول شیفت (تومان)">
                <input className="input num" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="۰" />
              </Field>
            </div>
            <button className="btn btn-primary" onClick={() => run(() => openShift(parseNum(opening || '0')), 'شیفت باز شد.') && setOpening('')}><Wallet size={16} /> باز کردن شیفت</button>
          </div>
        )
      )}

      <div className="card table-wrap">
        <div className="card-head"><h3>تاریخچهٔ شیفت‌ها</h3></div>
        {history.length === 0 ? (
          <Empty icon={<Wallet size={28} />} title="هنوز شیفتی ثبت نشده است" />
        ) : (
          <table className="table">
            <thead><tr><th>کاربر</th><th>شروع</th><th>پایان</th><th className="num">موجودی اول</th><th className="num">مورد انتظار</th><th className="num">شمارش‌شده</th><th>اختلاف</th></tr></thead>
            <tbody>
              {history.map((s) => {
                const diff = s.countedCash !== null && s.expectedCash !== null ? s.countedCash - s.expectedCash : null;
                return (
                  <tr key={s.id}>
                    <td>{db.users.find((u) => u.id === s.userId)?.name}</td>
                    <td className="num">{jDateTime(s.openedAt)}</td>
                    <td className="num">{s.closedAt ? jDateTime(s.closedAt) : <span className="badge good">باز</span>}</td>
                    <td className="num">{fa(s.openingCash)}</td>
                    <td className="num">{s.expectedCash !== null ? fa(s.expectedCash) : fa(expectedCash(db, s))}</td>
                    <td className="num">{s.countedCash !== null ? fa(s.countedCash) : '—'}</td>
                    <td>{diff === null ? '—' : diff === 0 ? <span className="badge good">تطبیق کامل</span> : <span className={`badge ${diff < 0 ? 'bad' : 'warn'} num`}>{diff > 0 ? 'مازاد' : 'کسری'} {fa(Math.abs(diff))}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {closing && shift && <CloseModal expected={expectedCash(db, shift)} onClose={() => setClosing(false)} />}
    </>
  );
}

function CloseModal({ expected, onClose }: { expected: number; onClose: () => void }) {
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const c = parseNum(counted);
  const diff = Number.isFinite(c) ? c - expected : 0;
  const submit = () => {
    if (run(() => closeShift(c, note), 'شیفت بسته شد.')) onClose();
  };
  return (
    <Modal title="بستن شیفت" onClose={onClose} footer={<><button className="btn btn-primary" onClick={submit} disabled={!Number.isFinite(c)}>ثبت و بستن شیفت</button><button className="btn btn-ghost" onClick={onClose}>انصراف</button></>}>
      <div className="row between"><span className="muted">نقد مورد انتظار</span><b className="num">{toman(expected)}</b></div>
      <Field label="نقد شمارش‌شده در صندوق (تومان)"><input className="input num" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
      {Number.isFinite(c) && <div className={`badge ${diff === 0 ? 'good' : diff < 0 ? 'bad' : 'warn'}`} style={{ alignSelf: 'flex-start' }}>{diff === 0 ? 'تطبیق کامل' : `${diff < 0 ? 'کسری' : 'مازاد'}: ${toman(Math.abs(diff))}`}</div>}
      <Field label="توضیح"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}
