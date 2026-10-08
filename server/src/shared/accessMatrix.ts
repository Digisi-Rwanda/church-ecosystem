/**
 * The rule matrix: which letters each office carries in each module.
 *
 * ONE copy, shared by the server engine and the app's explainer screen. Rules that apply
 * to every letter (decided 6 Oct 2026):
 *  - W, V, A, S, P and C each include R;
 *  - nobody approves their own entry or request;
 *  - a letter exists only while the office that carries it is live (started, not ended,
 *    inside its term), so ending an office removes its letters at once.
 * Keep this file free of imports other than the vocabulary.
 */
import type { AccessLetter, ModuleKey, OfficeCode, UnitKind } from './vocabulary.js';

export type ModuleLetters = Partial<Record<ModuleKey, readonly AccessLetter[]>>;

export const MODULE_KEYS = [
  'PEOPLE',
  'PERSON_360',
  'MISSION',
  'SCHEDULING',
  'MONEY',
  'GOVERNANCE',
  'COMMUNICATION',
  'REPORTS',
] as const satisfies readonly ModuleKey[];

/** Whether an office reaches the whole church or only the system and unit it is held in. */
export const OFFICE_SCOPE: Record<OfficeCode, 'CHURCH' | 'UNIT'> = {
  CHURCH_LEADER: 'CHURCH',
  CATECHIST: 'CHURCH',
  CHURCH_SECRETARY: 'CHURCH',
  PASTOR: 'CHURCH',
  CHURCH_TREASURER: 'CHURCH',
  ADMINISTRATOR: 'CHURCH',
  PRESIDENT: 'UNIT',
  VICE_PRESIDENT: 'UNIT',
  SECRETARY: 'UNIT',
  TREASURER: 'UNIT',
  COORDINATOR: 'UNIT',
};

export const OFFICE_TITLE: Record<OfficeCode, string> = {
  CHURCH_LEADER: 'Church Leader',
  CATECHIST: 'Catechist',
  CHURCH_SECRETARY: 'Church Secretary',
  PASTOR: 'Pastor',
  CHURCH_TREASURER: 'Church Treasurer',
  ADMINISTRATOR: 'Administrator',
  PRESIDENT: 'President',
  VICE_PRESIDENT: 'Vice President',
  SECRETARY: 'Secretary',
  TREASURER: 'Treasurer',
  COORDINATOR: 'Coordinator',
};

/** The letters each office carries (R is added by `withRead`). */
export const OFFICE_LETTERS: Record<OfficeCode, ModuleLetters> = {
  CHURCH_LEADER: {
    PEOPLE: ['R', 'W'],
    PERSON_360: ['R', 'W'],
    MISSION: ['R', 'W', 'A'],
    SCHEDULING: ['R'],
    MONEY: ['R', 'V', 'A'],
    GOVERNANCE: ['R', 'W', 'A', 'S'],
    COMMUNICATION: ['R', 'W'],
    REPORTS: ['R', 'W', 'P'],
  },
  CATECHIST: {
    PEOPLE: ['R', 'W'],
    PERSON_360: ['R', 'W'],
    MISSION: ['R', 'W', 'A'],
    SCHEDULING: ['R'],
    GOVERNANCE: ['R', 'W'],
    COMMUNICATION: ['R', 'W'],
    REPORTS: ['R'],
  },
  CHURCH_SECRETARY: {
    PEOPLE: ['R', 'W'],
    PERSON_360: ['R', 'W'],
    MISSION: ['R'],
    SCHEDULING: ['R'],
    GOVERNANCE: ['R', 'W', 'S'],
    COMMUNICATION: ['R', 'W'],
    REPORTS: ['R', 'W'],
  },
  /** Pastoral work without money: people, care, mission and governance, but no Money letters. */
  PASTOR: {
    PEOPLE: ['R', 'W'],
    PERSON_360: ['R', 'W'],
    MISSION: ['R', 'W', 'A'],
    SCHEDULING: ['R'],
    GOVERNANCE: ['R', 'W', 'A'],
    COMMUNICATION: ['R', 'W'],
    REPORTS: ['R', 'W', 'P'],
  },
  /** The church's money without pastoral records: no Person 360. */
  CHURCH_TREASURER: {
    PEOPLE: ['R'],
    MISSION: ['R'],
    SCHEDULING: ['R'],
    MONEY: ['R', 'W'],
    GOVERNANCE: ['R'],
    COMMUNICATION: ['R'],
    REPORTS: ['R', 'W'],
  },
  ADMINISTRATOR: {
    PEOPLE: ['R', 'W'],
    COMMUNICATION: ['R', 'W'],
    REPORTS: ['R'],
  },
  PRESIDENT: {
    PEOPLE: ['R', 'W'],
    PERSON_360: ['R'],
    MISSION: ['R', 'W', 'A'],
    SCHEDULING: ['R', 'W', 'C', 'P'],
    MONEY: ['R', 'V', 'A'],
    GOVERNANCE: ['R', 'W', 'A', 'S'],
    COMMUNICATION: ['R', 'W'],
    REPORTS: ['R', 'W', 'P'],
  },
  VICE_PRESIDENT: {
    PEOPLE: ['R', 'W'],
    PERSON_360: ['R'],
    MISSION: ['R', 'W'],
    SCHEDULING: ['R', 'W', 'C'],
    MONEY: ['R', 'V'],
    GOVERNANCE: ['R', 'W'],
    COMMUNICATION: ['R', 'W'],
    REPORTS: ['R', 'W'],
  },
  SECRETARY: {
    PEOPLE: ['R', 'W'],
    PERSON_360: ['R', 'W'],
    MISSION: ['R', 'W'],
    SCHEDULING: ['R', 'W'],
    GOVERNANCE: ['R', 'W', 'S'],
    COMMUNICATION: ['R', 'W'],
    REPORTS: ['R', 'W'],
  },
  TREASURER: {
    PEOPLE: ['R'],
    MISSION: ['R'],
    SCHEDULING: ['R'],
    MONEY: ['R', 'W'],
    GOVERNANCE: ['R'],
    COMMUNICATION: ['R'],
    REPORTS: ['R', 'W'],
  },
  COORDINATOR: {
    PEOPLE: ['R'],
    PERSON_360: ['R'],
    MISSION: ['R', 'W'],
    SCHEDULING: ['R', 'W', 'P'],
    GOVERNANCE: ['R'],
    COMMUNICATION: ['R'],
    REPORTS: ['R', 'W'],
  },
};

