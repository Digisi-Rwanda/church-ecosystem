/** Bar heights (0 to `maxHeight`) for values against a ceiling; never negative, never above the ceiling. */
export function chartBars(values: number[], ceiling: number, maxHeight: number): Array<{ value: number; height: number }> {
  const top = ceiling > 0 ? ceiling : 1;
  return values.map((v) => {
    const clean = Number.isFinite(v) && v > 0 ? v : 0;
    return { value: clean, height: Math.round((Math.min(clean, top) / top) * maxHeight) };
  });
}

/** "05 Oct" style short day from an ISO day, in UTC so the label never shifts with the time zone. */
export function shortDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/** A bar with a 4px rounded top and a square foot on the baseline, as an SVG path. */
export function roundedTopBar(x: number, y: number, w: number, h: number, r = 4): string {
  const rad = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0 || w <= 0) return '';
  return `M${x},${y + h} V${y + rad} Q${x},${y} ${x + rad},${y} H${x + w - rad} Q${x + w},${y} ${x + w},${y + rad} V${y + h} Z`;
}

/** 1,200,000 becomes "1.2M" and 12,500 becomes "12.5k": short enough to sit above a bar. */
export function compactNumber(n: number): string {
  const v = Math.abs(n);
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  if (v >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (v >= 1_000) return `${trim(n / 1_000)}k`;
  return String(Math.round(n));
}

/** "2026-10" as a short month name in UTC, for chart labels. */
export function shortMonth(ym: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
}
