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
