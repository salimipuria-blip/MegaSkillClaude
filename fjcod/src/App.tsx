import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  BarChart3, Boxes, Cog, LayoutDashboard, LogOut, Menu, Moon, Receipt, ShieldCheck, ShoppingBag, Sun, TrendingUp, Users, UsersRound, Wallet, KeyRound, AlertTriangle,
} from 'lucide-react';
import { can, changeOwnPassword, currentUser, licenseState, logout, useStore, MIN_PASSWORD, type Permission } from './core/store';
import { ROLES } from './core/permissions';
import { Login } from './pages/Login';
import { Avatar, Emblem, Field, Modal, Toasts, run, toast } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { POS } from './pages/POS';
import { Sales } from './pages/Sales';
import { Products } from './pages/Products';
import { Customers } from './pages/Customers';
import { Growth } from './pages/Growth';
import { Shifts } from './pages/Shifts';
import { Reports } from './pages/Reports';
import { Staff } from './pages/Staff';
import { SettingsPage } from './pages/Settings';
import { SystemPage } from './pages/System';

export type PageId = 'dashboard' | 'pos' | 'sales' | 'products' | 'customers' | 'growth' | 'shifts' | 'reports' | 'staff' | 'settings' | 'system';

interface PageDef {
  id: PageId;
  title: string;
  icon: typeof LayoutDashboard;
  any: Permission[] | null;
  section: string;
  component: ComponentType<{ go: (p: PageId) => void }>;
}

const PAGES: PageDef[] = [
  { id: 'dashboard', title: 'داشبورد', icon: LayoutDashboard, any: null, section: 'روزانه', component: Dashboard },
  { id: 'pos', title: 'صندوق فروش', icon: ShoppingBag, any: ['pos.use', 'pos.hold'], section: 'روزانه', component: POS },
  { id: 'sales', title: 'فاکتورها', icon: Receipt, any: ['sales.viewAll', 'sales.viewOwn'], section: 'روزانه', component: Sales },
  { id: 'shifts', title: 'شیفت و صندوق', icon: Wallet, any: ['shifts.own', 'shifts.viewAll'], section: 'روزانه', component: Shifts },
  { id: 'growth', title: 'موتور رشد', icon: TrendingUp, any: ['growth.view'], section: 'رشد', component: Growth },
  { id: 'customers', title: 'باشگاه مشتریان', icon: UsersRound, any: ['customers.view'], section: 'رشد', component: Customers },
  { id: 'reports', title: 'گزارش‌ها', icon: BarChart3, any: ['reports.view'], section: 'رشد', component: Reports },
  { id: 'products', title: 'کالا و انبار', icon: Boxes, any: ['products.view'], section: 'مدیریت', component: Products },
  { id: 'staff', title: 'کاربران و پوزیشن‌ها', icon: Users, any: ['staff.manage'], section: 'مدیریت', component: Staff },
  { id: 'settings', title: 'تنظیمات فروشگاه', icon: Cog, any: ['settings.store'], section: 'مدیریت', component: SettingsPage },
  { id: 'system', title: 'سیستم و مجوز', icon: ShieldCheck, any: ['system.backup', 'system.license'], section: 'مدیریت', component: SystemPage },
];

