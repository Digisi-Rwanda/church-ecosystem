import type { PlanStatus, ScheduleSlot } from '../api/frontDoorApi';

const CHURCH_TZ = 'Africa/Kigali';

/** The current month in church time, as YYYY-MM. */
export function thisMonth(now: Date = new Date()): string {
  return new Date(now.getTime() + 2 * 3600 * 1000).toISOString().slice(0, 7);
}

/** Step a YYYY-MM month forwards or backwards. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month: string, locale?: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** The church-time day (YYYY-MM-DD) of a moment. */
export const dayOf = (iso: string): string => new Date(new Date(iso).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);

export function dayHeading(day: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
}

export function timeRange(startsAt: string, endsAt: string | null, locale?: string): string {
  const f = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: CHURCH_TZ });
  return endsAt ? `${f.format(new Date(startsAt))}–${f.format(new Date(endsAt))}` : f.format(new Date(startsAt));
}

/** Slots grouped by church-time day, days and slots in time order. */
export function groupByDay<T extends { startsAt: string }>(slots: T[]): Array<{ day: string; slots: T[] }> {
  const sorted = [...slots].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const out: Array<{ day: string; slots: T[] }> = [];
  for (const s of sorted) {
    const day = dayOf(s.startsAt);
    const last = out[out.length - 1];
    if (last && last.day === day) last.slots.push(s);
    else out.push({ day, slots: [s] });
  }
  return out;
}

/** An ISO time as the `datetime-local` value (church time) the form shows. */
export const toLocalInput = (iso: string | null): string => (iso ? new Date(new Date(iso).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 16) : '');

/** A `datetime-local` value read as church time (UTC+2), as ISO; null when it is not a time. */
export function fromLocalInput(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00Z`);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() - 2 * 3600 * 1000).toISOString();
}

export const planStatusKey = (s: PlanStatus | null) => `door.sched.plan.${s ?? 'NONE'}` as const;

/** The step buttons a plan offers, given what the person may do. */
export function planActions(status: PlanStatus | null, can: { confirm: boolean; publish: boolean }, slotCount: number): Array<'confirm' | 'publish' | 'reopen'> {
  if (status === 'DRAFT') return can.confirm && slotCount > 0 ? ['confirm'] : [];
  if (status === 'CONFIRMED') return [...(can.publish ? (['publish'] as const) : []), ...(can.confirm || can.publish ? (['reopen'] as const) : [])];
  if (status === 'PUBLISHED') return can.confirm || can.publish ? ['reopen'] : [];
  return [];
}

const ERROR_KEYS: Record<string, string> = {
  PLAN_LOCKED: 'door.sched.err.locked',
  WRONG_STATE: 'door.sched.err.wrongState',
  EMPTY_PLAN: 'door.sched.err.empty',
  WRONG_MONTH: 'door.sched.err.wrongMonth',
  BAD_RANGE: 'door.sched.err.badRange',
  ALREADY_ASSIGNED: 'door.sched.err.already',
  REASON_REQUIRED: 'door.sched.err.reason',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_YOURS: 'door.gov.err.notAllowed',
};
export const scheduleErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

export const liveAssignments = (s: ScheduleSlot) => s.assignments.filter((a) => a.status !== 'REPLACED');

/** The weeks of a YYYY-MM month as a grid, Monday first. Days outside the month are marked `off`. */
export function monthGrid(month: string): Array<{ day: string; off: boolean }> {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Math.ceil((lead + days) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, 1 - lead + i));
    return { day: d.toISOString().slice(0, 10), off: d.getUTCMonth() !== m - 1 };
  });
}

type Timed = { startsAt: string; endsAt: string | null };
const endOf = (s: Timed) => (s.endsAt ? new Date(s.endsAt).getTime() : new Date(s.startsAt).getTime() + 3600 * 1000);

/** Ids of items that overlap another item in the list in time. */
export function overlapping<T extends Timed & { id: string }>(items: T[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (new Date(a.startsAt).getTime() < endOf(b) && new Date(b.startsAt).getTime() < endOf(a)) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  return out;
}

/** People who are assigned to two slots that overlap: [name, slot titles]. */
export function personClashes(slots: ScheduleSlot[]): Array<{ name: string; titles: string[] }> {
  const byPerson = new Map<string, { name: string; slots: ScheduleSlot[] }>();
  for (const s of slots)
    for (const a of s.assignments)
      if (a.status === 'ASSIGNED') {
        const e = byPerson.get(a.personId) ?? { name: a.personName, slots: [] };
        e.slots.push(s);
        byPerson.set(a.personId, e);
      }
  const out: Array<{ name: string; titles: string[] }> = [];
  for (const e of byPerson.values()) {
    const ids = overlapping(e.slots);
    if (ids.size > 0) out.push({ name: e.name, titles: e.slots.filter((s) => ids.has(s.id)).map((s) => s.title) });
  }
  return out;
}

/** How many times each person serves this month, most first: the fairness figures. */
export function servingCounts(slots: ScheduleSlot[]): Array<{ personId: string; name: string; count: number }> {
  const m = new Map<string, { personId: string; name: string; count: number }>();
  for (const s of slots)
    for (const a of s.assignments)
      if (a.status === 'ASSIGNED') {
        const e = m.get(a.personId) ?? { personId: a.personId, name: a.personName, count: 0 };
        e.count++;
        m.set(a.personId, e);
      }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
