/**
 * Calendar maths in church time. Kigali is UTC+2 all year (no daylight saving), so "today" is the Kigali day
 * and every anniversary is counted on calendar days, never on 24-hour spans.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Kigali as YYYY-MM-DD. */
export const kigaliDay = (now: Date): string => new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);

/** A real calendar day written YYYY-MM-DD (2025-02-30 is not one). */
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** The day part of a stored date, or null when it is not a real day. */
export const dayOf = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return isDay(s) ? s : null;
};

/**
 * Whole years from `from` to `today`. The anniversary counts on its own day; someone born (or baptised) on
 * 29 February reaches the anniversary on 1 March in years that have no 29 February. A day after `today` gives null.
 */
export function yearsBetween(from: string | null | undefined, today: string): number | null {
  const f = dayOf(from);
  if (!f || f > today) return null;
  let y = Number(today.slice(0, 4)) - Number(f.slice(0, 4));
  if (today.slice(5) < f.slice(5)) y--;
  return y;
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** `day` moved by whole days, months or years (a month-end day is kept inside the month: 31 March - 1 month = 28/29 February). */
export function shiftDay(day: string, amount: number, unit: 'days' | 'months' | 'years'): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  if (unit === 'days') return new Date(Date.UTC(y, m - 1, d + amount)).toISOString().slice(0, 10);
  const months = unit === 'years' ? amount * 12 : amount;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12), nm = (total % 12 + 12) % 12 + 1;
  const nd = Math.min(d, daysIn(ny, nm));
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}
