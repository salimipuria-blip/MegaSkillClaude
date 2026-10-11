import { useSyncExternalStore } from 'react';
import type { CartLine } from './sales';
import { computeCart, paymentsBalance, refundedQty, unitPaid } from './sales';
import type { Customer, DB, HeldCart, Payment, Product, RoleId, Sale, Settings, Shift, User } from './types';
import { can, canManageRole, type Permission } from './permissions';
import { DEFAULT_PASSWORDS, SCHEMA_VERSION, cleanStart, defaultSettings, seedDemo } from './seed';
import { hashPassword, randomSalt, uid, verifyPassword } from '../lib/crypto';
import { addDays } from '../lib/format';

const DB_KEY = 'cham.db.v1';
const SESSION_KEY = 'cham.session';

export class ActionError extends Error {}
const fail = (msg: string): never => {
  throw new ActionError(msg);
};

/* ------------------------------------------------------------------ */
/* Safe storage — never let a blocked/full storage crash the register  */
/* ------------------------------------------------------------------ */

const memory = new Map<string, string>();
function storageGet(key: string, session = false): string | null {
  try {
    return (session ? sessionStorage : localStorage).getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}
function storageSet(key: string, value: string, session = false): boolean {
  try {
    (session ? sessionStorage : localStorage).setItem(key, value);
    return true;
  } catch {
    memory.set(key, value);
    return false;
  }
}
function storageRemove(key: string, session = false) {
  try {
    (session ? sessionStorage : localStorage).removeItem(key);
  } catch {
    memory.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* Validation & migration                                              */
/* ------------------------------------------------------------------ */

export function isValidDB(x: unknown): x is DB {
  if (!x || typeof x !== 'object') return false;
  const d = x as Partial<DB>;
  return (
    typeof d.schema === 'number' &&
    !!d.settings &&
    !!d.license &&
    Array.isArray(d.users) &&
    d.users.some((u) => u && u.role === 'owner') &&
    Array.isArray(d.products) &&
    Array.isArray(d.customers) &&
    Array.isArray(d.sales)
  );
}

/** Fill any missing fields so older backups keep working after upgrades. */
export function migrate(d: DB): DB {
  const base = defaultSettings();
  // v1 → v2: login became password-only, so shared role passwords had to become unique.
  // Accounts that never left their default password get the new per-account default.
  const users = (d.schema ?? 1) < 2
    ? d.users.map((u) => (u.mustChangePassword && DEFAULT_PASSWORDS[u.id] ? { ...u, salt: `${u.id}-salt`, passwordHash: hashPassword(DEFAULT_PASSWORDS[u.id], `${u.id}-salt`) } : u))
    : d.users;
  return {
    ...d,
    schema: SCHEMA_VERSION,
    settings: { ...base, ...d.settings, discountLimits: { ...base.discountLimits, ...(d.settings?.discountLimits ?? {}) } },
    heldCarts: d.heldCarts ?? [],
    shifts: d.shifts ?? [],
    stockMoves: d.stockMoves ?? [],
    audit: d.audit ?? [],
    saleCounter: d.saleCounter ?? 1000 + d.sales.length,
    users,
    authGuard: d.authGuard ?? { fails: 0, lockedUntil: 0 },
  };
}

function load(): DB {
  const raw = storageGet(DB_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isValidDB(parsed)) return migrate(parsed);
      storageSet(`cham.db.corrupt.${Date.now()}`, raw);
    } catch {
      storageSet(`cham.db.corrupt.${Date.now()}`, raw);
    }
  }
  const fresh = seedDemo(Date.now());
  storageSet(DB_KEY, JSON.stringify(fresh));
  return fresh;
}

/* ------------------------------------------------------------------ */
/* Store core                                                          */
/* ------------------------------------------------------------------ */

let db: DB = load();
let session: { userId: string | null } = { userId: storageGet(SESSION_KEY, true) };
let persistWarning = false;
const listeners = new Set<() => void>();
let snapshot = { db, session, persistWarning };

function emit() {
  snapshot = { db, session, persistWarning };
  listeners.forEach((l) => l());
}

function commit(next: DB) {
  db = next;
  persistWarning = !storageSet(DB_KEY, JSON.stringify(db));
  emit();
}

function mutate(fn: (d: DB) => void) {
  const draft = structuredClone(db);
  fn(draft);
  commit(draft);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== DB_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue);
      if (isValidDB(parsed)) {
        db = migrate(parsed);
        emit();
      }
    } catch {
      /* ignore foreign writes */
    }
  });
}

