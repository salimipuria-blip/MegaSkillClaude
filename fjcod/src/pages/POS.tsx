import { useMemo, useRef, useState } from 'react';
import { Barcode, CreditCard, Inbox, Minus, PackageSearch, Plus, Printer, Send, ShoppingBag, Trash2, UserPlus, UserRound, Wallet, X } from 'lucide-react';
import type { PageId } from '../App';
import type { Customer, PaymentMethod, Sale } from '../core/types';
import { buildLines, can, checkout, currentUser, holdCart, openShift, openShiftOf, removeHeldCart, saveCustomer, useStore } from '../core/store';
import { computeCart } from '../core/sales';
import { customerStats, tierOf } from '../core/growth';
import { METHOD_LABEL, fa, fa0, jDateTime, parseNum, toLatinDigits, toman } from '../lib/format';
import { Empty, Field, Modal, run, toast } from '../components/ui';

interface Line {
  productId: string;
  qty: number;
}

export function POS({ go }: { go: (p: PageId) => void }) {
  const { db } = useStore();
  const user = currentUser(db)!;
  const isCashier = can(user.role, 'pos.use');
  const shift = openShiftOf(db, user.id);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('همه');
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [consultantId, setConsultantId] = useState<string | null>(user.role === 'consultant' ? user.id : null);
  const [discountMode, setDiscountMode] = useState<'pct' | 'amount'>('pct');
  const [discountInput, setDiscountInput] = useState('');
  const [pointsInput, setPointsInput] = useState('');
  const [heldCartId, setHeldCartId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [custModal, setCustModal] = useState(false);
  const [holdModal, setHoldModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => ['همه', ...new Set(db.products.filter((p) => p.active).map((p) => p.category))], [db.products]);
  const customer = db.customers.find((c) => c.id === customerId) ?? null;
  const cartLines = buildLines(db, lines);
  const subtotal = cartLines.reduce((s, l) => s + l.price * l.qty, 0);
  const dRaw = parseNum(discountInput) || 0;
  const discount = discountMode === 'pct' ? Math.round((subtotal * Math.min(100, Math.max(0, dRaw))) / 100) : dRaw;
  const totals = computeCart({
    lines: cartLines,
    discount,
    pointsRedeem: customer ? parseNum(pointsInput) || 0 : 0,
    pointValue: db.settings.pointValue,
    availablePoints: customer?.points ?? 0,
    taxPct: db.settings.taxPct,
    tomanPerPoint: db.settings.tomanPerPoint,
  });
  const limit = db.settings.discountLimits[user.role] ?? 0;
  const discountPct = totals.subtotal ? (totals.discount / totals.subtotal) * 100 : 0;
  const overLimit = discountPct > limit + 1e-9;

  const filtered = useMemo(() => {
    const term = toLatinDigits(q.trim()).toLowerCase();
    return db.products.filter(
      (p) => p.active && (cat === 'همه' || p.category === cat) && (!term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.barcode.includes(term)),
    );
  }, [db.products, q, cat]);

  const inCart = (id: string) => lines.find((l) => l.productId === id)?.qty ?? 0;

  const add = (productId: string, n = 1) => {
    const p = db.products.find((x) => x.id === productId);
    if (!p) return;
    const next = inCart(productId) + n;
    if (n > 0 && !db.settings.allowNegativeStock && next > p.stock) {
      toast(`موجودی «${p.name}» کافی نیست.`, 'error');
      return;
    }
    setLines((ls) => {
      if (next <= 0) return ls.filter((l) => l.productId !== productId);
      if (ls.some((l) => l.productId === productId)) return ls.map((l) => (l.productId === productId ? { ...l, qty: next } : l));
      return [...ls, { productId, qty: next }];
    });
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const term = toLatinDigits(q.trim());
    const exact = db.products.find((p) => p.active && (p.barcode === term || p.sku.toLowerCase() === term.toLowerCase()));
    const target = exact ?? (filtered.length === 1 ? filtered[0] : null);
    if (target) {
      add(target.id);
      setQ('');
    } else if (term) toast('کالایی با این کد/بارکد پیدا نشد.', 'error');
  };

  const reset = () => {
    setLines([]);
    setCustomerId(null);
    setConsultantId(user.role === 'consultant' ? user.id : null);
    setDiscountInput('');
    setPointsInput('');
    setHeldCartId(null);
    searchRef.current?.focus();
  };

  const loadHeld = (id: string) => {
    const h = db.heldCarts.find((x) => x.id === id);
    if (!h) return;
    setLines(h.items);
    setCustomerId(h.customerId);
    const by = db.users.find((u) => u.id === h.by);
    setConsultantId(by && by.role === 'consultant' ? by.id : null);
    setHeldCartId(h.id);
    toast(`سبد «${h.label}» بارگذاری شد.`, 'info');
  };

  if (isCashier && !shift) {
    return (
      <div className="card card-pad stack" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center', alignItems: 'center' }}>
        <Wallet size={40} color="var(--accent)" />
        <h2>شیفت صندوق باز نیست</h2>
        <p className="muted" style={{ margin: 0 }}>برای ثبت فروش، موجودی نقد اول شیفت را وارد کنید.</p>
        <div style={{ width: '100%', maxWidth: 320 }}>
          <Field label="موجودی نقد اول شیفت (تومان)">
            <input className="input num" inputMode="numeric" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="۰" />
          </Field>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => run(() => openShift(parseNum(openingCash || '0')), 'شیفت باز شد. فروش خوبی داشته باشید!')} data-testid="open-shift">
          <Wallet size={18} /> باز کردن شیفت
        </button>
      </div>
    );
  }

  const queue = db.heldCarts;

  return (
    <div className="pos">
      <section className="stack">
        {isCashier && queue.length > 0 && (
          <div className="card">
            <div className="card-head">
              <h3 className="row" style={{ gap: 8 }}><Inbox size={16} color="var(--accent)" /> سبدهای ارسالی مشاوران ({fa(queue.length)})</h3>
            </div>
            <div className="list">
              {queue.map((h) => {
                const by = db.users.find((u) => u.id === h.by);
                const c = db.customers.find((x) => x.id === h.customerId);
                return (
                  <div className="list-row" key={h.id}>
                    <div className="grow">
                      <b>{h.label}</b>
                      <div className="subtle">{by?.name} · {c ? c.name + ' · ' : ''}{fa(h.items.reduce((a, i) => a + i.qty, 0))} قلم · {jDateTime(h.at)}</div>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={() => loadHeld(h.id)} disabled={heldCartId === h.id}>بارگذاری</button>
                    <button className="btn btn-sm btn-ghost btn-danger" onClick={() => run(() => removeHeldCart(h.id), 'سبد حذف شد.')} aria-label="حذف سبد"><Trash2 size={15} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="toolbar">
          <div className="search">
            <Barcode size={18} />
            <input
              ref={searchRef}
              className="input"
              placeholder="جست‌وجوی نام، کد کالا یا اسکن بارکد + Enter"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onSearchKey}
              autoFocus
              aria-label="جست‌وجوی کالا"
              data-testid="pos-search"
            />
          </div>
        </div>
        <div className="chips" role="group" aria-label="دسته‌بندی">
          {categories.map((c) => (
            <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="card">
            <Empty icon={<PackageSearch size={32} />} title={db.products.length ? 'کالایی یافت نشد' : 'هنوز کالایی تعریف نشده'}>
              {!db.products.length && can(user.role, 'products.edit') && <button className="btn btn-sm" onClick={() => go('products')}>تعریف کالا</button>}
            </Empty>
          </div>
        ) : (
          <div className="product-grid">
            {filtered.map((p) => {
              const left = p.stock - inCart(p.id);
              const out = !db.settings.allowNegativeStock && left <= 0;
              return (
                <button key={p.id} className="product-tile" onClick={() => add(p.id)} disabled={out} data-testid="product-tile">
                  <span className="row between">
                    <span className="subtle">{p.category}</span>
                    <span className={`badge ${left <= p.minStock ? 'warn' : ''} num`}>{fa(left)}</span>
                  </span>
                  <span className="name">{p.name}</span>
                  <span className="price">{toman(p.price)}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="card cart" aria-label="سبد خرید">
        <div className="card-head">
          <h3 className="row" style={{ gap: 8 }}><ShoppingBag size={16} color="var(--accent)" /> سبد خرید {heldCartId && <span className="badge accent">از صف مشاور</span>}</h3>
          {lines.length > 0 && <button className="btn btn-sm btn-ghost btn-danger" onClick={reset}><X size={14} /> خالی کردن</button>}
        </div>

        <div className="card-body stack" style={{ gap: 10, borderBottom: '1px solid var(--border)' }}>
          {customer ? (
            <div className="row between">
              <div className="row" style={{ gap: 8 }}>
                <UserRound size={18} color="var(--accent)" />
                <div>
                  <b>{customer.name}</b>{' '}
                  <span className={`badge tier-${tierOf(customerStats(db.sales).get(customer.id)?.spend ?? 0).id}`}>{tierOf(customerStats(db.sales).get(customer.id)?.spend ?? 0).title}</span>
                  <div className="subtle">{fa(customer.points)} امتیاز · {fa0(customer.phone)}</div>
                </div>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => { setCustomerId(null); setPointsInput(''); }} aria-label="حذف مشتری"><X size={14} /></button>
            </div>
          ) : (
            <button className="btn btn-sm" onClick={() => setCustModal(true)} data-testid="pick-customer"><UserPlus size={15} /> انتخاب / ثبت مشتری</button>
          )}
          {isCashier && (
            <label className="field">
              <span>مشاور فروش (پورسانت)</span>
              <select className="select" value={consultantId ?? ''} onChange={(e) => setConsultantId(e.target.value || null)}>
                <option value="">— بدون مشاور —</option>
                {db.users.filter((u) => u.role === 'consultant' && u.active).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="cart-lines">
          {cartLines.length === 0 ? (
            <Empty icon={<ShoppingBag size={28} />} title="سبد خالی است">
              <span className="subtle">روی کالا بزنید یا بارکد را اسکن کنید.</span>
            </Empty>
          ) : (
            cartLines.map((l) => (
              <div key={l.productId} className="cart-line">
                <div className="ellipsis" style={{ fontWeight: 600 }}>{l.name}</div>
                <b className="num">{toman(l.price * l.qty)}</b>
                <span className="subtle num">{toman(l.price)} × {fa(l.qty)}</span>
                <span className="qty">
                  <button onClick={() => add(l.productId, 1)} aria-label="افزایش"><Plus size={14} /></button>
                  <span>{fa(l.qty)}</span>
                  <button onClick={() => add(l.productId, -1)} aria-label="کاهش"><Minus size={14} /></button>
                </span>
              </div>
            ))
          )}
        </div>

        {cartLines.length > 0 && (
          <>
            {isCashier && (
              <div className="card-body stack" style={{ gap: 8, borderTop: '1px solid var(--border)' }}>
                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <input className="input num" inputMode="decimal" placeholder={discountMode === 'pct' ? 'تخفیف ٪' : 'تخفیف (تومان)'} value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} aria-label="تخفیف" />
                  <div className="chips" style={{ flexWrap: 'nowrap' }}>
                    <button className="chip" aria-pressed={discountMode === 'pct'} onClick={() => setDiscountMode('pct')}>٪</button>
                    <button className="chip" aria-pressed={discountMode === 'amount'} onClick={() => setDiscountMode('amount')}>تومان</button>
                  </div>
                </div>
                {overLimit && <span className="error-text">سقف تخفیف مجاز شما {fa(limit)}٪ است.</span>}
                {customer && customer.points > 0 && (
                  <input className="input num" inputMode="numeric" placeholder={`استفاده از امتیاز (حداکثر ${fa(customer.points)})`} value={pointsInput} onChange={(e) => setPointsInput(e.target.value)} aria-label="امتیاز" />
                )}
              </div>
            )}
            <div className="totals">
              <div className="row"><span>جمع کالاها ({fa(totals.itemCount)})</span><span className="num">{toman(totals.subtotal)}</span></div>
              {totals.discount > 0 && <div className="row"><span>تخفیف</span><span className="num">−{toman(totals.discount)}</span></div>}
              {totals.pointsValue > 0 && <div className="row"><span>امتیاز باشگاه ({fa(totals.pointsRedeemed)})</span><span className="num">−{toman(totals.pointsValue)}</span></div>}
              {totals.tax > 0 && <div className="row"><span>مالیات ({fa(db.settings.taxPct)}٪)</span><span className="num">{toman(totals.tax)}</span></div>}
              <div className="row grand"><span>مبلغ قابل پرداخت</span><span className="num">{toman(totals.total)}</span></div>
              {customer && totals.pointsEarned > 0 && <div className="subtle">+{fa(totals.pointsEarned)} امتیاز باشگاه برای این خرید</div>}
            </div>
            <div className="card-body row" style={{ gap: 8 }}>
              {isCashier ? (
                <button className="btn btn-accent btn-lg" style={{ flex: 1 }} onClick={() => setPaying(true)} disabled={overLimit} data-testid="pay">
                  <CreditCard size={18} /> پرداخت و صدور فاکتور
                </button>
              ) : null}
              {can(user.role, 'pos.hold') && (
                <button className={`btn ${isCashier ? '' : 'btn-primary btn-lg'}`} style={isCashier ? undefined : { flex: 1 }} onClick={() => setHoldModal(true)} data-testid="hold">
                  <Send size={16} /> {isCashier ? 'نگه‌داشتن' : 'ارسال به صندوق'}
                </button>
              )}
            </div>
          </>
        )}
      </aside>

      {custModal && <CustomerPicker onClose={() => setCustModal(false)} onPick={(c) => { setCustomerId(c.id); setCustModal(false); }} />}
      {holdModal && (
        <HoldModal
          onClose={() => setHoldModal(false)}
          onSave={(label) => {
            if (run(() => holdCart({ label, customerId, items: lines }), isCashier ? 'سبد نگه داشته شد.' : 'سبد به صف صندوق ارسال شد.')) {
              if (heldCartId) run(() => removeHeldCart(heldCartId));
              setHoldModal(false);
              reset();
            }
          }}
        />
      )}
      {paying && (
        <PayModal
          total={totals.total}
          allowCredit={!!customer}
          onClose={() => setPaying(false)}
          onPay={(payments) => {
            let sale: Sale | null = null;
            const ok = run(() => {
              sale = checkout({ lines, discount: totals.discount, pointsRedeem: totals.pointsRedeemed, customerId, consultantId, payments, heldCartId });
            });
            if (ok && sale) {
              setPaying(false);
              setReceipt(sale);
              reset();
            }
          }}
        />
      )}
      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function HoldModal({ onClose, onSave }: { onClose: () => void; onSave: (label: string) => void }) {
  const [label, setLabel] = useState('');
  return (
    <Modal title="ارسال سبد به صف صندوق" onClose={onClose} footer={<><button className="btn btn-primary" onClick={() => onSave(label)}>ارسال</button><button className="btn btn-ghost" onClick={onClose}>انصراف</button></>}>
      <Field label="برچسب سبد" hint="مثلاً نام مشتری یا شمارهٔ پرو">
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSave(label)} />
      </Field>
    </Modal>
  );
}

export function CustomerPicker({ onClose, onPick }: { onClose: () => void; onPick: (c: Customer) => void }) {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const term = toLatinDigits(q.trim());
  const results = term ? db.customers.filter((c) => c.name.includes(q.trim()) || c.phone.includes(term)).slice(0, 8) : db.customers.slice(-6).reverse();
  const create = () => {
    let c: Customer | null = null;
    if (run(() => (c = saveCustomer({ name, phone, note: '' })), 'مشتری جدید ثبت شد.') && c) onPick(c);
  };
  return (
    <Modal title="مشتری" onClose={onClose}>
      {!creating ? (
        <>
          <input className="input" placeholder="نام یا شمارهٔ موبایل" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجوی مشتری" />
          <div className="list card">
            {results.length === 0 ? (
              <Empty icon={<UserRound size={24} />} title="مشتری یافت نشد" />
            ) : (
              results.map((c) => (
                <button key={c.id} className="list-row" style={{ background: 'none', border: 0, borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'right', width: '100%' }} onClick={() => onPick(c)}>
                  <UserRound size={16} color="var(--accent)" />
                  <span className="grow">{c.name}</span>
                  <span className="subtle num">{fa0(c.phone)}</span>
                </button>
              ))
            )}
          </div>
          <button className="btn" onClick={() => { setCreating(true); if (/^\d+$/.test(term)) setPhone(term); else setName(q); }}><UserPlus size={16} /> ثبت مشتری جدید</button>
        </>
      ) : (
        <>
          <Field label="نام و نام خانوادگی"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="موبایل"><input className="input" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09121234567" onKeyDown={(e) => e.key === 'Enter' && create()} /></Field>
          <div className="row">
            <button className="btn btn-primary" onClick={create}>ثبت و انتخاب</button>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>بازگشت</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function PayModal({ total, allowCredit, onClose, onPay }: { total: number; allowCredit: boolean; onClose: () => void; onPay: (p: { method: PaymentMethod; amount: number }[]) => void }) {
  const methods: PaymentMethod[] = allowCredit ? ['card', 'cash', 'transfer', 'credit'] : ['card', 'cash', 'transfer'];
  const [amounts, setAmounts] = useState<Record<PaymentMethod, string>>({ card: String(total), cash: '', transfer: '', credit: '' });
  const paid = methods.reduce((s, m) => s + (parseNum(amounts[m]) || 0), 0);
  const diff = paid - total;
  const setOnly = (m: PaymentMethod) => setAmounts({ card: '', cash: '', transfer: '', credit: '', [m]: String(total) } as Record<PaymentMethod, string>);
  const valid = diff >= 0 && (diff === 0 || (parseNum(amounts.cash) || 0) >= diff);
  const submit = () => valid && onPay(methods.map((m) => ({ method: m, amount: parseNum(amounts[m]) || 0 })));
  return (
    <Modal
      title={`پرداخت — ${toman(total)}`}
      onClose={onClose}
      footer={<><button className="btn btn-accent btn-lg" onClick={submit} disabled={!valid} data-testid="confirm-pay">ثبت نهایی فاکتور</button><button className="btn btn-ghost" onClick={onClose}>بازگشت</button></>}
    >
      <div className="chips">
        {methods.map((m) => <button key={m} className="chip" onClick={() => setOnly(m)}>همه با {METHOD_LABEL[m]}</button>)}
      </div>
      <div className="pay-grid">
        {methods.map((m) => (
          <Field key={m} label={METHOD_LABEL[m]}>
            <input className="input num" inputMode="numeric" value={amounts[m]} onChange={(e) => setAmounts({ ...amounts, [m]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </Field>
        ))}
      </div>
      <div className={`badge ${diff < 0 ? 'bad' : diff > 0 ? 'accent' : 'good'}`} style={{ alignSelf: 'flex-start', fontSize: 14, padding: '4px 14px' }}>
        {diff < 0 ? `باقی‌مانده: ${toman(-diff)}` : diff > 0 ? `باقی پول نقد مشتری: ${toman(diff)}` : 'مبلغ کامل است'}
      </div>
      {diff > 0 && (parseNum(amounts.cash) || 0) < diff && <span className="error-text">مازاد پرداخت فقط از محل نقد قابل برگشت است.</span>}
    </Modal>
  );
}

export function ReceiptModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { db } = useStore();
  const cashier = db.users.find((u) => u.id === sale.cashierId);
  const consultant = db.users.find((u) => u.id === sale.consultantId);
  const customer = db.customers.find((c) => c.id === sale.customerId);
  return (
    <Modal title={`فاکتور #${fa(sale.number)}`} onClose={onClose} footer={<><button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} /> چاپ رسید</button><button className="btn btn-ghost" onClick={onClose}>فروش بعدی</button></>}>
      <div className="receipt" data-testid="receipt">
        <h3>{db.settings.storeName}</h3>
        <div className="center latin" style={{ letterSpacing: '0.3em' }}>{db.settings.storeNameEn}</div>
        <div className="center" style={{ fontSize: 11 }}>{db.settings.address} · {db.settings.phone}</div>
        <hr />
        <div>شمارهٔ فاکتور: {fa(sale.number)}</div>
        <div>تاریخ: {jDateTime(sale.at)}</div>
        <div>صندوقدار: {cashier?.name}{consultant ? ` · مشاور: ${consultant.name}` : ''}</div>
        {customer && <div>مشتری: {customer.name}</div>}
        <table>
          <tbody>
            {sale.items.map((i) => (
              <tr key={i.productId}>
                <td>{i.name} × {fa(i.qty)}</td>
                <td className="num">{fa(i.price * i.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row between"><span>جمع</span><span>{fa(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div className="row between"><span>تخفیف</span><span>−{fa(sale.discount)}</span></div>}
        {sale.pointsValue > 0 && <div className="row between"><span>امتیاز</span><span>−{fa(sale.pointsValue)}</span></div>}
        {sale.tax > 0 && <div className="row between"><span>مالیات</span><span>{fa(sale.tax)}</span></div>}
        <div className="row between" style={{ fontWeight: 900, fontSize: 16 }}><span>مبلغ کل (تومان)</span><span>{fa(sale.total)}</span></div>
        <div style={{ fontSize: 11 }}>{sale.payments.map((p) => `${METHOD_LABEL[p.method]}: ${fa(p.amount)}`).join(' · ')}</div>
        {sale.pointsEarned > 0 && <div style={{ fontSize: 11 }}>امتیاز این خرید: {fa(sale.pointsEarned)}</div>}
        <hr />
        <div className="center" style={{ fontSize: 11 }}>{db.settings.receiptFooter}</div>
        <div className="center latin" style={{ fontSize: 10, letterSpacing: '0.2em' }}>POWERED BY FJCOD</div>
      </div>
    </Modal>
  );
}
