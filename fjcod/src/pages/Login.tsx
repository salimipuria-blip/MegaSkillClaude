import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { login, useStore } from '../core/store';
import { ROLES } from '../core/permissions';
import { toast } from '../components/ui';

/** Password-only entry: the password identifies the user, and the user's position opens its panel. */
export function Login({ onSuccess }: { onSuccess: (password: string, mustChange: boolean) => void }) {
  const { db } = useStore();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    // let the button state paint before the synchronous key-stretching runs
    setTimeout(() => {
      const res = login(password);
      setBusy(false);
      if (res.ok) {
        toast(`${ROLES[res.user.role].title} · ${res.user.name}`, 'info');
        onSuccess(password, res.mustChange);
      } else {
        setError(res.error);
        setPassword('');
      }
    }, 10);
  };

  return (
    <div className="login fabric">
      <main className="login-card">
        <div className="login-hero-name">{db.settings.storeName}</div>
        <div className="login-hero-en">{db.settings.storeNameEn}</div>
        <div className="login-rule" aria-hidden />
        <form onSubmit={submit}>
          <h1 className="sr-only">ورود به سامانهٔ {db.settings.storeName}</h1>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="رمز ورود"
              aria-label="رمز ورود"
              autoFocus
              autoComplete="current-password"
              dir="ltr"
              name="password"
              aria-invalid={!!error}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'}
              style={{ position: 'absolute', insetInlineEnd: 6, top: 7, color: 'var(--navy)' }}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <div className="error-text" role="alert">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={!password || busy}>
            <LogIn size={18} /> {busy ? 'در حال بررسی…' : 'ورود'}
          </button>
        </form>
        <div className="login-foot">
          <span className="latin">FJCOD</span> · {db.license.licensee}
        </div>
      </main>
    </div>
  );
}