export function useStore() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

export const getDB = () => db;

function audit(d: DB, action: string, detail: string) {
  d.audit.push({ id: uid('a-'), at: Date.now(), userId: session.userId, action, detail });
  if (d.audit.length > 3000) d.audit.splice(0, d.audit.length - 3000);
}

export function currentUser(d: DB = db): User | null {
  return d.users.find((u) => u.id === session.userId && u.active) ?? null;
}

function requireUser(): User {
  return currentUser() ?? fail('نشست شما منقضی شده است. دوباره وارد شوید.');
}

function need(perm: Permission): User {
  const u = requireUser();
  if (!can(u.role, perm)) fail('شما مجوز این عملیات را ندارید.');
  return u;
}

/* ------------------------------------------------------------------ */
/* License                                                             */
/* ------------------------------------------------------------------ */

export type LicenseState = 'active' | 'expiring' | 'grace' | 'expired';

export function licenseState(d: DB, now = Date.now()): { state: LicenseState; daysLeft: number } {
  const daysLeft = Math.ceil((d.license.expiresAt - now) / 86_400_000);
  if (daysLeft > 7) return { state: 'active', daysLeft };
  if (daysLeft > 0) return { state: 'expiring', daysLeft };
  if (daysLeft > -d.license.graceDays) return { state: 'grace', daysLeft };
  return { state: 'expired', daysLeft };
}

