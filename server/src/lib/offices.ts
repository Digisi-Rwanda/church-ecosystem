/**
 * One Office record, one unit kind (slice 1.2).
 *
 * Positions used to carry five office columns (systemRole, ministryOffice, choirOffice,
 * worshipOffice, protocolOffice, deaconOffice). The new record is a single `office` code.
 * The old columns stay so the old app keeps working; this file translates both ways.
 */
import { OFFICE_CODES, UNIT_KINDS, type OfficeCode, type UnitKind } from '../shared/vocabulary.js';

const SYSTEM_ROLE: Record<string, OfficeCode> = {
  CHURCH_LEADER: 'CHURCH_LEADER',
  PASTOR: 'CHURCH_LEADER',
  CATECHIST: 'CATECHIST',
  CHURCH_SECRETARY: 'CHURCH_SECRETARY',
};
const MINISTRY_OFFICE: Record<string, OfficeCode> = {
  PRESIDENT: 'PRESIDENT',
  VP: 'VICE_PRESIDENT',
  SECRETARY: 'SECRETARY',
  TREASURER: 'TREASURER',
  COORDINATOR: 'COORDINATOR',
};

export interface OfficeColumns {
  office?: string | null;
  systemRole?: string | null;
  ministryOffice?: string | null;
  choirOffice?: string | null;
  worshipOffice?: string | null;
  protocolOffice?: string | null;
  deaconOffice?: string | null;
  systemAdmin?: boolean | null;
}

export function isOfficeCode(value: unknown): value is OfficeCode {
  return typeof value === 'string' && (OFFICE_CODES as readonly string[]).includes(value);
}

/** The office code of a position: the new record when set, otherwise read from the old columns. */
export function officeOf(p: OfficeColumns): OfficeCode | null {
  if (isOfficeCode(p.office)) return p.office;
  if (p.systemRole && SYSTEM_ROLE[p.systemRole]) return SYSTEM_ROLE[p.systemRole];
  const raw = p.ministryOffice ?? p.choirOffice ?? p.worshipOffice ?? p.protocolOffice ?? p.deaconOffice;
  if (raw && MINISTRY_OFFICE[raw]) return MINISTRY_OFFICE[raw];
  return p.systemAdmin ? 'ADMINISTRATOR' : null;
}

/** The old columns to write for a new office code, so the old app and engine still see it. */
export function legacyColumnsFor(code: OfficeCode): Partial<OfficeColumns> {
  switch (code) {
    case 'CHURCH_LEADER':
    case 'CATECHIST':
    case 'CHURCH_SECRETARY':
      return { systemRole: code };
    case 'PRESIDENT':
    case 'SECRETARY':
    case 'TREASURER':
    case 'COORDINATOR':
      return { ministryOffice: code };
    case 'VICE_PRESIDENT':
      return { ministryOffice: 'VP' };
    case 'ADMINISTRATOR':
      return {};
  }
}

/** A unit's kind: the stored one, otherwise worked out from the older type and place in the tree. */
export function unitKindOf(u: { kind?: string | null; type?: string | null; parentId?: string | null }): UnitKind {
  if ((UNIT_KINDS as readonly string[]).includes(u.kind ?? '')) return u.kind as UnitKind;
  if (!u.parentId && u.type === 'ORGANISATION') return 'CENTRAL';
  if (u.type === 'MINISTRY') return 'MINISTRY';
  if (u.type === 'ORGANISATION') return 'ORGANISATION';
  return 'TEAM';
}

export interface StructureDb {
  position: {
    findMany(args?: any): Promise<any[]>;
    update(args: any): Promise<unknown>;
  };
  orgUnit: {
    findMany(args?: any): Promise<any[]>;
    update(args: any): Promise<unknown>;
  };
}

/** Fill the office and kind of every record that has none. Safe to repeat; never overwrites. */
export async function backfillStructure(db: StructureDb): Promise<{ offices: number; kinds: number }> {
  let offices = 0;
  for (const p of await db.position.findMany({ where: { office: null } })) {
    const code = officeOf(p);
    if (!code) continue;
    await db.position.update({ where: { id: p.id }, data: { office: code } });
    offices++;
  }
  let kinds = 0;
  for (const u of await db.orgUnit.findMany({ where: { kind: null } })) {
    await db.orgUnit.update({ where: { id: u.id }, data: { kind: unitKindOf(u) } });
    kinds++;
  }
  return { offices, kinds };
}
