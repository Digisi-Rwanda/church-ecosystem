/**
 * Home dashboards (slice 3.14). Pure helpers: which months to chart and how to count rows into them.
 * Months are Kigali months (UTC+2), the same rule Money uses, so a figure never moves between months.
 */
export const MONTHS_SHOWN = 6;

const kigali = (d: Date | string): Date => new Date(new Date(d).getTime() + 2 * 3600 * 1000);
export const monthOf = (d: Date | string): string => kigali(d).toISOString().slice(0, 7);

/** The last `n` month keys (YYYY-MM), oldest first, ending with the month of `now`. */
export function lastMonths(now: Date, n = MONTHS_SHOWN): string[] {
  const base = kigali(now);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  }
  return out;
}

/** Sum `amount(row)` of rows into each month; rows outside the months are ignored. */
export function sumByMonth<T>(rows: T[], months: string[], when: (r: T) => Date | string, amount: (r: T) => number): Array<{ label: string; value: number }> {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const r of rows) {
    const m = monthOf(when(r));
    if (totals.has(m)) totals.set(m, (totals.get(m) ?? 0) + amount(r));
  }
  return months.map((m) => ({ label: m, value: totals.get(m) ?? 0 }));
}

export interface Tile { key: string; value: number; format: 'count' | 'rwf'; tone?: 'warn'; href?: string }
export interface Series { key: string; format: 'count' | 'rwf'; points: Array<{ label: string; value: number }> }

/** Percent change from the earlier to the later figure; null when there is nothing to compare with. */
export const percentChange = (now: number, before: number): number | null => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