export function renewLicense(plan: 'monthly' | 'yearly') {
  need('system.license');
  mutate((d) => {
    const base = Math.max(Date.now(), d.license.expiresAt);
    d.license.plan = plan;
    d.license.expiresAt = addDays(base, plan === 'yearly' ? 365 : 30);
    audit(d, 'license.renew', plan === 'yearly' ? 'تمدید سالانه' : 'تمدید ماهانه');
  });
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const MIN_PASSWORD = 6;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;

/**
 * Password-only sign-in: the password itself identifies the user (and so the
 * position). Passwords are therefore kept unique across all accounts.
 * Brute force is throttled globally because no account is chosen up front.
 */
export function login(password: string): { ok: true; mustChange: boolean; user: User } | { ok: false; error: string } {
  const now = Date.now();
  const guard = db.authGuard;
  if (guard.lockedUntil > now) {
    return { ok: false, error: `به‌دلیل تلاش‌های ناموفق، ${Math.ceil((guard.lockedUntil - now) / 1000).toLocaleString('fa-IR')} ثانیه صبر کنید.` };
  }
  const matches = password ? db.users.filter((u) => u.active && verifyPassword(password, u.salt, u.passwordHash)) : [];
  if (matches.length !== 1) {
    mutate((d) => {
      d.authGuard.fails += 1;
      if (d.authGuard.fails >= MAX_ATTEMPTS) {
        d.authGuard.lockedUntil = now + LOCK_MS;
        d.authGuard.fails = 0;
      }
      d.audit.push({ id: uid('a-'), at: now, userId: null, action: 'auth.fail', detail: matches.length > 1 ? 'رمز مشترک بین چند کاربر' : 'رمز نادرست' });
    });
    return {
      ok: false,
      error: matches.length > 1 ? 'این رمز برای بیش از یک کاربر ثبت شده است؛ مدیر باید رمز را بازنشانی کند.' : 'رمز عبور نادرست است.',
    };
  }
  const user = matches[0];
  session = { userId: user.id };
  storageSet(SESSION_KEY, user.id, true);
  mutate((d) => {
    d.authGuard = { fails: 0, lockedUntil: 0 };
    d.audit.push({ id: uid('a-'), at: now, userId: user.id, action: 'auth.login', detail: 'ورود به سامانه' });
  });
  return { ok: true, mustChange: user.mustChangePassword && db.settings.forcePasswordChange, user };
}

export function logout() {
  if (session.userId) mutate((d) => audit(d, 'auth.logout', 'خروج'));
  session = { userId: null };
  storageRemove(SESSION_KEY, true);
  emit();
}

export function changeOwnPassword(current: string, next: string) {
  const u = requireUser();
  if (!verifyPassword(current, u.salt, u.passwordHash)) fail('رمز فعلی نادرست است.');
  if (verifyPassword(next, u.salt, u.passwordHash)) fail('رمز جدید باید با رمز فعلی متفاوت باشد.');
  setPassword(u.id, next, false);
}

/** Throws unless the password is long enough and not used by any other account. */
function assertPasswordUsable(next: string, ownerId: string | null) {
  if (next.length < MIN_PASSWORD) fail(`رمز باید حداقل ${MIN_PASSWORD.toLocaleString('fa-IR')} کاراکتر باشد.`);
  // Deliberately vague: never confirm that another account uses this password.
  if (db.users.some((u) => u.id !== ownerId && verifyPassword(next, u.salt, u.passwordHash))) fail('این رمز قابل استفاده نیست؛ رمز دیگری انتخاب کنید.');
}

function setPassword(userId: string, next: string, forceChange: boolean) {
  assertPasswordUsable(next, userId);
  mutate((d) => {
    const u = d.users.find((x) => x.id === userId) ?? fail('کاربر یافت نشد.');
    u.salt = randomSalt();
    u.passwordHash = hashPassword(next, u.salt);
    u.mustChangePassword = forceChange;
    audit(d, 'auth.password', `تغییر رمز: ${u.name}`);
  });
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

export function saveUser(input: { id?: string; name: string; role: RoleId; active: boolean; monthlyTarget: number; commissionPct: number; password?: string }) {
  const actor = need('staff.manage');
  const name = input.name.trim();
  if (!name) fail('نام کاربر را وارد کنید.');
  if (!canManageRole(actor.role, input.role)) fail('اجازهٔ تعریف کاربر با این پوزیشن را ندارید.');
  if (input.id) {
    const existing = db.users.find((u) => u.id === input.id) ?? fail('کاربر یافت نشد.');
    if (existing.id !== actor.id && !canManageRole(actor.role, existing.role)) fail('اجازهٔ ویرایش این کاربر را ندارید.');
    if (existing.role === 'owner' && (input.role !== 'owner' || !input.active) && db.users.filter((u) => u.role === 'owner' && u.active).length <= 1)
      fail('سیستم باید حداقل یک مالک فعال داشته باشد.');
    if (existing.id === actor.id && !input.active) fail('نمی‌توانید حساب خودتان را غیرفعال کنید.');
    if (input.password) assertPasswordUsable(input.password, existing.id);
    mutate((d) => {
      const u = d.users.find((x) => x.id === input.id)!;
      Object.assign(u, { name, role: input.role, active: input.active, monthlyTarget: Math.max(0, input.monthlyTarget || 0), commissionPct: Math.max(0, Math.min(100, input.commissionPct || 0)) });
      audit(d, 'staff.update', name);
    });
    if (input.password) setPassword(input.id, input.password, true);
  } else {
    const password = input.password || fail('رمز اولیه را وارد کنید.');
    assertPasswordUsable(password, null);
    const salt = randomSalt();
    mutate((d) => {
      d.users.push({
        id: uid('u-'),
        name,
        role: input.role,
        salt,
        passwordHash: hashPassword(password, salt),
        active: input.active,
        mustChangePassword: true,
        monthlyTarget: Math.max(0, input.monthlyTarget || 0),
        commissionPct: Math.max(0, Math.min(100, input.commissionPct || 0)),
        createdAt: Date.now(),
      });
      audit(d, 'staff.create', name);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Catalogue & inventory                                               */
/* ------------------------------------------------------------------ */

export function saveProduct(input: Omit<Product, 'id' | 'createdAt' | 'stock'> & { id?: string; stock?: number }) {
  const actor = need('products.edit');
  const name = input.name.trim();
  if (!name) fail('نام کالا را وارد کنید.');
  if (!(input.price > 0)) fail('قیمت فروش باید بیشتر از صفر باشد.');
  if (input.cost < 0) fail('قیمت خرید نامعتبر است.');
  const sku = input.sku.trim();
  const barcode = input.barcode.trim();
  if (sku && db.products.some((p) => p.sku === sku && p.id !== input.id)) fail('این کد کالا قبلاً ثبت شده است.');
  if (barcode && db.products.some((p) => p.barcode === barcode && p.id !== input.id)) fail('این بارکد قبلاً ثبت شده است.');
  mutate((d) => {
    if (input.id) {
      const p = d.products.find((x) => x.id === input.id) ?? fail('کالا یافت نشد.');
      Object.assign(p, { name, sku, barcode, category: input.category.trim() || 'عمومی', price: Math.round(input.price), cost: Math.round(input.cost), minStock: Math.max(0, input.minStock), active: input.active });
      audit(d, 'product.update', name);
    } else {
      const id = uid('p-');
      const stock = Math.max(0, Math.floor(input.stock ?? 0));
      d.products.push({ id, name, sku: sku || `CH-${d.products.length + 1001}`, barcode, category: input.category.trim() || 'عمومی', price: Math.round(input.price), cost: Math.round(input.cost), stock, minStock: Math.max(0, input.minStock), active: input.active, createdAt: Date.now() });
      if (stock) d.stockMoves.push({ id: uid('m-'), at: Date.now(), productId: id, delta: stock, reason: 'initial', by: actor.id, ref: '' });
      audit(d, 'product.create', name);
    }
  });
}

export function adjustStock(productId: string, delta: number, reason: 'adjust' | 'receive', note = '') {
  const actor = need('inventory.adjust');
  if (!Number.isInteger(delta) || delta === 0) fail('تعداد نامعتبر است.');
  mutate((d) => {
    const p = d.products.find((x) => x.id === productId) ?? fail('کالا یافت نشد.');
    if (p.stock + delta < 0 && !d.settings.allowNegativeStock) fail('موجودی نمی‌تواند منفی شود.');
    p.stock += delta;
    d.stockMoves.push({ id: uid('m-'), at: Date.now(), productId, delta, reason, by: actor.id, ref: note });
    audit(d, 'inventory.adjust', `${p.name}: ${delta > 0 ? '+' : ''}${delta}${note ? ` (${note})` : ''}`);
  });
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export function normalizePhone(phone: string): string {
  return phone.replace(/[۰-۹]/g, (x) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x))).replace(/[٠-٩]/g, (x) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(x))).replace(/\D/g, '');
}

export function saveCustomer(input: { id?: string; name: string; phone: string; note: string }): Customer {
  need('customers.edit');
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);
  if (!name) fail('نام مشتری را وارد کنید.');
  if (!/^0?9\d{9}$/.test(phone)) fail('شمارهٔ موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷).');
  const full = phone.startsWith('0') ? phone : `0${phone}`;
  if (db.customers.some((c) => c.phone === full && c.id !== input.id)) fail('مشتری با این شماره قبلاً ثبت شده است.');
  let saved!: Customer;
  mutate((d) => {
    if (input.id) {
      const c = d.customers.find((x) => x.id === input.id) ?? fail('مشتری یافت نشد.');
      Object.assign(c, { name, phone: full, note: input.note.trim() });
      saved = c;
      audit(d, 'customer.update', name);
    } else {
      saved = { id: uid('c-'), name, phone: full, note: input.note.trim(), points: 0, createdAt: Date.now(), lastContactAt: 0 };
      d.customers.push(saved);
      audit(d, 'customer.create', name);
    }
  });
  return saved;
}

export function markContacted(customerId: string) {
  need('customers.edit');
  mutate((d) => {
    const c = d.customers.find((x) => x.id === customerId) ?? fail('مشتری یافت نشد.');
    c.lastContactAt = Date.now();
    audit(d, 'growth.contact', `تماس بازگشت: ${c.name}`);
  });
}

/* ------------------------------------------------------------------ */
/* Shifts                                                              */
/* ------------------------------------------------------------------ */

export function openShiftOf(d: DB, userId: string | null): Shift | null {
  return d.shifts.find((s) => s.userId === userId && s.closedAt === null) ?? null;
}

export function openShift(openingCash: number) {
  const u = need('shifts.own');
  if (openShiftOf(db, u.id)) fail('شیفت باز دارید.');
  if (!(openingCash >= 0)) fail('موجودی اول شیفت نامعتبر است.');
  mutate((d) => {
    d.shifts.push({ id: uid('sh-'), userId: u.id, openedAt: Date.now(), openingCash: Math.round(openingCash), closedAt: null, countedCash: null, expectedCash: null, note: '' });
    audit(d, 'shift.open', `موجودی اول: ${Math.round(openingCash).toLocaleString('fa-IR')}`);
  });
}

export function expectedCash(d: DB, shift: Shift): number {
  let cash = shift.openingCash;
  for (const s of d.sales) {
    if (s.shiftId !== shift.id) continue;
    cash += s.payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0);
  }
  for (const s of d.sales) for (const r of s.refunds) if (r.at >= shift.openedAt && r.by === shift.userId && (shift.closedAt === null || r.at <= shift.closedAt)) cash -= r.amount;
  return cash;
}

export function closeShift(countedCash: number, note: string) {
  const u = need('shifts.own');
  const sh = openShiftOf(db, u.id) ?? fail('شیفت بازی ندارید.');
  if (!(countedCash >= 0)) fail('مبلغ شمارش‌شده نامعتبر است.');
  mutate((d) => {
    const s = d.shifts.find((x) => x.id === sh.id)!;
    s.expectedCash = expectedCash(d, s);
    s.countedCash = Math.round(countedCash);
    s.closedAt = Date.now();
    s.note = note.trim();
    audit(d, 'shift.close', `اختلاف صندوق: ${(s.countedCash - s.expectedCash).toLocaleString('fa-IR')}`);
  });
}

/* ------------------------------------------------------------------ */
/* POS                                                                 */
/* ------------------------------------------------------------------ */

export interface CheckoutInput {
  lines: { productId: string; qty: number }[];
  discount: number;
  pointsRedeem: number;
  customerId: string | null;
  consultantId: string | null;
  payments: Payment[];
  heldCartId?: string | null;
}

export function buildLines(d: DB, lines: { productId: string; qty: number }[]): CartLine[] {
  return lines
    .map((l) => {
      const p = d.products.find((x) => x.id === l.productId);
      return p ? { productId: p.id, name: p.name, price: p.price, cost: p.cost, qty: l.qty } : null;
    })
    .filter((x): x is CartLine => !!x && x.qty > 0);
}

export function checkout(input: CheckoutInput): Sale {
  const u = need('pos.use');
  const lic = licenseState(db);
  if (lic.state === 'expired') fail('اشتراک سامانه منقضی شده است. لطفاً با FJCOD تماس بگیرید.');
  const shift = openShiftOf(db, u.id) ?? fail('برای فروش، ابتدا شیفت صندوق را باز کنید.');
  const lines = buildLines(db, input.lines);
  if (lines.length === 0) fail('سبد خرید خالی است.');
  for (const l of lines) {
    const p = db.products.find((x) => x.id === l.productId)!;
    if (!p.active) fail(`کالای «${p.name}» غیرفعال است.`);
    if (!db.settings.allowNegativeStock && p.stock < l.qty) fail(`موجودی «${p.name}» کافی نیست (موجود: ${p.stock.toLocaleString('fa-IR')}).`);
  }
  const customer = input.customerId ? db.customers.find((c) => c.id === input.customerId) ?? fail('مشتری یافت نشد.') : null;
  const t = computeCart({
    lines,
    discount: input.discount,
    pointsRedeem: customer ? input.pointsRedeem : 0,
    pointValue: db.settings.pointValue,
    availablePoints: customer?.points ?? 0,
    taxPct: db.settings.taxPct,
    tomanPerPoint: db.settings.tomanPerPoint,
  });
  const limit = db.settings.discountLimits[u.role] ?? 0;
  if (t.subtotal > 0 && (t.discount / t.subtotal) * 100 > limit + 1e-9) fail(`سقف تخفیف مجاز برای پوزیشن شما ${limit.toLocaleString('fa-IR')}٪ است.`);
  const payments = input.payments.filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: Math.round(p.amount) }));
  const balance = paymentsBalance(t.total, payments);
  if (balance < 0) fail(`مبلغ پرداخت ${(-balance).toLocaleString('fa-IR')} تومان کمتر از مبلغ فاکتور است.`);
  if (balance > 0 && !payments.some((p) => p.method === 'cash')) fail('مبلغ پرداختی بیشتر از فاکتور است.');
  // Overpaid cash is change returned to the customer — store what was actually kept.
  if (balance > 0) {
    const cash = payments.find((p) => p.method === 'cash')!;
    if (cash.amount < balance) fail('مبلغ پرداختی نامعتبر است.');
    cash.amount -= balance;
  }
  if (payments.some((p) => p.method === 'credit') && !customer) fail('فروش نسیه فقط با انتخاب مشتری ممکن است.');
  let sale!: Sale;
  mutate((d) => {
    d.saleCounter += 1;
    sale = {
      id: uid('s-'),
      number: d.saleCounter,
      at: Date.now(),
      cashierId: u.id,
      consultantId: input.consultantId,
      customerId: customer?.id ?? null,
      shiftId: shift.id,
      items: lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, price: l.price, cost: l.cost })),
      subtotal: t.subtotal,
      discount: t.discount,
      pointsRedeemed: t.pointsRedeemed,
      pointsValue: t.pointsValue,
      tax: t.tax,
      total: t.total,
      payments: payments.filter((p) => p.amount > 0),
      pointsEarned: customer ? t.pointsEarned : 0,
      refunds: [],
    };
    d.sales.push(sale);
    for (const l of lines) {
      const p = d.products.find((x) => x.id === l.productId)!;
      p.stock -= l.qty;
      d.stockMoves.push({ id: uid('m-'), at: sale.at, productId: p.id, delta: -l.qty, reason: 'sale', by: u.id, ref: String(sale.number) });
    }
    if (customer) {
      const c = d.customers.find((x) => x.id === customer.id)!;
      c.points = c.points - t.pointsRedeemed + sale.pointsEarned;
    }
    if (input.heldCartId) d.heldCarts = d.heldCarts.filter((h) => h.id !== input.heldCartId);
    audit(d, 'sale.create', `فاکتور ${sale.number.toLocaleString('fa-IR')} — ${t.total.toLocaleString('fa-IR')} تومان`);
  });
  return sale;
}

