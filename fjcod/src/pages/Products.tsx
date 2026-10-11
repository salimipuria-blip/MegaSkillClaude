import { useMemo, useState } from 'react';
import { PackagePlus, PackageSearch, Pencil, Search, Warehouse } from 'lucide-react';
import type { Product } from '../core/types';
import { adjustStock, can, currentUser, saveProduct, useStore } from '../core/store';
import { fa, parseNum, toLatinDigits, toman, tomanShort } from '../lib/format';
import { Empty, Field, Kpi, Modal, run } from '../components/ui';

export function Products() {
  const { db } = useStore();
  const user = currentUser(db)!;
  const canEdit = can(user.role, 'products.edit');
  const canAdjust = can(user.role, 'inventory.adjust');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('همه');
  const [onlyLow, setOnlyLow] = useState(false);
  const [edit, setEdit] = useState<Product | 'new' | null>(null);
  const [adjust, setAdjust] = useState<Product | null>(null);

  const categories = useMemo(() => ['همه', ...new Set(db.products.map((p) => p.category))], [db.products]);
  const list = useMemo(() => {
    const term = toLatinDigits(q.trim()).toLowerCase();
    return db.products.filter((p) => (cat === 'همه' || p.category === cat) && (!onlyLow || p.stock <= p.minStock) && (!term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.barcode.includes(term)));
  }, [db.products, q, cat, onlyLow]);

  const stockValue = db.products.reduce((a, p) => a + Math.max(0, p.stock) * p.cost, 0);
  const retailValue = db.products.reduce((a, p) => a + Math.max(0, p.stock) * p.price, 0);
  const low = db.products.filter((p) => p.active && p.stock <= p.minStock).length;
  const showCost = canEdit;

  return (
    <>
      <div className="page-head">
        <div>
          <p>{fa(db.products.length)} کالا در {fa(categories.length - 1)} دسته</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit('new')} data-testid="new-product"><PackagePlus size={18} /> کالای جدید</button>}
      </div>
      {showCost && (
        <div className="grid grid-4">
          <Kpi icon={<Warehouse size={16} />} label="ارزش انبار (قیمت خرید)" value={tomanShort(stockValue)} unit="تومان" />
          <Kpi icon={<Warehouse size={16} />} label="ارزش انبار (قیمت فروش)" value={tomanShort(retailValue)} unit="تومان" foot={<>حاشیهٔ سود بالقوه: {tomanShort(retailValue - stockValue)}</>} />
          <Kpi icon={<PackageSearch size={16} />} label="کالاهای کم‌موجود" value={fa(low)} unit="قلم" />
        </div>
      )}
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input className="input" placeholder="نام، کد کالا یا بارکد" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجوی کالا" />
        </div>
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="دسته">
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> فقط کم‌موجود</label>
      </div>
      <div className="card table-wrap">
        {list.length === 0 ? (
          <Empty icon={<PackageSearch size={30} />} title="کالایی یافت نشد" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>کالا</th><th>کد / بارکد</th><th>دسته</th>
                {showCost && <th className="num">قیمت خرید</th>}
                <th className="num">قیمت فروش</th>{showCost && <th className="num">سود</th>}<th className="num">موجودی</th><th>وضعیت</th><th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td className="num subtle" dir="ltr" style={{ textAlign: 'right' }}>{p.sku}<br />{p.barcode}</td>
                  <td>{p.category}</td>
                  {showCost && <td className="num">{fa(p.cost)}</td>}
                  <td className="num">{fa(p.price)}</td>
                  {showCost && <td className="num">{p.price > 0 ? `${fa(((p.price - p.cost) / p.price) * 100)}٪` : '—'}</td>}
                  <td className="num"><span className={`badge ${p.stock === 0 ? 'bad' : p.stock <= p.minStock ? 'warn' : ''}`}>{fa(p.stock)}</span></td>
                  <td>{p.active ? <span className="badge good">فعال</span> : <span className="badge">غیرفعال</span>}</td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                      {canAdjust && <button className="btn btn-sm" onClick={() => setAdjust(p)}><Warehouse size={14} /> موجودی</button>}
                      {canEdit && <button className="btn btn-sm btn-ghost" onClick={() => setEdit(p)} aria-label={`ویرایش ${p.name}`}><Pencil size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <ProductModal product={edit === 'new' ? null : edit} categories={categories.slice(1)} onClose={() => setEdit(null)} />}
      {adjust && <AdjustModal product={adjust} onClose={() => setAdjust(null)} />}
    </>
  );
}