type Theme = 'light' | 'dark';
function readTheme(): Theme {
  try {
    const t = localStorage.getItem('cham.theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* ignore */
  }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readPage(): PageId {
  const h = location.hash.replace('#/', '') as PageId;
  return PAGES.some((p) => p.id === h) ? h : 'dashboard';
}

export default function App() {
  const { db, session, persistWarning } = useStore();
  const user = useMemo(() => currentUser(db), [db, session]);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [page, setPage] = useState<PageId>(readPage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdModal, setPwdModal] = useState<{ forced: boolean; current: string } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('cham.theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const onHash = () => setPage(readPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((p: PageId) => {
    location.hash = `#/${p}`;
    setPage(p);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  // Auto-lock after inactivity
  useEffect(() => {
    if (!user) return;
    const limit = Math.max(1, db.settings.idleLockMinutes) * 60_000;
    let last = Date.now();
    const bump = () => (last = Date.now());
    const events = ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last > limit) {
        logout();
        toast('به‌دلیل عدم فعالیت، سامانه قفل شد.', 'info');
      }
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
  }, [user, db.settings.idleLockMinutes]);

  useEffect(() => {
    if (user && user.mustChangePassword && db.settings.forcePasswordChange && !pwdModal) setPwdModal({ forced: true, current: '' });
  }, [user, db.settings.forcePasswordChange, pwdModal]);

  if (!user) {
    return (
      <>
        <Login
          onSuccess={(password, mustChange) => {
            if (mustChange) setPwdModal({ forced: true, current: password });
            else setPwdModal(null);
            const p = readPage();
            setPage(p);
          }}
        />
        <Toasts />
      </>
    );
  }

  const allowed = PAGES.filter((p) => !p.any || p.any.some((perm) => can(user.role, perm)));
  const active = allowed.find((p) => p.id === page) ?? allowed[0];
  const Page = active.component;
  const lic = licenseState(db);
  const sections = [...new Set(allowed.map((p) => p.section))];
  const heldCount = db.heldCarts.length;

  return (
    <div className="shell">
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="منوی اصلی">
        <div className="brand">
          <div className="brand-mark">
            <Emblem />
            <div>
              <div className="brand-name">{db.settings.storeName}</div>
              <div className="brand-en">{db.settings.storeNameEn}</div>
            </div>
          </div>
        </div>
        <nav className="nav">
          {sections.map((s) => (
            <div key={s}>
              <div className="nav-section">{s}</div>
              {allowed
                .filter((p) => p.section === s)
                .map((p) => (
                  <button key={p.id} className="nav-item" aria-current={p.id === active.id ? 'page' : undefined} onClick={() => go(p.id)} data-nav={p.id}>
                    <p.icon size={18} />
                    {p.title}
                    {p.id === 'pos' && heldCount > 0 && can(user.role, 'pos.use') && <span className="nav-badge">{heldCount.toLocaleString('fa-IR')}</span>}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div>
            ساخته‌شده توسط <span className="latin">FJCOD</span>
          </div>
          <div>بهره‌بردار: {db.license.licensee} · نسخهٔ ۱٫۰</div>
        </div>
      </aside>

      <div className="main">
        {lic.state !== 'active' && (can(user.role, 'settings.store') || lic.state === 'expired') && (
          <div className={`banner ${lic.state === 'expiring' ? 'warn' : 'bad'}`} role="alert">
            <AlertTriangle size={16} />
            {lic.state === 'expiring' && `اشتراک سامانه تا ${lic.daysLeft.toLocaleString('fa-IR')} روز دیگر منقضی می‌شود.`}
            {lic.state === 'grace' && `اشتراک منقضی شده؛ دورهٔ مهلت ${(db.license.graceDays + lic.daysLeft).toLocaleString('fa-IR')} روز دیگر.`}
            {lic.state === 'expired' && 'اشتراک منقضی شده و ثبت فروش متوقف است. با FJCOD تماس بگیرید.'}
          </div>
        )}
        {persistWarning && (
          <div className="banner bad" role="alert">
            <AlertTriangle size={16} /> فضای ذخیره‌سازی مرورگر در دسترس نیست؛ از «سیستم و مجوز» نسخهٔ پشتیبان بگیرید.
          </div>
        )}
        <header className="topbar">
          <button className="btn btn-ghost btn-icon mobile-only" onClick={() => setMenuOpen(true)} aria-label="باز کردن منو">
            <Menu size={20} />
          </button>
          <h1>{active.title}</h1>
          <div className="spacer" />
          <button className="btn btn-ghost btn-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="user-chip">
            <div className="who" style={{ lineHeight: 1.3 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{user.name}</div>
              <div className="subtle">{ROLES[user.role].title}</div>
            </div>
            <Avatar name={user.name} />
          </div>
          <button className="btn btn-ghost btn-icon" onClick={() => setPwdModal({ forced: false, current: '' })} aria-label="تغییر رمز عبور" title="تغییر رمز عبور">
            <KeyRound size={18} />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => logout()} aria-label="خروج" title="خروج" data-testid="logout">
            <LogOut size={18} />
          </button>
        </header>
        <main className="content">
          <Page go={go} />
        </main>
      </div>
      {pwdModal && <PasswordModal forced={pwdModal.forced} current={pwdModal.current} onClose={() => setPwdModal(null)} />}
      <Toasts />
    </div>
  );
}

function PasswordModal({ forced, current: initial, onClose }: { forced: boolean; current: string; onClose: () => void }) {
  const [current, setCurrent] = useState(initial);
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    if (next !== repeat) return setErr('تکرار رمز با رمز جدید یکسان نیست.');
    if (run(() => changeOwnPassword(current, next), 'رمز عبور با موفقیت تغییر کرد.')) onClose();
  };
  return (
    <Modal
      title={forced ? 'تعیین رمز شخصی (ورود اول)' : 'تغییر رمز عبور'}
      onClose={forced ? () => logout() : onClose}
      footer={
        <>
          <button className="btn btn-primary" onClick={submit} disabled={!next || !repeat || !current}>ذخیرهٔ رمز</button>
          <button className="btn btn-ghost" onClick={forced ? () => logout() : onClose}>{forced ? 'خروج' : 'انصراف'}</button>
        </>
      }
    >
      {forced && <p className="muted" style={{ margin: 0 }}>برای امنیت، رمز اولیه باید با رمز شخصی جایگزین شود.</p>}
      {!initial && (
        <Field label="رمز فعلی">
          <input className="input" type="password" dir="ltr" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
      )}
      <Field label="رمز جدید" hint={`حداقل ${MIN_PASSWORD.toLocaleString('fa-IR')} کاراکتر`}>
        <input className="input" type="password" dir="ltr" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" name="new-password" />
      </Field>
      <Field label="تکرار رمز جدید">
        <input className="input" type="password" dir="ltr" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" name="repeat-password" onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>
      {err && <div className="error-text" role="alert">{err}</div>}
    </Modal>
  );
}