export function holdCart(input: { label: string; customerId: string | null; items: { productId: string; qty: number }[] }): HeldCart {
  const u = need('pos.hold');
  if (input.items.length === 0) fail('سبد خالی است.');
  const cart: HeldCart = { id: uid('h-'), at: Date.now(), by: u.id, label: input.label.trim() || 'سبد پیشنهادی', customerId: input.customerId, items: input.items };
  mutate((d) => {
    d.heldCarts.push(cart);
    audit(d, 'pos.hold', `ارسال سبد به صندوق: ${cart.label}`);
  });
  return cart;
}

export function removeHeldCart(id: string) {
  const u = requireUser();
  const cart = db.heldCarts.find((h) => h.id === id) ?? fail('سبد یافت نشد.');
  if (cart.by !== u.id && !can(u.role, 'pos.use')) fail('اجازهٔ حذف این سبد را ندارید.');
  mutate((d) => {
    d.heldCarts = d.heldCarts.filter((h) => h.id !== id);
    audit(d, 'pos.hold.remove', cart.label);
  });
}

export function refundSale(saleId: string, items: { productId: string; qty: number }[], reason: string) {
  const u = need('sales.refund');
  const sale = db.sales.find((s) => s.id === saleId) ?? fail('فاکتور یافت نشد.');
  const rItems = items.filter((i) => i.qty > 0).map((i) => {
    const it = sale.items.find((x) => x.productId === i.productId) ?? fail('قلم نامعتبر.');
    const left = it.qty - refundedQty(sale, i.productId);
    if (!Number.isInteger(i.qty) || i.qty > left) fail(`حداکثر قابل مرجوع برای «${it.name}»: ${left.toLocaleString('fa-IR')}`);
    return { productId: i.productId, qty: i.qty, amount: unitPaid(sale, it) * i.qty };
  });
  if (rItems.length === 0) fail('هیچ قلمی برای مرجوعی انتخاب نشده است.');
  const already = sale.refunds.reduce((a, r) => a + r.amount, 0);
  let amount = rItems.reduce((a, i) => a + i.amount, 0);
  amount = Math.min(amount, sale.total - already);
  mutate((d) => {
    const s = d.sales.find((x) => x.id === saleId)!;
    const refund = { id: uid('r-'), at: Date.now(), by: u.id, items: rItems, amount, reason: reason.trim() || 'مرجوعی' };
    s.refunds.push(refund);
    for (const i of rItems) {
      const p = d.products.find((x) => x.id === i.productId);
      if (p) {
        p.stock += i.qty;
        d.stockMoves.push({ id: uid('m-'), at: refund.at, productId: p.id, delta: i.qty, reason: 'refund', by: u.id, ref: String(s.number) });
      }
    }
    if (s.customerId && s.total > 0) {
      const c = d.customers.find((x) => x.id === s.customerId);
      if (c) c.points = Math.max(0, c.points - Math.floor((s.pointsEarned * amount) / s.total));
    }
    audit(d, 'sale.refund', `مرجوعی فاکتور ${s.number.toLocaleString('fa-IR')} — ${amount.toLocaleString('fa-IR')} تومان`);
  });
}

