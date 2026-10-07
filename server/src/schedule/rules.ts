/**
 * Schedule (slice 3.1): who may do what with a month plan, its slots and its assignments. Pure.
 *
 * A unit's month plan moves DRAFT, then CONFIRMED (letter C), then PUBLISHED (letter P). W builds
 * slots and assignments, and only while the plan is a draft. A draft or confirmed plan is seen only
 * by those who hold W, C or P in the system; a published plan is seen by everyone who may read the
 * schedule there. Slots marked for the whole church appear on the church calendar once published.
 */
import { lettersInSystem, type AccessData } from '../capabilities/engine.js';

export const PLAN_STATUSES = ['DRAFT', 'CONFIRMED', 'PUBLISHED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const SLOT_KINDS = ['SERVICE', 'REHEARSAL', 'MEETING', 'OTHER'] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

export const TITLE_MAX = 120;
export const ROLE_MAX = 80;
export const NOTE_MAX = 1000;

/** Kigali has no daylight saving: church time is always UTC+2. */
export const CHURCH_UTC_OFFSET_HOURS = 2;

export const isMonthKey = (v: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** The month a moment falls in, in church time, as YYYY-MM. */
export function monthOf(at: Date | string): string {
  const d = new Date((at instanceof Date ? at : new Date(at)).getTime() + CHURCH_UTC_OFFSET_HOURS * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}

/** The first and last instants of a church-time month, as UTC dates. */
export function monthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number);
  const offset = CHURCH_UTC_OFFSET_HOURS * 3600 * 1000;
  return { from: new Date(Date.UTC(y, m - 1, 1) - offset), to: new Date(Date.UTC(y, m, 1) - offset - 1) };
}

const has = (personId: string, systemId: string, data: AccessData, letters: Array<'R' | 'W' | 'C' | 'P'>, now: Date) => {
  const held = lettersInSystem(personId, systemId, data, now).SCHEDULING;
  return letters.some((l) => held.includes(l));
};

export const canRead = (p: string, s: string, d: AccessData, now = new Date()) => has(p, s, d, ['R'], now);
export const canWrite = (p: string, s: string, d: AccessData, now = new Date()) => has(p, s, d, ['W'], now);
export const canConfirm = (p: string, s: string, d: AccessData, now = new Date()) => has(p, s, d, ['C'], now);
export const canPublish = (p: string, s: string, d: AccessData, now = new Date()) => has(p, s, d, ['P'], now);
/** A planner or approver: anyone who holds W, C or P here. */
export const isPlanner = (p: string, s: string, d: AccessData, now = new Date()) => has(p, s, d, ['W', 'C', 'P'], now);

/** May this person see a plan (and its slots) in this state? */
export function canSeePlan(status: string, personId: string, systemId: string, data: AccessData, now = new Date()): boolean {
  if (status === 'PUBLISHED') return canRead(personId, systemId, data, now);
  return isPlanner(personId, systemId, data, now);
}

/** Next states a plan may move to, and what each needs. */
export function moveProblem(
  action: 'confirm' | 'publish' | 'reopen',
  plan: { status: string },
  slotCount: number,
): 'WRONG_STATE' | 'EMPTY_PLAN' | null {
  if (action === 'confirm') return plan.status !== 'DRAFT' ? 'WRONG_STATE' : slotCount === 0 ? 'EMPTY_PLAN' : null;
  if (action === 'publish') return plan.status !== 'CONFIRMED' ? 'WRONG_STATE' : null;
  return plan.status === 'DRAFT' ? 'WRONG_STATE' : null;
}

/** A slot must end after it starts. */
export const rangeProblem = (start: Date, end: Date | null): boolean => !!end && end.getTime() <= start.getTime();
