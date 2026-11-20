/** Run-sheet arithmetic for the screen: the same rules the server applies when it saves. */
export const toMinutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMinutes = (m: number): string => {
  const c = Math.max(0, Math.min(m, 24 * 60 - 1));
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
};
export const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export type Timed = { startTime: string; minutes: number };
export const endOf = (i: Timed): string => (validTime(i.startTime) ? fromMinutes(toMinutes(i.startTime) + i.minutes) : '');

export type RunFlag = 'OVERLAP' | 'OVERRUN';
/** For each item, what is wrong with it (empty when nothing). Items are in the order shown. */
export function runFlags(items: Timed[], endTime: string): RunFlag[][] {
  return items.map((it, i) => {
    const flags: RunFlag[] = [];
    if (!validTime(it.startTime)) return flags;
    const prev = i > 0 ? items[i - 1] : undefined;
    if (prev && validTime(prev.startTime) && toMinutes(it.startTime) < toMinutes(prev.startTime) + prev.minutes) flags.push('OVERLAP');
    if (endTime && validTime(endTime) && toMinutes(it.startTime) + it.minutes > toMinutes(endTime)) flags.push('OVERRUN');
    return flags;
  });
}

/** Lay the items one after another, keeping the first item's start. */
export function closeGaps<T extends Timed>(items: T[]): T[] {
  const first = items[0];
  if (!first || !validTime(first.startTime)) return items;
  let at = toMinutes(first.startTime);
  return items.map((it) => {
    const row = { ...it, startTime: fromMinutes(at) };
    at += it.minutes;
    return row;
  });
}

/** Where a new activity would start: right after the last one, or the service's start. */
export function nextStart(items: Timed[], serviceStart: string | null): string {
  const last = items[items.length - 1];
  if (last && validTime(last.startTime)) return fromMinutes(toMinutes(last.startTime) + last.minutes);
  return serviceStart && validTime(serviceStart) ? serviceStart : '09:00';
}
