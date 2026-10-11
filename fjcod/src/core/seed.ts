import type { Customer, DB, PaymentMethod, Product, Sale, Settings, User } from './types';
import type { RoleId } from './types';
import { hashPassword } from '../lib/crypto';
import { computeCart } from './sales';
import { addDays, startOfDay } from '../lib/format';

export const SCHEMA_VERSION = 2;

/**
 * First-login passwords, unique per account because the password alone
 * identifies the user. Every account must replace it on first sign-in.
 */
export const DEFAULT_PASSWORDS: Record<string, string> = {
  'u-owner': 'fjcod1405',
  'u-manager': '111111',
  'u-deputy': '222222',
  'u-cashier-1': '333331',
  'u-cashier-2': '333332',
  'u-cons-1': '444441',
  'u-cons-2': '444442',
  'u-cons-3': '444443',
};

export function defaultSettings(): Settings {
  return {
    storeName: 'چام',
    storeNameEn: 'CHAM',
    phone: '۰۲۱-۰۰۰۰۰۰۰۰',
    address: 'تهران',
    taxPct: 0,
    tomanPerPoint: 100_000,
    pointValue: 1_000,
    receiptFooter: 'از انتخاب شما سپاسگزاریم — چام؛ اصالت در هر جزئیات',
    allowNegativeStock: false,
    idleLockMinutes: 15,
    discountLimits: { owner: 100, manager: 100, deputy: 20, cashier: 10, consultant: 0 },
    monthlyStoreTarget: 2_500_000_000,
    winBackDays: 30,
    forcePasswordChange: true,
  };
}

/** Deterministic PRNG so demo data is identical on every device */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeUser(id: string, name: string, role: RoleId, now: number, extra: Partial<User> = {}): User {
  const salt = `${id}-salt`;
  return {
    id,
    name,
    role,
    salt,
    passwordHash: hashPassword(DEFAULT_PASSWORDS[id], salt),
    active: true,
    mustChangePassword: true,
    monthlyTarget: 0,
    commissionPct: 0,
    createdAt: now,
    ...extra,
  };
}

export function defaultUsers(now: number): User[] {
  return [
    makeUser('u-owner', 'FJCOD', 'owner', now),
    makeUser('u-manager', 'مدیر فروشگاه', 'manager', now),
    makeUser('u-deputy', 'معاون فروشگاه', 'deputy', now),
    makeUser('u-cashier-1', 'صندوقدار ۱', 'cashier', now),
    makeUser('u-cashier-2', 'صندوقدار ۲', 'cashier', now),
    makeUser('u-cons-1', 'مشاور ۱ — سارا', 'consultant', now, { monthlyTarget: 600_000_000, commissionPct: 2 }),
    makeUser('u-cons-2', 'مشاور ۲ — نیما', 'consultant', now, { monthlyTarget: 500_000_000, commissionPct: 2 }),
    makeUser('u-cons-3', 'مشاور ۳ — مهسا', 'consultant', now, { monthlyTarget: 450_000_000, commissionPct: 2 }),
  ];
}

const PRODUCTS: [string, string, number, number][] = [
  // name, category, price, stock
  ['پیراهن کتان دست‌دوز', 'پوشاک', 2_850_000, 24],
  ['کت تک پشمی کلاسیک', 'پوشاک', 9_400_000, 8],
  ['شلوار پارچه‌ای راسته', 'پوشاک', 3_200_000, 18],
  ['مانتو لینن ترمه‌دوزی', 'پوشاک', 5_600_000, 12],
  ['شال ابریشم سنتی', 'پوشاک', 2_400_000, 30],
  ['بافت کشمیر', 'پوشاک', 4_900_000, 10],
  ['کیف چرم طبیعی دستی', 'کیف و کفش', 7_800_000, 9],
  ['کیف پول چرم', 'کیف و کفش', 1_450_000, 35],
  ['کفش چرم کلاسیک', 'کیف و کفش', 6_300_000, 14],
  ['کمربند چرم سراجی', 'کیف و کفش', 1_250_000, 26],
  ['ساعت مچی استیل', 'اکسسوری', 8_900_000, 6],
  ['دستبند نقره میناکاری', 'اکسسوری', 3_100_000, 15],
  ['گردنبند فیروزه', 'اکسسوری', 4_200_000, 7],
  ['دکمه سردست نقره', 'اکسسوری', 1_900_000, 12],
  ['عینک آفتابی', 'اکسسوری', 3_600_000, 11],
  ['عطر عود اصیل ۵۰ میل', 'عطر', 5_200_000, 16],
  ['عطر گل محمدی ۳۰ میل', 'عطر', 2_700_000, 20],
  ['شمع معطر دست‌ساز', 'عطر', 690_000, 40],
  ['جعبه هدیه چام', 'هدیه', 350_000, 80],
  ['کارت هدیه ۱ میلیونی', 'هدیه', 1_000_000, 999],
  ['دستمال جیب ترمه', 'اکسسوری', 480_000, 50],
  ['پاپیون ابریشم', 'اکسسوری', 890_000, 22],
  ['جوراب نخی ممتاز', 'پوشاک', 290_000, 120],
  ['روسری نخی طرح اسلیمی', 'پوشاک', 1_150_000, 4],
];

const FIRST = ['سارا', 'علی', 'مریم', 'رضا', 'نگار', 'امیر', 'زهرا', 'حسین', 'لیلا', 'محمد', 'یاسمن', 'آرش', 'الهام', 'کاوه', 'شیما', 'بهرام', 'پریسا', 'سینا', 'نسترن', 'پویا'];
const LAST = ['احمدی', 'محمدی', 'کریمی', 'رضایی', 'حسینی', 'موسوی', 'جعفری', 'صادقی', 'نوری', 'رحیمی', 'کاظمی', 'تهرانی', 'شیرازی', 'اصفهانی'];

