import { useState } from 'react';
import { Save } from 'lucide-react';
import type { RoleId, Settings } from '../core/types';
import { saveSettings, useStore } from '../core/store';
import { ROLES, ROLE_ORDER } from '../core/permissions';
import { parseNum, toman } from '../lib/format';
import { Field, run, toast } from '../components/ui';

export function SettingsPage() {
  const { db } = useStore();
  const [s, setS] = useState<Settings>(db.settings);
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: parseNum(e.target.value) || 0 });
  const txt = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value });
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);

  const save = () => {
    const { monthlyStoreTarget: _ignored, ...rest } = s;
    void _ignored;
    if (rest.taxPct < 0 || rest.taxPct > 100) return toast('درصد مالیات باید بین ۰ تا ۱۰۰ باشد.', 'error');
    if (rest.tomanPerPoint <= 0 || rest.idleLockMinutes < 1) return toast('مقادیر امتیاز و قفل خودکار باید بزرگ‌تر از صفر باشند.', 'error');
    run(() => saveSettings(rest), 'تنظیمات ذخیره شد.');
  };

  return (
    <>
      <div className="page-head">
        <span />
        <button className="btn btn-primary" onClick={save} disabled={!dirty}><Save size={18} /> ذخیرهٔ تغییرات</button>
      </div>

      <section className="card card-pad stack">
        <h3>هویت فروشگاه</h3>
        <div className="form-grid">
          <Field label="نام فروشگاه"><input className="input" value={s.storeName} onChange={txt('storeName')} /></Field>
          <Field label="نام لاتین"><input className="input" dir="ltr" value={s.storeNameEn} onChange={txt('storeNameEn')} /></Field>
          <Field label="تلفن"><input className="input" value={s.phone} onChange={txt('phone')} /></Field>
          <Field label="نشانی"><input className="input" value={s.address} onChange={txt('address')} /></Field>
        </div>
        <Field label="متن پایین رسید"><textarea className="textarea" value={s.receiptFooter} onChange={txt('receiptFooter')} /></Field>
      </section>

      <section className="card card-pad stack">
        <h3>فروش و باشگاه مشتریان</h3>
        <div className="form-grid">
          <Field label="مالیات بر ارزش افزوده (٪)" hint="۰ = قیمت‌ها شامل مالیات است"><input className="input num" inputMode="decimal" value={s.taxPct} onChange={num('taxPct')} /></Field>
          <Field label="هر چند تومان خرید = ۱ امتیاز" hint={toman(s.tomanPerPoint)}><input className="input num" inputMode="numeric" value={s.tomanPerPoint} onChange={num('tomanPerPoint')} /></Field>
          <Field label="ارزش هر امتیاز (تومان)"><input className="input num" inputMode="numeric" value={s.pointValue} onChange={num('pointValue')} /></Field>
          <Field label="روزهای غیبت برای «دعوت به بازگشت»"><input className="input num" inputMode="numeric" value={s.winBackDays} onChange={num('winBackDays')} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={s.allowNegativeStock} onChange={(e) => setS({ ...s, allowNegativeStock: e.target.checked })} /> اجازهٔ فروش بیش از موجودی</label>
      </section>

      <section className="card card-pad stack">
        <h3>سقف تخفیف هر پوزیشن (اقتصادی و کنترل‌شده)</h3>
        <div className="form-grid">
          {ROLE_ORDER.map((r: RoleId) => (
            <Field key={r} label={`${ROLES[r].title} (٪)`}>
              <input className="input num" inputMode="numeric" value={s.discountLimits[r]} onChange={(e) => setS({ ...s, discountLimits: { ...s.discountLimits, [r]: Math.min(100, Math.max(0, parseNum(e.target.value) || 0)) } })} />
            </Field>
          ))}
        </div>
      </section>

      <section className="card card-pad stack">
        <h3>امنیت</h3>
        <div className="form-grid">
          <Field label="قفل خودکار پس از عدم فعالیت (دقیقه)"><input className="input num" inputMode="numeric" value={s.idleLockMinutes} onChange={num('idleLockMinutes')} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={s.forcePasswordChange} onChange={(e) => setS({ ...s, forcePasswordChange: e.target.checked })} /> الزام تغییر رمز اولیه در ورود اول</label>
      </section>
    </>
  );
}
