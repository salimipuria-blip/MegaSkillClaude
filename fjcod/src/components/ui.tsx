import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, Minus, X } from 'lucide-react';
import { ActionError } from '../core/store';
import { pct } from '../lib/format';

/* ---------------- Toasts ---------------- */
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
let toasts: Toast[] = [];
let seq = 0;
const tl = new Set<() => void>();
const emitT = () => tl.forEach((l) => l());

export function toast(text: string, kind: Toast['kind'] = 'success') {
  const t = { id: ++seq, kind, text };
  toasts = [...toasts, t].slice(-4);
  emitT();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emitT();
  }, kind === 'error' ? 5200 : 3200);
}

/** Run a store action; show its error as a toast instead of crashing. Returns true on success. */
export function run(fn: () => void, success?: string): boolean {
  try {
    fn();
    if (success) toast(success);
    return true;
  } catch (e) {
    toast(e instanceof ActionError ? e.message : 'خطای غیرمنتظره رخ داد. دوباره تلاش کنید.', 'error');
    if (!(e instanceof ActionError)) console.error(e);
    return false;
  }
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      tl.add(l);
      return () => tl.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'error' ? <AlertCircle size={18} aria-hidden /> : <CheckCircle2 size={18} aria-hidden />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Modal ---------------- */
export function Modal(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose } = props;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${props.wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={ref}>
        <div className="modal-head">
          <h2>{props.title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="بستن" data-close>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- Small atoms ---------------- */
export function Delta({ value, suffix }: { value: number; suffix?: string }) {
  const cls = Math.abs(value) < 0.05 ? 'flat' : value > 0 ? 'up' : 'down';
  const Icon = cls === 'up' ? ArrowUpRight : cls === 'down' ? ArrowDownRight : Minus;
  return (
    <span className={`delta ${cls}`}>
      <Icon size={13} aria-hidden />
      {pct(value)}
      {suffix && <span className="sr-only">{suffix}</span>}
    </span>
  );
}

export function Kpi(props: { label: string; icon: ReactNode; value: ReactNode; unit?: string; foot?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">
        {props.icon}
        {props.label}
      </div>
      <div className="kpi-value">
        {props.value}
        {props.unit && <small>{props.unit}</small>}
      </div>
      {props.foot && <div className="kpi-foot">{props.foot}</div>}
    </div>
  );
}

export function Progress({ value, good }: { value: number; good?: boolean }) {
  const w = Math.max(0, Math.min(100, value));
  return (
    <div className={`progress${good ? ' good' : ''}`} role="progressbar" aria-valuenow={Math.round(w)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${w}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const clean = name.replace(/[—-].*/, '').trim();
  const letters = clean.split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || '؟';
  return (
    <span className="avatar" aria-hidden>
      {letters}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="subtle">{hint}</small>}
    </label>
  );
}

/** Khatam (8-point star) emblem — the brand mark */
export function Emblem({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#12213f" />
      <g fill="none" stroke="#f3ebdd" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M32 9l6.6 16.4L55 32l-16.4 6.6L32 55l-6.6-16.4L9 32l16.4-6.6z" />
        <path d="M15.7 15.7L32 22.4l16.3-6.7-6.7 16.3 6.7 16.3L32 41.6l-16.3 6.7 6.7-16.3z" opacity="0.6" />
      </g>
      <circle cx="32" cy="32" r="4.5" fill="#d8c7a6" />
    </svg>
  );
}