/** What a plain member of a system can do there, with no office. */
export const MEMBER_LETTERS: ModuleLetters = {
  MISSION: ['R'],
  SCHEDULING: ['R'],
  COMMUNICATION: ['R'],
};

/** Offices with exactly one live holder per place (the unit, or the whole church for central offices). */
export const SOLE_OFFICES: readonly OfficeCode[] = [
  'CHURCH_LEADER',
  'CATECHIST',
  'CHURCH_SECRETARY',
  'PASTOR',
  'CHURCH_TREASURER',
  'PRESIDENT',
  'VICE_PRESIDENT',
  'SECRETARY',
  'TREASURER',
];

/** Offices a unit of each kind must have filled; an empty seat is a vacancy. */
export const REQUIRED_OFFICES: Record<UnitKind, readonly OfficeCode[]> = {
  CENTRAL: ['CHURCH_LEADER', 'CATECHIST', 'CHURCH_SECRETARY'],
  MINISTRY: ['PRESIDENT', 'SECRETARY', 'TREASURER'],
  ORGANISATION: ['PRESIDENT', 'SECRETARY', 'TREASURER'],
  TEAM: ['COORDINATOR'],
};

/** Where each office may be held. */
export const OFFICES_BY_KIND: Record<UnitKind, readonly OfficeCode[]> = {
  CENTRAL: ['CHURCH_LEADER', 'CATECHIST', 'CHURCH_SECRETARY', 'PASTOR', 'CHURCH_TREASURER'],
  MINISTRY: ['PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'COORDINATOR'],
  ORGANISATION: ['PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'COORDINATOR'],
  TEAM: ['COORDINATOR', 'SECRETARY'],
};

/** Administrators sit in Media; the church always keeps at least this many. */
export const MIN_ADMINISTRATORS = 2;
export const ADMINISTRATOR_SYSTEM = 'sys-media';

/** A delegation never runs longer than this, so it cannot become a second appointment. */
export const DELEGATION_MAX_DAYS = 90;

/** A term that ends within this many days is flagged. */
export const TERM_ENDING_SOON_DAYS = 60;

export const LETTER_ORDER: readonly AccessLetter[] = ['R', 'W', 'V', 'A', 'S', 'P', 'C'];

/** Every letter above R includes R. */
export function withRead(letters: readonly AccessLetter[]): AccessLetter[] {
  const set = new Set<AccessLetter>(letters);
  if (set.size > 0) set.add('R');
  return LETTER_ORDER.filter((l) => set.has(l));
}

export function mergeLetters(...lists: ReadonlyArray<readonly AccessLetter[] | undefined>): AccessLetter[] {
  const set = new Set<AccessLetter>();
  for (const l of lists) for (const x of l ?? []) set.add(x);
  return withRead([...set]);
}
