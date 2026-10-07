/**
 * Groups (slice 3.8): fellowship groups (Men, Women), Sunday School classes (Children) and age
 * groups (Youth). Reading needs a People letter in the system; changing needs People W.
 * Ages are a guide, never a wall: a member outside the range is flagged, not refused.
 */
import { lettersInSystem, type AccessData } from '../capabilities/engine.js';

export const KIND_BY_SYSTEM: Record<string, 'FELLOWSHIP' | 'CLASS' | 'AGE_GROUP'> = {
  'sys-men': 'FELLOWSHIP',
  'sys-women': 'FELLOWSHIP',
  'sys-children': 'CLASS',
  'sys-youth': 'AGE_GROUP',
};
export const NAME_MAX = 80;
export const MEETS_MAX = 120;
export const NOTE_MAX = 500;
export const SESSIONS_SHOWN = 12;

const held = (me: string, s: string, d: AccessData, now: Date) => lettersInSystem(me, s, d, now).PEOPLE as string[];
export const canReadGroups = (me: string, s: string, d: AccessData, now = new Date()) => s in KIND_BY_SYSTEM && held(me, s, d, now).includes('R');
export const canWriteGroups = (me: string, s: string, d: AccessData, now = new Date()) => s in KIND_BY_SYSTEM && held(me, s, d, now).includes('W');

export function agesProblem(from: number | null | undefined, to: number | null | undefined): 'BAD_AGES' | null {
  const ok = (n: number | null | undefined) => n == null || (Number.isInteger(n) && n >= 0 && n <= 120);
  if (!ok(from) || !ok(to)) return 'BAD_AGES';
  if (from != null && to != null && from > to) return 'BAD_AGES';
  return null;
}

/** Whole years on a day (YYYY-MM-DD), or null when the birth date is unknown or unreadable. */
export function ageOn(dateOfBirth: string | null | undefined, day: string): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [by, bm, bd] = dateOfBirth.split('-').map(Number);
  const [y, m, d] = day.split('-').map(Number);
  if (!by || !y) return null;
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age >= 0 ? age : null;
}

export const outsideAge = (age: number | null, from?: number | null, to?: number | null): boolean =>
  age !== null && ((from != null && age < from) || (to != null && age > to));

export interface SessionLike { presentJson?: string | null }
export const presentOf = (s: SessionLike): string[] => {
  try {
    const v = JSON.parse(s.presentJson ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/** Attendance over the sessions given: how many each member came to, and the rate among sessions they could attend. */
export function attendanceOf(memberIds: string[], sessions: SessionLike[]): Map<string, { came: number; of: number; rate: number }> {
  const out = new Map<string, { came: number; of: number; rate: number }>();
  const present = sessions.map((s) => new Set(presentOf(s)));
  for (const id of memberIds) {
    const came = present.filter((p) => p.has(id)).length;
    out.set(id, { came, of: sessions.length, rate: sessions.length ? Math.round((came / sessions.length) * 100) : 0 });
  }
  return out;
}
