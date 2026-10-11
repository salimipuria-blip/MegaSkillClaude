import { useMemo, useState } from 'react';
import { AlertTriangle, Flame, Lightbulb, Phone, Repeat, Target, TrendingUp, Trophy } from 'lucide-react';
import { can, currentUser, markContacted, saveStoreTarget, useStore } from '../core/store';
import { comparePeriod, growthStreak, insights, leaderboard, repeatRate, sellerOf, targetProgress, weeklySeries, winBackList } from '../core/growth';
import { addDays, fa, fa0, jDate, jMonthName, parseNum, startOfJMonth, toman, tomanShort } from '../lib/format';
import { BarChart } from '../components/charts';
import { Delta, Empty, Field, Kpi, Modal, Progress, run } from '../components/ui';


export function Growth() {
  const { db } = useStore();
  const user = currentUser(db)!;
  const now = Date.now();
  const storeWide = can(user.role, 'dashboard.store');
  const [targetModal, setTargetModal] = useState(false);

  const d = useMemo(() => {
    const sales = storeWide ? db.sales : db.sales.filter((s) => sellerOf(s) === user.id);
    return {
      weeks: weeklySeries(sales, now, 12),
      streak: growthStreak(sales, now),
      week: comparePeriod(sales, now, 'week'),
      month: comparePeriod(sales, now, 'month'),
      target: storeWide ? targetProgress(db.sales, now, db.settings.monthlyStoreTarget) : targetProgress(db.sales, now, user.monthlyTarget, (s) => sellerOf(s) === user.id),
      repeat: repeatRate(db.sales, addDays(now, -90), now + 1),
      board: leaderboard(db.sales, db.users, startOfJMonth(now), now + 1),
      winBack: winBackList(db.customers, db.sales, now, db.settings.winBackDays),
      tips: storeWide ? insights(db, now) : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, storeWide, user.id]);

  const me = d.board.find((r) => r.user.id === user.id);

  return (
    <>
      <div className="page-head">
        <span />
        {can(user.role, 'targets.manage') && <button className="btn btn-primary" onClick={() => setTargetModal(true)}><Target size={18} /> تعیین هدف ماه</button>}
      </div>

      <div className="grid grid-4">
        <div className="streak" style={{ gridColumn: 'span 1' }}>
          <div className="girih" aria-hidden />
          <Flame size={30} />
          <div>
            <div className="streak-num">{fa(d.streak)}</div>
            <div style={{ fontSize: 13 }}>هفتهٔ پیاپی رشد</div>
          </div>
        </div>
        <Kpi icon={<TrendingUp size={16} />} label="این هفته تا امروز" value={tomanShort(d.week.current.revenue)} unit="تومان" foot={<><Delta value={d.week.revenueGrowth} /> در برابر {tomanShort(d.week.previous.revenue)}</>} />
        <Kpi icon={<TrendingUp size={16} />} label={`${jMonthName(now)} تا امروز`} value={tomanShort(d.month.current.revenue)} unit="تومان" foot={<><Delta value={d.month.revenueGrowth} /> نسبت به ماه قبل</>} />
        <Kpi icon={<Repeat size={16} />} label="نرخ خرید تکراری" value={`${fa(d.repeat)}٪`} foot="۹۰ روز اخیر، کل فروشگاه" />
      </div>

      <div className="grid grid-main">
        <section className="card">
          <div className="card-head">
            <h3>فروش هفتگی — ۱۲ هفتهٔ اخیر</h3>
            <span className="subtle">ستون کم‌رنگ: هفتهٔ جاری (ناتمام)</span>
          </div>
          <div className="card-body">
            <BarChart
              caption="فروش هفتگی ۱۲ هفتهٔ اخیر"
              labelEvery={2}
              data={d.weeks.map((w, i) => ({
                key: w.day,
                label: jDate(w.day).split(' ').slice(0, 2).join(' '),
                title: `هفتهٔ ${jDate(w.day)}`,
                value: w.revenue,
                sub: i > 0 && d.weeks[i - 1].revenue > 0 ? `${w.revenue >= d.weeks[i - 1].revenue ? 'رشد' : 'افت'} ${fa(Math.abs(((w.revenue - d.weeks[i - 1].revenue) / d.weeks[i - 1].revenue) * 100))}٪` : undefined,
                dim: i === d.weeks.length - 1,
              }))}
            />
          </div>
        </section>
        <section className="card card-pad stack" style={{ gap: 12 }}>
          <b className="row" style={{ gap: 8 }}><Target size={16} color="var(--accent)" /> {storeWide ? 'هدف ماه فروشگاه' : 'هدف ماه شما'}</b>
          {d.target.target > 0 ? (
            <>
              <div className="kpi-value">{fa(d.target.pct)}٪</div>
              <Progress value={d.target.pct} good={d.target.pct >= 100} />
              <div className="stack subtle" style={{ gap: 4 }}>
                <span>محقق‌شده: <b className="num">{toman(d.target.achieved)}</b></span>
                <span>هدف: <b className="num">{toman(d.target.target)}</b></span>
                <span>پیش‌بینی پایان ماه: <b className="num">{toman(d.target.projected)}</b> ({fa(d.target.projectedPct)}٪)</span>
                {d.target.pct < 100 && <span>نیاز روزانه برای {fa(d.target.daysLeft)} روز باقی‌مانده: <b className="num">{toman(d.target.dailyNeeded)}</b></span>}
              </div>
              {!storeWide && me && <div className="badge accent" style={{ alignSelf: 'flex-start' }}>پورسانت تخمینی: {toman(me.commission)}</div>}
            </>
          ) : (
            <Empty icon={<Target size={26} />} title="هدفی تعریف نشده" />
          )}
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h3 className="row" style={{ gap: 8 }}><Repeat size={16} color="var(--accent)" /> دعوت به بازگشت ({fa(d.winBack.length)})</h3>
            <span className="subtle">بیش از {fa(db.settings.winBackDays)} روز بدون خرید</span>
          </div>
          {d.winBack.length === 0 ? (
            <Empty icon={<Repeat size={26} />} title="همهٔ مشتریان فعال‌اند" />
          ) : (
            <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {d.winBack.slice(0, 30).map((w) => (
                <div key={w.customer.id} className="list-row">
                  <div className="grow">
                    <b>{w.customer.name}</b>
                    <div className="subtle">{fa(w.stat.count)} خرید · {tomanShort(w.stat.spend)} تومان · آخرین: {jDate(w.stat.lastAt)}</div>
                  </div>
                  <span className="badge warn num">{fa(w.daysAway)} روز</span>
                  <a className="btn btn-sm btn-ghost" href={`tel:${w.customer.phone}`} aria-label={`تماس با ${w.customer.name}`} dir="ltr"><Phone size={14} /> {fa0(w.customer.phone.slice(-4))}</a>
                  {can(user.role, 'customers.edit') && <button className="btn btn-sm" onClick={() => run(() => markContacted(w.customer.id), 'تماس ثبت شد؛ تا ۷ روز از فهرست خارج می‌شود.')}>تماس گرفتم</button>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3 className="row" style={{ gap: 8 }}><Trophy size={16} color="var(--accent)" /> جدول فروشندگان {jMonthName(now)}</h3>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>فروشنده</th><th className="num">فروش</th><th className="num">فاکتور</th><th>هدف</th><th className="num">پورسانت</th></tr></thead>
              <tbody>
                {d.board.map((r, i) => (
                  <tr key={r.user.id} style={r.user.id === user.id ? { background: 'var(--accent-soft)' } : undefined}>
                    <td className="num">{fa(i + 1)}</td>
                    <td>{r.user.name}</td>
                    <td className="num">{tomanShort(r.revenue)}</td>
                    <td className="num">{fa(r.count)}</td>
                    <td style={{ minWidth: 110 }}>{r.target > 0 ? <><Progress value={r.pct} good={r.pct >= 100} /><span className="subtle num">{fa(r.pct)}٪</span></> : <span className="subtle">—</span>}</td>
                    <td className="num">{storeWide || r.user.id === user.id ? fa(r.commission) : '•••'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {storeWide && d.tips.length > 0 && (
        <section className="card">
          <div className="card-head"><h3 className="row" style={{ gap: 8 }}><Lightbulb size={16} color="var(--accent)" /> اقدامات پیشنهادی</h3></div>
          {d.tips.map((t, i) => (
            <div key={i} className={`insight ${t.tone}`}>
              <span className="dot">{t.tone === 'warn' ? <AlertTriangle size={16} /> : t.tone === 'good' ? <TrendingUp size={16} /> : <Lightbulb size={16} />}</span>
              <div><b>{t.title}</b><div className="subtle">{t.action}</div></div>
            </div>
          ))}
        </section>
      )}

      {targetModal && <TargetModal current={db.settings.monthlyStoreTarget} lastMonth={d.month.previous.revenue} onClose={() => setTargetModal(false)} />}
    </>
  );
}

function TargetModal({ current, lastMonth, onClose }: { current: number; lastMonth: number; onClose: () => void }) {
  const [v, setV] = useState(String(current));
  const save = () => {
    if (run(() => saveStoreTarget(parseNum(v)), 'هدف ماه ثبت شد.')) onClose();
  };
  return (
    <Modal title="هدف فروش ماه" onClose={onClose} footer={<><button className="btn btn-primary" onClick={save}>ذخیره</button><button className="btn btn-ghost" onClick={onClose}>انصراف</button></>}>
      <Field label="هدف ماهانه (تومان)" hint={parseNum(v) > 0 ? toman(parseNum(v)) : undefined}>
        <input className="input num" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} />
      </Field>
      <div className="chips">
        {[10, 15, 20].map((p) => (
          <button key={p} className="chip" onClick={() => setV(String(Math.round((current * (1 + p / 100)) / 1e6) * 1e6))}>+{fa(p)}٪ نسبت به هدف فعلی</button>
        ))}
      </div>
      <span className="subtle">قانون تکرار رشد: هدف هر ماه را کمی بالاتر از عملکرد ماه قبل بگذارید. (فروش ماه قبل تا همین روز: {toman(lastMonth)})</span>
    </Modal>
  );
}
