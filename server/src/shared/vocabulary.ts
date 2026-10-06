/**
 * The shared vocabulary: the words the app and the server both use for offices,
 * access letters, unit kinds, notification kinds and code formats.
 *
 * ONE copy lives here. The server imports it directly and the app imports it
 * from `server/src/shared/vocabulary`, so the two can never say different things.
 * Keep this file free of imports and of anything the browser cannot run.
 */

/* ── Access letters (drafted for review in "Bringing the new design to life") ── */

export const ACCESS_LETTERS = ['R', 'W', 'V', 'A', 'S', 'P', 'C'] as const;
export type AccessLetter = (typeof ACCESS_LETTERS)[number];

export const ACCESS_LETTER_MEANING: Record<AccessLetter, { name: string; meaning: string }> = {
  R: { name: 'Read', meaning: 'See the records you are responsible for' },
  W: { name: 'Write', meaning: 'Create and edit records in your scope' },
  V: { name: 'View', meaning: 'Oversight: see everything in the module, read-only' },
  A: { name: 'Approve', meaning: 'Decide yes or no; never on your own request' },
  S: { name: 'Send out', meaning: 'Print a letter for handwritten signature and record delivery' },
  P: { name: 'Publish', meaning: 'Make a draft plan or report visible to those it concerns' },
  C: { name: 'Confirm', meaning: 'Lock a draft as agreed before it is published' },
};

/** Which letters each module may use. */
export const MODULE_LETTERS = {
  PEOPLE: ['R', 'W'],
  PERSON_360: ['R', 'W'],
  MISSION: ['R', 'W', 'A'],
  SCHEDULING: ['R', 'W', 'C', 'P'],
  MONEY: ['R', 'W', 'V', 'A'],
  GOVERNANCE: ['R', 'W', 'A', 'S'],
  COMMUNICATION: ['R', 'W'],
  REPORTS: ['R', 'W', 'P'],
} as const satisfies Record<string, readonly AccessLetter[]>;
export type ModuleKey = keyof typeof MODULE_LETTERS;

/* ── The six shared blocks every system is built on ── */

export const SHARED_BLOCKS = ['home', 'people', 'work', 'schedule', 'money', 'reports'] as const;
export type SharedBlock = (typeof SHARED_BLOCKS)[number];

export const BLOCK_MODULE: Record<SharedBlock, ModuleKey> = {
  home: 'COMMUNICATION',
  people: 'PEOPLE',
  work: 'MISSION',
  schedule: 'SCHEDULING',
  money: 'MONEY',
  reports: 'REPORTS',
};

/* ── Units and offices ── */

export const UNIT_KINDS = ['CENTRAL', 'MINISTRY', 'ORGANISATION', 'TEAM'] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

/** Office codes. One active holder per office per unit (enforced in slice 1.3). */
export const OFFICE_CODES = [
  'CHURCH_LEADER',
  'CATECHIST',
  'CHURCH_SECRETARY',
  'ADMINISTRATOR',
  'PRESIDENT',
  'VICE_PRESIDENT',
  'SECRETARY',
  'TREASURER',
  'COORDINATOR',
] as const;
export type OfficeCode = (typeof OFFICE_CODES)[number];

/** Offices that may change Central Administration's settings. */
export const SETTINGS_OFFICES: readonly OfficeCode[] = ['CHURCH_LEADER', 'CATECHIST', 'CHURCH_SECRETARY'];

/* ── Notifications ── */

export const NOTIFICATION_KINDS = ['WAITING_FOR_ME', 'FOR_INFORMATION'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/* ── Code formats ── */

export const MEMBER_CODE_PREFIX = 'M';
/** Member codes are at least this many digits and grow by themselves: M-00123. */
export const MEMBER_CODE_MIN_DIGITS = 5;

export function formatMemberCode(n: number): string {
  return `${MEMBER_CODE_PREFIX}-${String(n).padStart(MEMBER_CODE_MIN_DIGITS, '0')}`;
}

/** Unit codes look like KAC-MUS-IJWI: church, kind or ministry, then the unit. */
export const UNIT_CODE_PATTERN = /^[A-Z]{2,5}(-[A-Z0-9]{2,8}){1,3}$/;
export const MEMBER_CODE_PATTERN = /^M-\d{5,}$/;
