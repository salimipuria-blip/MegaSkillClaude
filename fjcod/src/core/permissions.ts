import type { RoleId } from './types';

export type Permission =
  | 'dashboard.store' // store-wide KPIs
  | 'growth.view'
  | 'pos.use'
  | 'pos.hold' // build a cart and send it to the cashier queue
  | 'sales.viewAll'
  | 'sales.viewOwn'
  | 'sales.refund'
  | 'products.view'
  | 'products.edit'
  | 'inventory.adjust'
  | 'customers.view'
  | 'customers.edit'
  | 'shifts.own'
  | 'shifts.viewAll'
  | 'reports.view'
  | 'staff.manage'
  | 'targets.manage'
  | 'settings.store'
  | 'system.license'
  | 'system.backup'
  | 'audit.view';

export interface RoleDef {
  id: RoleId;
  title: string;
  titleEn: string;
  description: string;
  rank: number;
  permissions: Permission[];
}

const ALL: Permission[] = [
  'dashboard.store', 'growth.view', 'pos.use', 'pos.hold', 'sales.viewAll', 'sales.viewOwn',
  'sales.refund', 'products.view', 'products.edit', 'inventory.adjust', 'customers.view',
  'customers.edit', 'shifts.own', 'shifts.viewAll', 'reports.view', 'staff.manage',
  'targets.manage', 'settings.store', 'system.license', 'system.backup', 'audit.view',
];

export const ROLES: Record<RoleId, RoleDef> = {
  owner: {
    id: 'owner',
    title: 'مالک سیستم',
    titleEn: 'FJCOD · System Owner',
    description: 'دسترسی کامل، مجوز و اشتراک، پشتیبان‌گیری و گزارش ممیزی',
    rank: 5,
    permissions: ALL,
  },
  manager: {
    id: 'manager',
    title: 'مدیر فروشگاه',
    titleEn: 'Store Manager',
    description: 'مدیریت کامل فروشگاه، کارکنان، اهداف رشد و گزارش‌ها',
    rank: 4,
    permissions: ALL.filter((p) => p !== 'system.license'),
  },
  deputy: {
    id: 'deputy',
    title: 'معاون فروشگاه',
    titleEn: 'Deputy Manager',
    description: 'فروش، مرجوعی، کالا و انبار، باشگاه مشتریان و گزارش‌ها',
    rank: 3,
    permissions: [
      'dashboard.store', 'growth.view', 'pos.use', 'pos.hold', 'sales.viewAll', 'sales.viewOwn',
      'sales.refund', 'products.view', 'products.edit', 'inventory.adjust', 'customers.view',
      'customers.edit', 'shifts.own', 'shifts.viewAll', 'reports.view',
    ],
  },
  cashier: {
    id: 'cashier',
    title: 'صندوقدار',
    titleEn: 'Cashier',
    description: 'صندوق فروش، شیفت و صورت‌حساب، ثبت مشتری',
    rank: 2,
    permissions: ['pos.use', 'pos.hold', 'sales.viewOwn', 'products.view', 'customers.view', 'customers.edit', 'shifts.own'],
  },
  consultant: {
    id: 'consultant',
    title: 'مشاور فروش',
    titleEn: 'Sales Consultant',
    description: 'سبد پیشنهادی برای صندوق، مشتریان، هدف و پورسانت شخصی',
    rank: 2,
    permissions: ['pos.hold', 'sales.viewOwn', 'products.view', 'customers.view', 'customers.edit', 'growth.view'],
  },
};

export const ROLE_ORDER: RoleId[] = ['owner', 'manager', 'deputy', 'cashier', 'consultant'];

export function can(role: RoleId | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  return ROLES[role].permissions.includes(perm);
}

/** A user may manage (create/edit/reset) only users of strictly lower rank. */
export function canManageRole(actor: RoleId, target: RoleId): boolean {
  if (!can(actor, 'staff.manage')) return false;
  if (actor === 'owner') return true;
  return ROLES[actor].rank > ROLES[target].rank;
}
