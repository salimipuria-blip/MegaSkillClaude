import { useState } from 'react';
import { KeyRound, Pencil, ShieldCheck, UserPlus } from 'lucide-react';
import type { RoleId, User } from '../core/types';
import { MIN_PASSWORD, currentUser, saveUser, useStore } from '../core/store';
import { ROLES, ROLE_ORDER, canManageRole, type Permission } from '../core/permissions';
import { fa, jDate, parseNum, toman } from '../lib/format';
import { Avatar, Field, Modal, run } from '../components/ui';

const PERM_LABEL: Partial<Record<Permission, string>> = {
  'dashboard.store': 'داشبورد کل فروشگاه',
  'pos.use': 'صندوق و صدور فاکتور',
  'pos.hold': 'سبد پیشنهادی',
  'sales.refund': 'مرجوعی',
  'products.edit': 'تعریف و قیمت کالا',
  'inventory.adjust': 'انبارگردانی',
  'customers.edit': 'ثبت مشتری',
  'reports.view': 'گزارش‌ها',
  'staff.manage': 'کاربران',
  'targets.manage': 'هدف‌گذاری رشد',
  'settings.store': 'تنظیمات',
  'system.backup': 'پشتیبان‌گیری',
  'system.license': 'مجوز و اشتراک',
};

export function Staff() {
  const { db } = useStore();
  const me = currentUser(db)!;
  const [edit, setEdit] = useState<User | 'new' | null>(null);

  return (
    <>
      <div className="page-head">
        <div>
          <p>ورود فقط با رمز است و رمز هر کاربر پوزیشن او را مشخص می‌کند؛ پس رمزها باید یکتا باشند.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEdit('new')} data-testid="new-user"><UserPlus size={18} /> کاربر جدید</button>
      </div>

      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>کاربر</th><th>پوزیشن</th><th>وضعیت</th><th className="num">هدف ماهانه</th><th className="num">پورسانت</th><th>تاریخ ایجاد</th><th /></tr></thead>
          <tbody>
            {ROLE_ORDER.flatMap((r) => db.users.filter((u) => u.role === r)).map((u) => {
              const editable = u.id === me.id || canManageRole(me.role, u.role);
              return (
                <tr key={u.id}>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar name={u.name} /><b>{u.name}</b>{u.id === me.id && <span className="badge accent">شما</span>}</div></td>
                  <td>{ROLES[u.role].title}</td>
                  <td>
                    {u.active ? <span className="badge good">فعال</span> : <span className="badge">غیرفعال</span>}{' '}
                    {u.mustChangePassword && <span className="badge warn">رمز اولیه</span>}
                  </td>
                  <td className="num">{u.monthlyTarget ? fa(u.monthlyTarget) : '—'}</td>
                  <td className="num">{u.commissionPct ? `${fa(u.commissionPct)}٪` : '—'}</td>
                  <td>{jDate(u.createdAt)}</td>
                  <td>{editable && <button className="btn btn-sm btn-ghost" onClick={() => setEdit(u)} aria-label={`ویرایش ${u.name}`}><Pencil size={14} /></button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="card">
        <div className="card-head"><h3 className="row" style={{ gap: 8 }}><ShieldCheck size={16} color="var(--accent)" /> ماتریس دسترسی پوزیشن‌ها</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>دسترسی</th>{ROLE_ORDER.map((r) => <th key={r}>{ROLES[r].title}</th>)}</tr></thead>
            <tbody>
              {(Object.keys(PERM_LABEL) as Permission[]).map((p) => (
                <tr key={p}>
                  <td>{PERM_LABEL[p]}</td>
                  {ROLE_ORDER.map((r) => <td key={r}>{ROLES[r].permissions.includes(p) ? <span className="badge good">✓</span> : <span className="subtle">—</span>}</td>)}
                </tr>
              ))}
              <tr>
                <td>سقف تخفیف</td>
                {ROLE_ORDER.map((r) => <td key={r}><span className="badge accent">{fa(db.settings.discountLimits[r])}٪</span></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {edit && <UserModal user={edit === 'new' ? null : edit} me={me} onClose={() => setEdit(null)} />}
    </>
  );
}

function UserModal({ user, me, onClose }: { user: User | null; me: User; onClose: () => void }) {
  const roles = ROLE_ORDER.filter((r) => canManageRole(me.role, r) || (user && user.role === r && user.id === me.id));
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<RoleId>(user?.role ?? (roles.includes('cashier') ? 'cashier' : roles[0]));
  const [active, setActive] = useState(user?.active ?? true);
  const [target, setTarget] = useState(String(user?.monthlyTarget ?? 0));
  const [commission, setCommission] = useState(String(user?.commissionPct ?? 0));
  const [password, setPassword] = useState('');
  const self = user?.id === me.id;
  const save = () => {
    if (run(() => saveUser({ id: user?.id, name, role, active, monthlyTarget: parseNum(target) || 0, commissionPct: parseNum(commission) || 0, password: password || undefined }), user ? 'کاربر به‌روزرسانی شد.' : 'کاربر ایجاد شد.')) onClose();
  };
  return (
    <Modal title={user ? `ویرایش ${user.name}` : 'کاربر جدید'} onClose={onClose} footer={<><button className="btn btn-primary" onClick={save}>ذخیره</button><button className="btn btn-ghost" onClick={onClose}>انصراف</button></>}>
      <Field label="نام نمایشی"><input className="input" value={name} onChange={(e) => setName(e.target.value)} name="user-name" /></Field>
      <Field label="پوزیشن">
        <select className="select" value={role} onChange={(e) => setRole(e.target.value as RoleId)} disabled={self} name="user-role">
          {roles.map((r) => <option key={r} value={r}>{ROLES[r].title}</option>)}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="هدف فروش ماهانه (تومان)" hint={parseNum(target) > 0 ? toman(parseNum(target)) : undefined}><input className="input num" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label="درصد پورسانت"><input className="input num" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} /></Field>
      </div>
      <Field label={user ? 'تنظیم رمز جدید (اختیاری)' : 'رمز اولیه'} hint={`حداقل ${fa(MIN_PASSWORD)} کاراکتر · کاربر در ورود اول باید آن را تغییر دهد`}>
        <div style={{ position: 'relative' }}>
          <input className="input" dir="ltr" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} name="user-password" />
          <KeyRound size={16} style={{ position: 'absolute', insetInlineStart: 12, top: 13, color: 'var(--fg-subtle)' }} />
        </div>
      </Field>
      {!self && <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> حساب فعال است</label>}
    </Modal>
  );
}
