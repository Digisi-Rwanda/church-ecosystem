import type { CollectionItem, CollectionMonth } from '../api/frontDoorApi';
import { csvCell } from './money';

/** A giving typed by the treasurer: empty or 0 is fine (nothing of that kind was given); anything else must be whole francs. */
export function parseGiving(v: string): number | null {
  const clean = v.replace(/[\s,]/g, '');
  if (clean === '') return 0;
  if (!/^\d{1,10}$/.test(clean)) return null;
  return Number(clean);
}

const ERROR_KEYS: Record<string, string> = {
  AMOUNT: 'door.coll.err.amount',
  BAD_DATE: 'door.coll.err.date',
  BAD_INPUT: 'door.coll.err.incomplete',
  REASON_REQUIRED: 'door.money.err.reason',
  WRONG_STATE: 'door.coll.err.wrongState',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
};
export const collectionErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

/** Twelve months of the year, with the months that had no collection shown as zero, so a chart never skips one. */
export function yearMonths(year: number, byMonth: CollectionMonth[]): CollectionMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    return byMonth.find((m) => m.month === month) ?? { month, tithe: 0, offering: 0, other: 0, total: 0, count: 0 };
  });
}

/** The year's collections as a spreadsheet file (CSV), newest last. Amounts are whole francs; a cancelled one keeps its reason. */
export function collectionsToCsv(items: CollectionItem[], head: string[]): string {
  const rows = [...items]
    .sort((a, b) => `${a.heldOn} ${a.startsAt ?? ''}`.localeCompare(`${b.heldOn} ${b.startsAt ?? ''}`))
    .map((i) => [i.heldOn, i.startsAt, i.kind, i.title, i.tithe, i.offering, i.other, i.status === 'VOIDED' ? 0 : i.total, i.status, i.voidReason, i.note, i.recordedByName]);
  return [head, ...rows].map((r) => r.map((c) => csvCell(c as string | number | null)).join(',')).join('\r\n');
}
