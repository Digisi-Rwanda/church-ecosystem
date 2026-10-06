import { OFFICES_BY_KIND, OFFICE_SCOPE } from '../../server/src/shared/accessMatrix';
import type { AccessLetter, OfficeCode, UnitKind } from '../../server/src/shared/vocabulary';
import type { AppointmentRow, UnitRecord, Vacancy } from '../api/frontDoorApi';

/** The offices a unit of this kind can hold, in the order the form lists them. Administrators are appointed in Media only. */
export function officesFor(kind: UnitKind, systemId: string | null | undefined, isLeader: boolean, isAdministrator: boolean): OfficeCode[] {
  const list: OfficeCode[] = [...OFFICES_BY_KIND[kind]];
  if (systemId === 'sys-media') list.push('ADMINISTRATOR');
  // The Church Leader's seat is filled by an Administrator; every other seat by the Church Leader.
  return list.filter((o) => (o === 'CHURCH_LEADER' ? isAdministrator : isLeader));
}

export const isChurchWide = (office: OfficeCode) => OFFICE_SCOPE[office] === 'CHURCH';

/** Messages for the refusals the server gives, so a person reads a reason and not a code. */
const ERROR_KEYS: Record<string, string> = {
  NOT_ALLOWED: 'door.access.err.notAllowed',
  OFFICE_TAKEN: 'door.access.err.officeTaken',
  ALREADY_HOLDS: 'door.access.err.alreadyHolds',
  SEPARATION_OF_DUTIES: 'door.access.err.separation',
  PERSON_NOT_ACTIVE: 'door.access.err.personNotActive',
  OFFICE_NOT_IN_UNIT: 'door.access.err.notInUnit',
  BAD_DATES: 'door.access.err.badDates',
  NEEDS_TWO_ADMINISTRATORS: 'door.access.err.twoAdmins',
  CANNOT_END_OWN_OFFICE: 'door.access.err.ownOffice',
  ALREADY_ENDED: 'door.access.err.alreadyEnded',
  LETTERS_NOT_HELD: 'door.access.err.lettersNotHeld',
  NO_LETTERS: 'door.access.err.noLetters',
  DELEGATION_TOO_LONG: 'door.access.err.tooLong',
  PAST_TERM: 'door.access.err.pastTerm',
  NOT_YOUR_OFFICE: 'door.access.err.notYourOffice',
  NOT_DELEGABLE: 'door.access.err.notDelegable',
  SELF: 'door.access.err.self',
  ALREADY_REVOKED: 'door.access.err.alreadyRevoked',
};
export function accessErrorKey(code: string | undefined): string {
  return (code && ERROR_KEYS[code]) || 'door.people.actionFailed';
}

/** Live appointments grouped by unit, units in name order, offices in the order the matrix lists them. */
export function groupByUnit(rows: AppointmentRow[], unitOrder: UnitRecord[]): Array<{ key: string; unitName: string; unitCode: string | null; rows: AppointmentRow[] }> {
  const rank = new Map<OfficeCode, number>(
    (['CHURCH_LEADER', 'CATECHIST', 'CHURCH_SECRETARY', 'ADMINISTRATOR', 'PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'COORDINATOR'] as OfficeCode[]).map((o, i) => [o, i]),
  );
  const groups = new Map<string, { key: string; unitName: string; unitCode: string | null; rows: AppointmentRow[] }>();
  for (const r of rows) {
    const key = r.orgUnitId ?? r.systemId ?? 'none';
    const g = groups.get(key) ?? { key, unitName: r.unitName ?? '—', unitCode: r.unitCode, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const place = new Map(unitOrder.map((u, i) => [u.id, i]));
  return [...groups.values()]
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => (rank.get(a.office) ?? 99) - (rank.get(b.office) ?? 99)) }))
    .sort((a, b) => (place.get(a.key) ?? 999) - (place.get(b.key) ?? 999) || a.unitName.localeCompare(b.unitName));
}

/** Letters as one short string, like "R W A". */
export const lettersText = (letters: readonly AccessLetter[] | undefined) => (letters && letters.length ? letters.join(' ') : '—');

/** Empty seats first, then terms about to end. */
export function sortVacancies(v: Vacancy[]): Vacancy[] {
  return v.slice().sort((a, b) => (a.reason === b.reason ? a.unitName.localeCompare(b.unitName) : a.reason === 'EMPTY' ? -1 : 1));
}