export function seedDemo(now: number): DB {
  const rnd = mulberry32(1405);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const settings = defaultSettings();
  const users = defaultUsers(now);
  const created = addDays(now, -150);

  const products: Product[] = PRODUCTS.map(([name, category, price, stock], i) => ({
    id: `p-${i + 1}`,
    sku: `CH-${String(1001 + i)}`,
    barcode: String(6260000000000 + (i + 1) * 7919),
    name,
    category,
    price,
    cost: Math.round((price * (0.52 + rnd() * 0.12)) / 1000) * 1000,
    stock,
    minStock: name.includes('کارت هدیه') ? 0 : 5,
    active: true,
    createdAt: created,
  }));

  const customers: Customer[] = Array.from({ length: 240 }, (_, i) => ({
    id: `c-${i + 1}`,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    phone: `0912${String(1000000 + Math.floor(rnd() * 8999999))}`,
    note: '',
    points: 0,
    createdAt: created,
    lastContactAt: 0,
  }));

  const cashiers = users.filter((u) => u.role === 'cashier');
  const consultants = users.filter((u) => u.role === 'consultant');
  const methods: PaymentMethod[] = ['card', 'card', 'card', 'cash', 'transfer'];
  const sales: Sale[] = [];
  let counter = 1000;
  const days = 120;
  const today = startOfDay(now);
  // A few "loyal" customers buy far more often — this makes repeat rate meaningful.
  const weightedCustomers = [...customers, ...customers.slice(0, 50), ...customers.slice(0, 50), ...customers.slice(0, 20), ...customers.slice(0, 20)];

  for (let d = days; d >= 0; d--) {
    const day = addDays(today, -d);
    const dow = (new Date(day).getDay() + 1) % 7; // Sat=0 … Fri=6
    const trend = 5 + ((days - d) / days) * 7; // gentle compounding growth
    const weekend = dow === 6 ? 0.55 : dow === 5 ? 1.25 : 1;
    const count = Math.max(1, Math.round(trend * weekend * (0.8 + rnd() * 0.4)));
    for (let k = 0; k < count; k++) {
      const hour = 10 + Math.floor(rnd() * 12);
      const at = day + hour * 3_600_000 + Math.floor(rnd() * 3_600_000);
      if (at > now) continue;
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 2.4) }, () => {
        const p = pick(products.slice(0, 23));
        return { productId: p.id, name: p.name, price: p.price, cost: p.cost, qty: rnd() < 0.85 ? 1 : 2 };
      });
      const merged = lines.reduce<typeof lines>((acc, l) => {
        const ex = acc.find((x) => x.productId === l.productId);
        if (ex) ex.qty += l.qty;
        else acc.push({ ...l });
        return acc;
      }, []);
      const customer = rnd() < 0.72 ? pick(weightedCustomers) : null;
      const subtotalGuess = merged.reduce((s, l) => s + l.price * l.qty, 0);
      const discount = rnd() < 0.18 ? Math.round((subtotalGuess * 0.05) / 10_000) * 10_000 : 0;
      const t = computeCart({ lines: merged, discount, pointsRedeem: 0, pointValue: settings.pointValue, availablePoints: 0, taxPct: settings.taxPct, tomanPerPoint: settings.tomanPerPoint });
      const consultant = rnd() < 0.65 ? pick(consultants) : null;
      const sale: Sale = {
        id: `s-${counter}`,
        number: ++counter,
        at,
        cashierId: pick(cashiers).id,
        consultantId: consultant ? consultant.id : null,
        customerId: customer ? customer.id : null,
        shiftId: null,
        items: merged.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, price: l.price, cost: l.cost })),
        subtotal: t.subtotal,
        discount: t.discount,
        pointsRedeemed: 0,
        pointsValue: 0,
        tax: t.tax,
        total: t.total,
        payments: [{ method: pick(methods), amount: t.total }],
        pointsEarned: customer ? t.pointsEarned : 0,
        refunds: [],
      };
      if (rnd() < 0.02) {
        const it = sale.items[0];
        const amount = Math.round((it.price * sale.total) / sale.subtotal);
        sale.refunds.push({ id: `r-${counter}`, at: at + 86_400_000, by: 'u-deputy', items: [{ productId: it.productId, qty: 1, amount }], amount, reason: 'تعویض سایز' });
      }
      if (customer) customer.points += sale.pointsEarned;
      sales.push(sale);
    }
  }

  return {
    schema: SCHEMA_VERSION,
    createdAt: now,
    settings,
    license: { licensee: 'چام', vendor: 'FJCOD', plan: 'yearly', startedAt: now, expiresAt: addDays(now, 365), graceDays: 7 },
    users,
    products,
    customers,
    sales: sales.sort((a, b) => a.at - b.at),
    heldCarts: [],
    shifts: [],
    stockMoves: [],
    audit: [{ id: 'a-init', at: now, userId: null, action: 'system.init', detail: 'راه‌اندازی اولیه با داده‌های نمایشی' }],
    saleCounter: counter,
    authGuard: { fails: 0, lockedUntil: 0 },
  };
}

/** Production start: keep users/settings/license, wipe demo catalogue and history. */
export function cleanStart(db: DB, now: number): DB {
  return {
    ...db,
    products: [],
    customers: [],
    sales: [],
    heldCarts: [],
    shifts: [],
    stockMoves: [],
    saleCounter: 1000,
    audit: [...db.audit, { id: `a-clean-${now}`, at: now, userId: null, action: 'system.clean', detail: 'شروع کار واقعی: داده‌های نمایشی حذف شد' }],
  };
}
