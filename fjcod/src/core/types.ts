export type RoleId = 'owner' | 'manager' | 'deputy' | 'cashier' | 'consultant';

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'credit';

export interface User {
  id: string;
  name: string;
  role: RoleId;
  passwordHash: string;
  salt: string;
  active: boolean;
  mustChangePassword: boolean;
  /** Monthly personal sales target in Toman (0 = none) */
  monthlyTarget: number;
  /** Commission percent on net sales attributed to this user */
  commissionPct: number;
  createdAt: number;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  active: boolean;
  createdAt: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  note: string;
  points: number;
  createdAt: number;
  /** Last time a staff member reached out (win-back loop) */
  lastContactAt: number;
}

export interface SaleItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
}

export interface Payment {
  method: PaymentMethod;
  amount: number;
}

export interface Refund {
  id: string;
  at: number;
  by: string;
  items: { productId: string; qty: number; amount: number }[];
  amount: number;
  reason: string;
}

export interface Sale {
  id: string;
  number: number;
  at: number;
  cashierId: string;
  consultantId: string | null;
  customerId: string | null;
  shiftId: string | null;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  pointsRedeemed: number;
  pointsValue: number;
  tax: number;
  total: number;
  payments: Payment[];
  pointsEarned: number;
  refunds: Refund[];
}

export interface HeldCart {
  id: string;
  at: number;
  by: string;
  label: string;
  customerId: string | null;
  items: { productId: string; qty: number }[];
}

export interface Shift {
  id: string;
  userId: string;
  openedAt: number;
  openingCash: number;
  closedAt: number | null;
  countedCash: number | null;
  expectedCash: number | null;
  note: string;
}

export interface AuditEntry {
  id: string;
  at: number;
  userId: string | null;
  action: string;
  detail: string;
}

export interface StockMove {
  id: string;
  at: number;
  productId: string;
  delta: number;
  reason: 'sale' | 'refund' | 'adjust' | 'receive' | 'initial';
  by: string;
  ref: string;
}

export interface Settings {
  storeName: string;
  storeNameEn: string;
  phone: string;
  address: string;
  taxPct: number;
  /** Toman spent per 1 loyalty point */
  tomanPerPoint: number;
  /** Toman value of 1 point when redeemed */
  pointValue: number;
  receiptFooter: string;
  allowNegativeStock: boolean;
  idleLockMinutes: number;
  /** Max cart discount percent per role */
  discountLimits: Record<RoleId, number>;
  monthlyStoreTarget: number;
  /** Days without purchase before a customer appears in the win-back list */
  winBackDays: number;
  forcePasswordChange: boolean;
}

export interface License {
  licensee: string;
  vendor: string;
  plan: 'monthly' | 'yearly';
  startedAt: number;
  expiresAt: number;
  graceDays: number;
}

export interface DB {
  schema: number;
  createdAt: number;
  settings: Settings;
  license: License;
  users: User[];
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  heldCarts: HeldCart[];
  shifts: Shift[];
  stockMoves: StockMove[];
  audit: AuditEntry[];
  saleCounter: number;
  /** Global sign-in throttle (password-only login has no account to lock) */
  authGuard: { fails: number; lockedUntil: number };
}
