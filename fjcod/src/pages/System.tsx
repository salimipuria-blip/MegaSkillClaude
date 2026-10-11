import { useRef, useState } from 'react';
import { BadgeCheck, Database, Download, RefreshCcw, Rocket, ShieldCheck, Upload } from 'lucide-react';
import { can, currentUser, exportBackup, importBackup, licenseState, renewLicense, resetToDemo, startClean, useStore } from '../core/store';
import { fa, jDate, jDateShort, jDateTime } from '../lib/format';
import { Kpi, Modal, run } from '../components/ui';

export function SystemPage() {
  const { db } = useStore();
  const user = currentUser(db)!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<null | 'clean' | 'demo' | { json: string; name: string }>(null);
  const [auditFilter, setAuditFilter] = useState('');
  const lic = licenseState(db);

  const download = () => {
    let json = '';
    if (!run(() => (json = exportBackup()))) return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cham-backup-${jDateShort(Date.now()).replace(/\//g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    f.text().then((json) => setConfirm({ json, name: f.name }));
  };

  const audit = db.audit.filter((a) => !auditFilter || a.action.startsWith(auditFilter)).slice(-200).reverse();
  const storageKb = (() => {
    try {
      return Math.round((localStorage.getItem('cham.db.v1')?.length ?? 0) / 1024);
    } catch {
      return 0;
    }
  })();

  return (
    <>
      <div className="page-head">
        <div>
          <p>مالک سیستم: <b className="latin">FJCOD</b> · بهره‌بردار: <b>{db.license.licensee}</b></p>
        </div>
      </div>

      <div className="grid grid-4">
        <Kpi icon={<BadgeCheck size={16} />} label="وضعیت اشتراک" value={{ active: 'فعال', expiring: 'رو به اتمام', grace: 'دورهٔ مهلت', expired: 'منقضی' }[lic.state]} foot={`تا ${jDate(db.license.expiresAt)} · ${fa(Math.max(0, lic.daysLeft))} روز`} />
        <Kpi icon={<ShieldCheck size={16} />} label="طرح" value={db.license.plan === 'yearly' ? 'سالانه' : 'ماهانه'} foot={`شروع: ${jDate(db.license.startedAt)}`} />
        <Kpi icon={<Database size={16} />} label="حجم داده" value={fa(storageKb)} unit="KB" foot={`${fa(db.sales.length)} فاکتور · ${fa(db.products.length)} کالا`} />
      </div>

      {can(user.role, 'system.license') && (
        <section className="card card-pad stack">
          <h3>مدیریت اشتراک چام (ویژهٔ FJCOD)</h3>
          <p className="muted" style={{ margin: 0 }}>پس از دریافت هزینه از {db.license.licensee}، اشتراک را تمدید کنید. پس از انقضا، {fa(db.license.graceDays)} روز دورهٔ مهلت وجود دارد و سپس ثبت فروش متوقف می‌شود.</p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => run(() => renewLicense('monthly'), 'اشتراک ۳۰ روز تمدید شد.')}>تمدید ماهانه (+۳۰ روز)</button>
            <button className="btn btn-accent" onClick={() => run(() => renewLicense('yearly'), 'اشتراک ۳۶۵ روز تمدید شد.')}>تمدید سالانه (+۳۶۵ روز)</button>
          </div>
        </section>
      )}

      <section className="card card-pad stack">
        <h3>پشتیبان‌گیری و راه‌اندازی</h3>
        <p className="muted" style={{ margin: 0 }}>داده‌ها روی همین دستگاه ذخیره می‌شوند. هر روز در پایان کار یک نسخهٔ پشتیبان دانلود کنید.</p>
        <div className="row">
          <button className="btn btn-primary" onClick={download}><Download size={16} /> دانلود پشتیبان</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> بازیابی از فایل</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        </div>
        <hr className="sep" />
        <div className="row">
          <button className="btn btn-accent" onClick={() => setConfirm('clean')}><Rocket size={16} /> شروع کار واقعی (حذف داده‌های نمایشی)</button>
          <button className="btn btn-danger" onClick={() => setConfirm('demo')}><RefreshCcw size={16} /> بازنشانی به دادهٔ نمایشی</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>گزارش ممیزی (۲۰۰ رویداد اخیر)</h3>
          <select className="select" style={{ width: 'auto' }} value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)} aria-label="فیلتر رویداد">
            <option value="">همه</option>
            <option value="auth">ورود و رمز</option>
            <option value="sale">فروش و مرجوعی</option>
            <option value="inventory">انبار</option>
            <option value="staff">کاربران</option>
            <option value="system">سیستم</option>
          </select>
        </div>
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table className="table">
            <thead><tr><th>زمان</th><th>کاربر</th><th>رویداد</th><th>جزئیات</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="num">{jDateTime(a.at)}</td>
                  <td>{db.users.find((u) => u.id === a.userId)?.name ?? 'سیستم'}</td>
                  <td><span className="badge" dir="ltr">{a.action}</span></td>
                  <td>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {confirm && (
        <Modal
          title={confirm === 'clean' ? 'شروع کار واقعی' : confirm === 'demo' ? 'بازنشانی به دادهٔ نمایشی' : 'بازیابی از پشتیبان'}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button
                className="btn btn-danger"
                onClick={() => {
                  const ok =
                    confirm === 'clean'
                      ? run(() => startClean(), 'آمادهٔ کار واقعی! کالاها را تعریف کنید.')
                      : confirm === 'demo'
                        ? run(() => resetToDemo(), 'دادهٔ نمایشی بازنشانی شد. رمزها به پیش‌فرض برگشت.')
                        : run(() => importBackup(confirm.json), 'بازیابی با موفقیت انجام شد.');
                  if (ok) setConfirm(null);
                }}
              >
                تأیید
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>انصراف</button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            {confirm === 'clean' && 'همهٔ کالاها، مشتریان، فاکتورها و شیفت‌های نمایشی حذف می‌شوند. کاربران، رمزها، تنظیمات و اشتراک حفظ می‌شوند. پیشنهاد: ابتدا پشتیبان بگیرید.'}
            {confirm === 'demo' && 'همهٔ داده‌ها با دادهٔ نمایشی جایگزین می‌شوند و رمز همهٔ کاربران به رمز پیش‌فرض برمی‌گردد.'}
            {typeof confirm === 'object' && `دادهٔ فعلی با محتوای «${confirm.name}» جایگزین می‌شود.`}
          </p>
        </Modal>
      )}
    </>
  );
}
