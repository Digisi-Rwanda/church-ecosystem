/**
 * The run-sheet of one service: the activities in order, each with a start time, a length and an owner.
 * The end of each item is worked out (start + length), never typed, and the sheet warns when items overlap
 * or run past the time the service is meant to end. Nothing here is built in: the church writes its own template.
 */
export const OWNER_KINDS = ['PERSON', 'PULPIT', 'CHOIR', 'PROTOCOL', 'TEXT'] as const;
export type OwnerKind = (typeof OWNER_KINDS)[number];
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_ITEMS = 60;
export const TITLE_MAX = 120;

export const toMinutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMinutes = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface TimedItem { startTime: string; minutes: number }

/** End of an item, as minutes since midnight (can pass 24:00; that is then an overrun, never wrapped). */
export const endMinutes = (i: TimedItem): number => toMinutes(i.startTime) + i.minutes;
export const endTimeOf = (i: TimedItem): string => fromMinutes(Math.min(endMinutes(i), 24 * 60 - 1));

export type Warning = { kind: 'OVERLAP' | 'OVERRUN'; index: number; with?: number };

/** Items are in the order shown. An item that starts before the previous one ends overlaps it; one that ends after `endTime` overruns. */
export function runWarnings(items: TimedItem[], endTime: string | null): Warning[] {
  const out: Warning[] = [];
  items.forEach((it, i) => {
    if (i > 0 && toMinutes(it.startTime) < endMinutes(items[i - 1]!)) out.push({ kind: 'OVERLAP', index: i, with: i - 1 });
    if (endTime && endMinutes(it) > toMinutes(endTime)) out.push({ kind: 'OVERRUN', index: i });
  });
  return out;
}

/** Lay template items one after another from the service's start time. */
export function chain<T extends { minutes: number }>(start: string, items: T[]): Array<T & { startTime: string }> {
  let at = toMinutes(start);
  return items.map((it) => {
    const row = { ...it, startTime: fromMinutes(Math.min(at, 24 * 60 - 1)) };
    at += it.minutes;
    return row;
  });
}

export interface OwnerInput { ownerKind: OwnerKind; personId?: string | null; roleId?: string | null; ownerLabel?: string | null }
/** What an owner of each kind needs. Returns a message, or null when it is complete. */
export function ownerProblem(o: OwnerInput): string | null {
  switch (o.ownerKind) {
    case 'PERSON': return o.personId ? null : 'Choose the person';
    case 'PULPIT': return o.roleId ? null : 'Choose the pulpit role';
    case 'TEXT': return (o.ownerLabel ?? '').trim() ? null : 'Type who is responsible';
    default: return null;
  }
}