/* ------------------------------------------------------------------ */
/* Settings & system                                                   */
/* ------------------------------------------------------------------ */

export function saveSettings(patch: Partial<Settings>) {
  const u = need('settings.store');
  if (patch.monthlyStoreTarget !== undefined && !can(u.role, 'targets.manage')) fail('مجوز تعیین هدف ندارید.');
  mutate((d) => {
    d.settings = { ...d.settings, ...patch, discountLimits: { ...d.settings.discountLimits, ...(patch.discountLimits ?? {}) } };
    audit(d, 'settings.update', Object.keys(patch).join('، '));
  });
}

export function saveStoreTarget(target: number) {
  need('targets.manage');
  if (!(target >= 0)) fail('هدف نامعتبر است.');
  mutate((d) => {
    d.settings.monthlyStoreTarget = Math.round(target);
    audit(d, 'growth.target', `هدف ماهانه: ${Math.round(target).toLocaleString('fa-IR')}`);
  });
}

export function exportBackup(): string {
  need('system.backup');
  mutate((d) => audit(d, 'system.backup', 'خروجی پشتیبان'));
  return JSON.stringify(db, null, 1);
}

export function importBackup(json: string) {
  need('system.backup');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail('فایل پشتیبان قابل خواندن نیست.');
  }
  if (!isValidDB(parsed)) fail('ساختار فایل پشتیبان معتبر نیست.');
  const next = migrate(parsed as DB);
  // keep the current operator signed in only if they still exist
  commit(next);
  mutate((d) => audit(d, 'system.restore', 'بازیابی از پشتیبان'));
  if (!currentUser()) logout();
}

export function resetToDemo() {
  need('system.backup');
  const keepSession = session.userId;
  commit(seedDemo(Date.now()));
  session = { userId: db.users.some((u) => u.id === keepSession) ? keepSession : null };
  if (!session.userId) storageRemove(SESSION_KEY, true);
  emit();
}

export function startClean() {
  need('system.backup');
  commit(cleanStart(db, Date.now()));
}

export { can } from './permissions';
export type { Permission };
