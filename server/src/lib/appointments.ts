/**
 * Appointments (slice 1.3): who may hold which office where, vacancies, terms.
 * The pure parts are separate from the database so every rule can be tested alone.
 */
import {
  OFFICES_BY_KIND,
  OFFICE_SCOPE,
  REQUIRED_OFFICES,
  SOLE_OFFICES,
  TERM_ENDING_SOON_DAYS,
} from '../shared/accessMatrix.js';
import type { OfficeCode, UnitKind } from '../shared/vocabulary.js';
import { isLive, type PositionRec } from '../capabilities/engine.js';
import { officeOf, unitKindOf } from './offices.js';

export interface UnitRec {
  id: string;
  name: string;
  code?: string | null;
  kind?: string | null;
  type?: string | null;
  parentId?: string | null;
  systemId?: string | null;
}

/** The place an office is held in: the unit, else the system, else the main church. */
export const placeOf = (p: { orgUnitId?: string | null; systemId?: string | null }): string =>
  p.orgUnitId ?? p.systemId ?? 'sys-main';

/** Two records are in the same place when they share a unit, or, lacking a unit, a system. */
export function samePlace(
  a: { orgUnitId?: string | null; systemId?: string | null },
  b: { orgUnitId?: string | null; systemId?: string | null },
): boolean {
  if (a.orgUnitId && b.orgUnitId) return a.orgUnitId === b.orgUnitId;
  return !!a.systemId && a.systemId === b.systemId;
}

export type Clash =
  | { code: 'OFFICE_TAKEN'; holder: PositionRec }
  | { code: 'SEPARATION_OF_DUTIES'; other: PositionRec }
  | { code: 'ALREADY_HOLDS'; holder: PositionRec };

/**
 * Would appointing `personId` to `office` in this place break a rule?
 *  - sole offices have one live holder per place;
 *  - nobody holds the same office twice in one place;
 *  - the president and the treasurer of one place are never the same person.
 */
export function findClash(
  positions: PositionRec[],
  input: { personId: string; office: OfficeCode; orgUnitId?: string | null; systemId?: string | null; exceptId?: string },
  now = new Date(),
): Clash | null {
  const sameOffice = positions.filter(
    (p) =>
      p.id !== input.exceptId &&
      isLive(p, now) &&
      officeOf(p) === input.office &&
      (OFFICE_SCOPE[input.office] === 'CHURCH' && input.office !== 'ADMINISTRATOR'
        ? true
        : samePlace(p, input)),
  );
  const mine = sameOffice.find((p) => p.personId === input.personId);
  if (mine) return { code: 'ALREADY_HOLDS', holder: mine };
  if ((SOLE_OFFICES as readonly string[]).includes(input.office) && sameOffice[0]) {
    return { code: 'OFFICE_TAKEN', holder: sameOffice[0] };
  }
  const pair: Partial<Record<OfficeCode, OfficeCode>> = { PRESIDENT: 'TREASURER', TREASURER: 'PRESIDENT' };
  const other = pair[input.office];
  if (other) {
    const hit = positions.find(
      (p) =>
        p.id !== input.exceptId &&
        isLive(p, now) &&
        p.personId === input.personId &&
        officeOf(p) === other &&
        samePlace(p, input),
    );
    if (hit) return { code: 'SEPARATION_OF_DUTIES', other: hit };
  }
  return null;
}

/** May this office be held in a unit of this kind? Administrators sit in the Media system. */
export function officeFitsUnit(office: OfficeCode, unit: UnitRec): boolean {
  if (office === 'ADMINISTRATOR') return unit.systemId === 'sys-media';
  return (OFFICES_BY_KIND[unitKindOf(unit)] as readonly OfficeCode[]).includes(office);
}

export interface Vacancy {
  unitId: string;
  unitName: string;
  unitCode: string | null;
  kind: UnitKind;
  office: OfficeCode;
  reason: 'EMPTY' | 'ENDS_SOON';
  /** For ENDS_SOON: the day the term ends. */
  endsOn?: string;
  holderPersonId?: string;
}

export interface Conflict {
  unitId: string;
  unitName: string;
  office: OfficeCode;
  positionIds: string[];
}

/** Empty seats, seats whose term ends soon, and sole offices that somehow have two holders. */
export function computeVacancies(
  units: UnitRec[],
  positions: PositionRec[],
  now = new Date(),
): { vacancies: Vacancy[]; conflicts: Conflict[] } {
  const vacancies: Vacancy[] = [];
  const conflicts: Conflict[] = [];
  const soon = now.getTime() + TERM_ENDING_SOON_DAYS * 24 * 3600 * 1000;
  for (const u of units) {
    const kind = unitKindOf(u);
    const place = u.id;
    for (const office of REQUIRED_OFFICES[kind]) {
      const holders = positions.filter(
        (p) =>
          isLive(p, now) &&
          officeOf(p) === office &&
          (kind === 'CENTRAL' ? true : placeOf(p) === place || (!p.orgUnitId && p.systemId && p.systemId === u.systemId)),
      );
      if (holders.length === 0) {
        vacancies.push({ unitId: u.id, unitName: u.name, unitCode: u.code ?? null, kind, office, reason: 'EMPTY' });
        continue;
      }
      if (holders.length > 1 && (SOLE_OFFICES as readonly string[]).includes(office)) {
        conflicts.push({ unitId: u.id, unitName: u.name, office, positionIds: holders.map((h) => h.id).sort() });
      }
      const ends = holders
        .map((h) => (h.endDate ? new Date(h.endDate as string | Date).getTime() : null))
        .filter((n): n is number => n !== null && !Number.isNaN(n));
      if (ends.length === holders.length && Math.max(...ends) <= soon) {
        vacancies.push({
          unitId: u.id,
          unitName: u.name,
          unitCode: u.code ?? null,
          kind,
          office,
          reason: 'ENDS_SOON',
          endsOn: new Date(Math.max(...ends)).toISOString().slice(0, 10),
          holderPersonId: holders[0].personId,
        });
      }
    }
  }
  return { vacancies, conflicts };
}

/** Live administrators, one count for the whole church. */
export const countLiveAdministrators = (positions: PositionRec[], now = new Date(), exceptId?: string): number =>
  positions.filter((p) => p.id !== exceptId && isLive(p, now) && officeOf(p) === 'ADMINISTRATOR').length;
