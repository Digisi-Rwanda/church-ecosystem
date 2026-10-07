/**
 * Light work (slice 3.2): who may see, change and delete a piece of work. Pure.
 *
 * Four visibility levels, enforced on every read: named people only, this unit, this system,
 * the whole church. Deleting is a soft delete: the person who deletes it sees it gone for good;
 * only an Administrator can bring it back.
 */
import { isMemberOf, isLive, lettersInSystem, type AccessData } from '../capabilities/engine.js';

export const VISIBILITIES = ['PERSONS', 'UNIT', 'SYSTEM', 'CHURCH'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type WorkStatus = (typeof STATUSES)[number];

export const TITLE_MAX = 160;
export const TEXT_MAX = 4000;
export const NOTE_MAX = 2000;
export const HELPERS_MAX = 20;

/** Older rows used other words; read them as the new levels. */
export function visibilityOf(raw: string | null | undefined): Visibility {
  const v = (raw ?? '').toUpperCase();
  if ((VISIBILITIES as readonly string[]).includes(v)) return v as Visibility;
  if (v === 'GENERAL') return 'CHURCH';
  if (v === 'SELECTED' || v === 'SELECTIVE' || v === 'MINISTRY_PRIVATE') return 'PERSONS';
  return 'SYSTEM'; // MINISTRY and anything unknown
}

export interface WorkRow {
  id: string;
  ownerPersonId: string;
  helperPersonIds?: string | null;
  createdByPersonId?: string | null;
  systemId?: string | null;
  orgUnitId?: string | null;
  visibility: string;
  status: string;
  deletedAt?: Date | string | null;
}

export function helpersOf(row: Pick<WorkRow, 'helperPersonIds'>): string[] {
  try {
    const v = JSON.parse(row.helperPersonIds ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const sys = (w: WorkRow) => w.systemId ?? 'sys-main';
export const isNamed = (w: WorkRow, me: string): boolean => w.ownerPersonId === me || w.createdByPersonId === me || helpersOf(w).includes(me);

/** Creating and managing work needs W in the work's system. */
export const canWriteIn = (me: string, systemId: string, data: AccessData, now = new Date()): boolean =>
  lettersInSystem(me, systemId, data, now).MISSION.includes('W');

function inUnit(me: string, unitId: string, data: AccessData, now: Date): boolean {
  const inMembers = (data.memberships as Array<{ personId: string; orgUnitId?: string | null; status: string; startDate?: unknown; endDate?: unknown }>).some(
    (m) => m.personId === me && m.orgUnitId === unitId && isLive(m as never, now),
  );
  const inOffices = (data.positions as Array<{ personId: string; orgUnitId?: string | null }>).some(
    (p) => p.personId === me && p.orgUnitId === unitId && isLive(p as never, now),
  );
  return inMembers || inOffices;
}

export function canSee(w: WorkRow, me: string, data: AccessData, now = new Date()): boolean {
  if (w.deletedAt) return false;
  if (isNamed(w, me)) return true;
  switch (visibilityOf(w.visibility)) {
    case 'PERSONS':
      return false;
    case 'CHURCH':
      return true;
    case 'UNIT':
      if (w.orgUnitId) return inUnit(me, w.orgUnitId, data, now) || canWriteIn(me, sys(w), data, now);
      return lettersInSystem(me, sys(w), data, now).MISSION.includes('R');
    default:
      return lettersInSystem(me, sys(w), data, now).MISSION.includes('R') || isMemberOf(me, sys(w), data, now);
  }
}

/** The creator or anyone with W in the system changes the work itself. */
export const canManage = (w: WorkRow, me: string, data: AccessData, now = new Date()): boolean =>
  !w.deletedAt && (w.createdByPersonId === me || canWriteIn(me, sys(w), data, now));

/** The owner and the helpers move it along, besides those who manage it. */
export const canMove = (w: WorkRow, me: string, data: AccessData, now = new Date()): boolean =>
  canManage(w, me, data, now) || (!w.deletedAt && (w.ownerPersonId === me || helpersOf(w).includes(me)));

/** A finished piece of work is part of the record and is never deleted. */
export const canDelete = (w: WorkRow, me: string, data: AccessData, now = new Date()): boolean =>
  canManage(w, me, data, now) && w.status !== 'DONE';

export function moveProblem(from: string, to: string, note: string | null): 'WRONG_STATE' | 'NOTE_REQUIRED' | null {
  const ok: Record<string, string[]> = {
    TODO: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
    IN_PROGRESS: ['TODO', 'DONE', 'CANCELLED'],
    DONE: ['IN_PROGRESS'],
    CANCELLED: ['TODO'],
  };
  if (!(ok[from] ?? []).includes(to)) return 'WRONG_STATE';
  if ((to === 'DONE' || to === 'CANCELLED') && !(note ?? '').trim()) return 'NOTE_REQUIRED';
  return null;
}