function ProductModal({ product, categories, onClose }: { product: Product | null; categories: string[]; onClose: () => void }) {
  const [f, setF] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    category: product?.category ?? categories[0] ?? 'عمومی',
    price: product ? String(product.price) : '',
    cost: product ? String(product.cost) : '',
    minStock: product ? String(product.minStock) : '5',
    stock: '0',
    active: product?.active ?? true,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const price = parseNum(f.price), cost = parseNum(f.cost) || 0;
  const save = () => {
    if (
      run(
        () =>
          saveProduct({
            id: product?.id,
            name: f.name,
            sku: toLatinDigits(f.sku),
            barcode: toLatinDigits(f.barcode),
            category: f.category,
            price,
            cost,
            minStock: parseNum(f.minStock) || 0,
            stock: parseNum(f.stock) || 0,
            active: f.active,
          }),
        product ? 'کالا به‌روزرسانی شد.' : 'کالا ثبت شد.',
      )
    )
      onClose();
  };
  return (
    <Modal wide title={product ? `ویرایش «${product.name}»` : 'کالای جدید'} onClose={onClose} footer={<><button className="btn btn-primary" onClick={save}>ذخیره</button><button className="btn btn-ghost" onClick={onClose}>انصراف</button></>}>
      <div className="form-grid">
        <Field label="نام کالا"><input className="input" value={f.name} onChange={set('name')} name="name" /></Field>
        <Field label="دسته">
          <input className="input" list="cats" value={f.category} onChange={set('category')} />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="کد کالا (SKU)" hint="خالی = خودکار"><input className="input" dir="ltr" value={f.sku} onChange={set('sku')} /></Field>
        <Field label="بارکد"><input className="input" dir="ltr" inputMode="numeric" value={f.barcode} onChange={set('barcode')} /></Field>
        <Field label="قیمت فروش (تومان)"><input className="input num" inputMode="numeric" value={f.price} onChange={set('price')} name="price" /></Field>
        <Field label="قیمت خرید (تومان)" hint={price > 0 ? `حاشیهٔ سود: ${fa(((price - cost) / price) * 100)}٪` : undefined}><input className="input num" inputMode="numeric" value={f.cost} onChange={set('cost')} /></Field>
        <Field label="حداقل موجودی (هشدار)"><input className="input num" inputMode="numeric" value={f.minStock} onChange={set('minStock')} /></Field>
        {!product && <Field label="موجودی اولیه"><input className="input num" inputMode="numeric" value={f.stock} onChange={set('stock')} name="stock" /></Field>}
      </div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> فعال و قابل فروش</label>
      {price > 0 && <div className="subtle">قیمت نمایشی: {toman(price)}</div>}
    </Modal>
  );
}

function AdjustModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { db } = useStore();
  const [mode, setMode] = useState<'receive' | 'adjust'>('receive');
  const [n, setN] = useState('');
  const [note, setNote] = useState('');
  const raw = Math.trunc(parseNum(n) || 0);
  const delta = mode === 'receive' ? Math.abs(raw) : raw;
  const moves = db.stockMoves.filter((m) => m.productId === product.id).slice(-8).reverse();
  const save = () => {
    if (run(() => adjustStock(product.id, delta, mode, note), 'موجودی به‌روزرسانی شد.')) onClose();
  };
  return (
    <Modal title={`موجودی «${product.name}»`} onClose={onClose} footer={<><button className="btn btn-primary" onClick={save} disabled={!delta}>ثبت</button><button className="btn btn-ghost" onClick={onClose}>انصراف</button></>}>
      <div className="row between"><span className="muted">موجودی فعلی</span><b className="num">{fa(product.stock)}</b></div>
      <div className="chips">
        <button className="chip" aria-pressed={mode === 'receive'} onClick={() => setMode('receive')}>ورود کالا (خرید)</button>
        <button className="chip" aria-pressed={mode === 'adjust'} onClick={() => setMode('adjust')}>اصلاح انبارگردانی (+/−)</button>
      </div>
      <Field label={mode === 'receive' ? 'تعداد ورودی' : 'مقدار اصلاح (منفی برای کسر)'}>
        <input className="input num" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} />
      </Field>
      <Field label="توضیح"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="شمارهٔ فاکتور خرید یا دلیل اصلاح" /></Field>
      {delta !== 0 && <div className="subtle">موجودی پس از ثبت: <b className="num">{fa(product.stock + delta)}</b></div>}
      {moves.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <b style={{ fontSize: 13 }}>گردش اخیر</b>
          {moves.map((m) => (
            <div key={m.id} className="row between subtle">
              <span>{{ sale: 'فروش', refund: 'مرجوعی', adjust: 'اصلاح', receive: 'ورود', initial: 'اولیه' }[m.reason]} {m.ref && `· ${m.ref}`}</span>
              <span className="num" dir="ltr">{m.delta > 0 ? '+' : ''}{fa(m.delta)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
