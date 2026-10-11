import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js';

import type { PaymentMethod } from '../core/types';

const nf = new Intl.NumberFormat('fa-IR');
const nf1 = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

export const fa = (n: number) => nf.format(Math.round(n));
export const fa1 = (n: number) => nf1.format(n);
export const toman = (n: number) => `${nf.format(Math.round(n))} تومان`;

/** Compact Toman for KPI tiles: 12.4 میلیون */
export function tomanShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${nf1.format(n / 1e9)} میلیارد`;
  if (a >= 1e6) return `${nf1.format(n / 1e6)} میلیون`;
  if (a >= 1e3) return `${nf1.format(n / 1e3)} هزار`;
  return nf.format(n);
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${nf1.format(Math.abs(n))}٪`;
}

/** Converts Persian/Arabic digits and separators to a plain number. Returns NaN if invalid. */
export function parseNum(input: string | number): number {
  if (typeof input === 'number') return input;
  const latin = input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,،٬\s]/g, '')
    .replace(/٫/g, '.');
  if (latin === '' || latin === '-') return NaN;
  return Number(latin);
}

export function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function jDate(ts: number): string {
  const d = new Date(ts);
  const j = toJalaali(d);
  return `${nf.format(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${String(j.jy).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[+x])}`;
}

export function jDateShort(ts: number): string {
  const j = toJalaali(new Date(ts));
  const p = (n: number) => String(n).padStart(2, '0');
  return fa0(`${j.jy}/${p(j.jm)}/${p(j.jd)}`);
}

export function jTime(ts: number): string {
  const d = new Date(ts);
  return fa0(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
}

export const jDateTime = (ts: number) => `${jDateShort(ts)} · ${jTime(ts)}`;

/** Convert latin digits inside a string to Persian digits */
export function fa0(s: string): string {
  return s.replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[+x]);
}

/* ---------- Calendar math (Iran: week starts Saturday, Jalali months) ---------- */

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Saturday 00:00 of the week containing ts */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const offset = (d.getDay() + 1) % 7; // Sat=0 … Fri=6
  return addDays(d.getTime(), -offset);
}

export function startOfJMonth(ts: number): number {
  const j = toJalaali(new Date(ts));
  const g = toGregorian(j.jy, j.jm, 1);
  return new Date(g.gy, g.gm - 1, g.gd).getTime();
}

export function addJMonths(ts: number, months: number): number {
  const j = toJalaali(new Date(ts));
  let m = j.jm - 1 + months;
  const y = j.jy + Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  const day = Math.min(j.jd, jalaaliMonthLength(y, m + 1));
  const g = toGregorian(y, m + 1, day);
  const src = new Date(ts);
  return new Date(g.gy, g.gm - 1, g.gd, src.getHours(), src.getMinutes(), src.getSeconds()).getTime();
}

export function jMonthLength(ts: number): number {
  const j = toJalaali(new Date(ts));
  return jalaaliMonthLength(j.jy, j.jm);
}

export function jMonthName(ts: number): string {
  return JALALI_MONTHS[toJalaali(new Date(ts)).jm - 1];
}

export function weekdayIndex(ts: number): number {
  return (new Date(ts).getDay() + 1) % 7;
}

export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'نقد', card: 'کارتخوان', transfer: 'کارت‌به‌کارت', credit: 'نسیه' };
