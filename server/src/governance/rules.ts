/**
 * Governance (slice 2.2): who may do what with meetings and decisions. Pure.
 *
 * Reading needs R in Governance in the unit's system; drafting meetings and decisions needs
 * W; approving a decision needs A and is never the author's own call. A Central Administration
 * meeting (the Board) belongs to the main church, so it is read by the Church Leader, the
 * Catechist and the Church Secretary, and by nobody who holds only a unit office.
 */
import { decide, lettersInSystem, type AccessData } from '../capabilities/engine.js';

export const MEETING_STATUSES = ['PLANNED', 'HELD', 'CANCELLED'] as const;
export const DECISION_STATUSES = ['DRAFT', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const;

export const TITLE_MAX = 160;
export const TEXT_MAX = 8000;

export const canRead = (personId: string, systemId: string, data: AccessData, now = new Date()): boolean =>
  lettersInSystem(personId, systemId, data, now).GOVERNANCE.includes('R');

export const canWrite = (personId: string, systemId: string, data: AccessData, now = new Date()): boolean =>
  lettersInSystem(personId, systemId, data, now).GOVERNANCE.includes('W');

/** Approve (or reject) a decision: needs A, and never your own entry. */
export function mayApprove(
  personId: string,
  systemId: string,
  authorId: string,
  data: AccessData,
  now = new Date(),
): { allowed: boolean; reason: 'OK' | 'NO_LETTER' | 'OWN_ENTRY' } {
  const held = lettersInSystem(personId, systemId, data, now).GOVERNANCE.includes('A');
  if (!held) return { allowed: false, reason: 'NO_LETTER' };
  const d = decide(personId, systemId, 'GOVERNANCE', 'A', data, { now, ownerPersonId: authorId });
  return d.allowed ? { allowed: true, reason: 'OK' } : { allowed: false, reason: 'OWN_ENTRY' };
}

/** A decision about work must say who does it and by when. */
export function workProblem(work: { ownerPersonId?: string; dueDate?: string } | undefined): string | null {
  if (!work) return null;
  if (!work.ownerPersonId) return 'A decision about work needs an owner';
  if (!work.dueDate) return 'A decision about work needs a date';
  return null;
}

/** The first moment of a day given as YYYY-MM-DD (UTC), or null when it is not a real date. */
export function dayStart(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}

/** A due day is not in the past (today counts). */
export const dueIsFuture = (due: Date, now = new Date()): boolean => due.getTime() + 24 * 3600 * 1000 > now.getTime();
