import { useMemo } from 'react';
import { AlertTriangle, Banknote, Flame, Package, Receipt, ShoppingBag, ShoppingCart, Target, TrendingUp, Trophy } from 'lucide-react';
import type { PageId } from '../App';
import { can, currentUser, openShiftOf, useStore } from '../core/store';
import { comparePeriod, dailySeries, growthStreak, sellerOf, targetProgress, topProducts } from '../core/growth';
import { saleNet } from '../core/sales';
import { fa, fa0, jDate, jMonthName, startOfDay, startOfJMonth, toman, tomanShort, WEEKDAYS, weekdayIndex } from '../lib/format';
import { BarChart } from '../components/charts';
import { Delta, Empty, Kpi, Progress } from '../components/ui';
import { ROLES } from '../core/permissions';

export function Dashboard({ go }: { go: (p: PageId) => void }) {
  const { db } = useStore();
  const user = currentUser(db)!;
  const now = Date.now();
  const storeWide = can(user.role, 'dashboard.store');

  const data = useMemo(() => {
    const sales = storeWide ? db.sales : db.sales.filter((s) => sellerOf(s) === user.id || s.cashierId === user.id);
    return {
      sales,
      day: comparePeriod(sales, now, 'day'),
      week: comparePeriod(sales, now, 'week'),
      month: comparePeriod(sales, now, 'month'),
      series: dailySeries(sales, now, 30),
      streak: growthStreak(sales, now),
      target: storeWide
        ? targetProgress(db.sales, now, db.settings.monthlyStoreTarget)
        : targetProgress(db.sales, now, user.monthlyTarget, (s) => sellerOf(s) === user.id),
      top: topProducts(sales, db.products, startOfJMonth(now), now + 1, 5),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, user.id, storeWide]);

  const lowStock = db.products.filter((p) => p.active && p.stock <= p.minStock);
  const shift = openShiftOf(db, user.id);
  const myHeld = db.heldCarts.filter((h) => h.by === user.id).length;
  const dayFmt = new Intl.DateTimeFormat('en-u-ca-persian', { day: 'numeric' });

  return (
    <>
      <div className="page-head">
        <p>
          {WEEKDAYS[weekdayIndex(now)]}، {jDate(now)} · {ROLES[user.role].title}
          {!storeWide && ' · نمای شخصی'}
        </p>
        {can(user.role, 'pos.use') ? (
          <button className="btn btn-primary" onClick={() => go('pos')}>
            <ShoppingBag size={18} /> {shift ? 'ادامهٔ فروش' : 'شروع فروش'}
          </button>
        ) : can(user.role, 'pos.hold') ? (
          <button className="btn btn-primary" onClick={() => go('pos')}>
            <ShoppingCart size={18} /> سبد پیشنهادی جدید {myHeld > 0 && `(${fa(myHeld)} در صف)`}
          </button>
        ) : null}
      </div>

      <div className="grid grid-4">
        <Kpi icon={<Banknote size={16} />} label="فروش امروز" value={tomanShort(data.day.current.revenue)} unit="تومان" foot={<><Delta value={data.day.revenueGrowth} /> نسبت به دیروز تا این ساعت</>} />
        <Kpi icon={<TrendingUp size={16} />} label="فروش این هفته" value={tomanShort(data.week.current.revenue)} unit="تومان" foot={<><Delta value={data.week.revenueGrowth} /> نسبت به هفتهٔ قبل</>} />
        <Kpi icon={<Receipt size={16} />} label={`فروش ${jMonthName(now)}`} value={tomanShort(data.month.current.revenue)} unit="تومان" foot={<><Delta value={data.month.revenueGrowth} /> نسبت به ماه قبل</>} />
        <Kpi icon={<ShoppingCart size={16} />} label="میانگین سبد (ماه)" value={tomanShort(data.month.current.avgBasket)} unit="تومان" foot={<><Delta value={data.month.basketGrowth} /> · {fa(data.month.current.count)} فاکتور</>} />
      </div>

      <div className="grid grid-main">
        <section className="card">
          <div className="card-head">
            <h3>روند فروش ۳۰ روز اخیر</h3>
            <span className="subtle">پس از کسر مرجوعی</span>
          </div>
          <div className="card-body">
            <BarChart
              caption="فروش روزانه ۳۰ روز اخیر"
              labelEvery={5}
              data={data.series.map((p) => ({
                key: p.day,
                label: fa0(dayFmt.format(p.day)),
                title: `${WEEKDAYS[weekdayIndex(p.day)]} ${jDate(p.day)}`,
                value: p.revenue,
                sub: `${fa(p.count)} فاکتور`,
                dim: p.day === startOfDay(now),
              }))}
            />
          </div>
        </section>

        <section className="stack">
          <div className="streak">
            <div className="girih" aria-hidden />
            <Flame size={30} />
            <div style={{ flex: 1 }}>
              <div className="streak-num">{fa(data.streak)}</div>
              <div style={{ fontSize: 13 }}>هفتهٔ پیاپی رشد {storeWide ? 'فروشگاه' : 'شما'}</div>
            </div>
            {can(user.role, 'growth.view') && (
              <button className="btn btn-sm" style={{ background: 'transparent', color: 'inherit', borderColor: 'rgb(243 235 221 / 0.4)' }} onClick={() => go('growth')}>
                موتور رشد
              </button>
            )}
          </div>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div className="row between">
              <b className="row" style={{ gap: 8 }}><Target size={16} color="var(--sand)" /> {storeWide ? 'هدف ماه فروشگاه' : 'هدف ماه شما'}</b>
              {data.target.target > 0 && <span className="badge accent num">{fa(data.target.pct)}٪</span>}
            </div>
            {data.target.target > 0 ? (
              <>
                <Progress value={data.target.pct} good={data.target.pct >= 100} />
                <div className="row between subtle">
                  <span>{tomanShort(data.target.achieved)} از {tomanShort(data.target.target)}</span>
                  <span>پیش‌بینی: {fa(data.target.projectedPct)}٪</span>
                </div>
                {data.target.pct < 100 && <div className="subtle">نیاز روزانه: <b className="num">{toman(data.target.dailyNeeded)}</b> · {fa(data.target.daysLeft)} روز مانده</div>}
              </>
            ) : (
              <span className="subtle">هدفی تعریف نشده است.</span>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h3 className="row" style={{ gap: 8 }}><Trophy size={16} color="var(--sand)" /> پرفروش‌های {jMonthName(now)}</h3>
          </div>
          {data.top.length === 0 ? (
            <Empty icon={<Package size={28} />} title="هنوز فروشی در این ماه ثبت نشده" />
          ) : (
            <div className="list">
              {data.top.map((t, i) => (
                <div key={t.productId} className="list-row">
                  <span className="badge accent num">{fa(i + 1)}</span>
                  <div className="grow ellipsis">{t.name}</div>
                  <span className="subtle num">{fa(t.qty)} عدد</span>
                  <b className="num">{tomanShort(t.revenue)}</b>
                </div>
              ))}
            </div>
          )}
        </section>

        {storeWide ? (
          <section className="card">
            <div className="card-head">
              <h3 className="row" style={{ gap: 8 }}><AlertTriangle size={16} color="var(--warn)" /> کم‌موجودی</h3>
              <button className="btn btn-sm" onClick={() => go('products')}>انبار</button>
            </div>
            {lowStock.length === 0 ? (
              <Empty icon={<Package size={28} />} title="موجودی همهٔ کالاها کافی است" />
            ) : (
              <div className="list">
                {lowStock.slice(0, 6).map((p) => (
                  <div key={p.id} className="list-row">
                    <div className="grow ellipsis">{p.name}</div>
                    <span className={`badge ${p.stock === 0 ? 'bad' : 'warn'} num`}>{fa(p.stock)} عدد</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="card">
            <div className="card-head">
              <h3>آخرین فروش‌های شما</h3>
            </div>
            {data.sales.length === 0 ? (
              <Empty icon={<Receipt size={28} />} title="هنوز فروشی ثبت نکرده‌اید" />
            ) : (
              <div className="list">
                {data.sales.slice(-6).reverse().map((s) => (
                  <div key={s.id} className="list-row">
                    <span className="badge num">#{fa(s.number)}</span>
                    <div className="grow subtle">{jDate(s.at)}</div>
                    <b className="num">{toman(saleNet(s))}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
