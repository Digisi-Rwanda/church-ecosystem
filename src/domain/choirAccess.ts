/**
 * Single source of truth for Choir role → nav + permission grants.
 * UI nav, route guards, and authorize() must all derive from this.
 */
import type { Action, ChoirOffice, Resource } from './types';

export type ChoirNavKey =
  | 'home'
  | 'mission'
  | 'people'
  | 'families'
  | 'repertoire'
  | 'rehearsals';

export type ChoirGrantSpec = {
  resource: Resource;
  action: Action;
};

/** Modules each office may open (nav + deep-link). */
export const CHOIR_OFFICE_NAV: Record<ChoirOffice, readonly ChoirNavKey[]> = {
  MUSIC_DIRECTOR: [
    'home',
    'mission',
    'repertoire',
    'rehearsals',
  ],
  SECRETARY: [
    'home',
    'mission',
    'people',
    'repertoire',
    'rehearsals',
  ],
  TREASURER: [
    'home',
    'mission',
  ],
  COORDINATOR: [
    'home',
    'mission',
    'people',
    'families',
  ],
  PRESIDENT: [
    'home',
    'mission',
    'people',
    'families',
    'repertoire',
    'rehearsals',
  ],
  VP: [
    'home',
    'mission',
    'people',
    'families',
    'repertoire',
    'rehearsals',
  ],
  ADVISOR: ['home', 'mission'],
  FAMILY_LEADER: [
    'home',
    'families',
  ],
  MEMBER: ['home', 'repertoire', 'rehearsals'],
};

/** Plain choir member (membership, no office) — same as MEMBER. */
export const CHOIR_MEMBER_NAV: readonly ChoirNavKey[] =
  CHOIR_OFFICE_NAV.MEMBER;

/**
 * Extra permission grants from choirOffice (beyond SYSTEM ENTER from position).
 * Do NOT grant CHOIR_FINANCE VIEW here unless the office's job includes finance.
 */
export const CHOIR_OFFICE_GRANTS: Record<ChoirOffice, readonly ChoirGrantSpec[]> =
  {
    MUSIC_DIRECTOR: [
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
      { resource: 'CHOIR_REPERTOIRE', action: 'MANAGE' },
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'MANAGE' }, // duty / sections
      { resource: 'PROGRAM', action: 'VIEW' },
      { resource: 'EVENT', action: 'VIEW' },
      { resource: 'TASK', action: 'VIEW' },
      { resource: 'PROJECT', action: 'VIEW' },
    ],
    SECRETARY: [
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
      { resource: 'CHOIR_REPERTOIRE', action: 'MANAGE' },
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'MANAGE' },
      { resource: 'MEMBERSHIP', action: 'VIEW' },
      { resource: 'MEMBERSHIP', action: 'MANAGE' },
      { resource: 'ASSIGNMENT', action: 'VIEW' },
      { resource: 'ASSIGNMENT', action: 'MANAGE' },
      { resource: 'CHOIR_FINANCE', action: 'VIEW' }, // confirmed + issues tables
      { resource: 'PROGRAM', action: 'VIEW' },
      { resource: 'EVENT', action: 'VIEW' },
      { resource: 'TASK', action: 'VIEW' },
      { resource: 'PROJECT', action: 'VIEW' },
    ],
    TREASURER: [
      { resource: 'CHOIR_FINANCE', action: 'VIEW' },
      { resource: 'CHOIR_FINANCE', action: 'MANAGE' },
      { resource: 'CHOIR_FINANCE', action: 'APPROVE' },
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
      { resource: 'PROGRAM', action: 'VIEW' },
      { resource: 'EVENT', action: 'VIEW' },
      { resource: 'TASK', action: 'VIEW' },
      { resource: 'PROJECT', action: 'VIEW' },
    ],
    COORDINATOR: [
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'MANAGE' },
      { resource: 'MEMBERSHIP', action: 'VIEW' },
      { resource: 'ASSIGNMENT', action: 'VIEW' },
      { resource: 'ASSIGNMENT', action: 'MANAGE' },
      { resource: 'CHOIR_FINANCE', action: 'VIEW' },
      { resource: 'CHOIR_FINANCE', action: 'MANAGE' }, // family ops + handoffs
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
      { resource: 'PROGRAM', action: 'VIEW' },
      { resource: 'EVENT', action: 'VIEW' },
      { resource: 'TASK', action: 'VIEW' },
      { resource: 'PROJECT', action: 'VIEW' },
    ],
    PRESIDENT: [
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'MANAGE' },
      { resource: 'MEMBERSHIP', action: 'VIEW' },
      { resource: 'MEMBERSHIP', action: 'MANAGE' },
      { resource: 'ASSIGNMENT', action: 'VIEW' },
      { resource: 'ASSIGNMENT', action: 'MANAGE' },
      { resource: 'CHOIR_FINANCE', action: 'VIEW' },
      { resource: 'PROGRAM', action: 'VIEW' },
      { resource: 'PROGRAM', action: 'MANAGE' },
      { resource: 'EVENT', action: 'VIEW' },
      { resource: 'EVENT', action: 'MANAGE' },
      { resource: 'TASK', action: 'VIEW' },
      { resource: 'TASK', action: 'MANAGE' },
      { resource: 'PROJECT', action: 'VIEW' },
      { resource: 'PROJECT', action: 'MANAGE' },
    ],
    VP: [
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'MANAGE' },
      { resource: 'MEMBERSHIP', action: 'VIEW' },
      { resource: 'ASSIGNMENT', action: 'VIEW' },
      { resource: 'ASSIGNMENT', action: 'MANAGE' },
      { resource: 'CHOIR_FINANCE', action: 'VIEW' },
      { resource: 'PROGRAM', action: 'VIEW' },
      { resource: 'EVENT', action: 'VIEW' },
      { resource: 'TASK', action: 'VIEW' },
      { resource: 'PROJECT', action: 'VIEW' },
    ],
    ADVISOR: [
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
      { resource: 'PROGRAM', action: 'VIEW' },
      { resource: 'EVENT', action: 'VIEW' },
      { resource: 'TASK', action: 'VIEW' },
      { resource: 'PROJECT', action: 'VIEW' },
    ],
    FAMILY_LEADER: [
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
      { resource: 'CHOIR_FINANCE', action: 'VIEW' },
      { resource: 'CHOIR_FINANCE', action: 'MANAGE' }, // confirm family claims
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
    ],
    MEMBER: [
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
    ],
  };

/** Offices that may browse the church People directory from choir context. */
export const CHOIR_OFFICES_WITH_PEOPLE_DIRECTORY: readonly ChoirOffice[] = [
  'PRESIDENT',
  'VP',
  'SECRETARY',
  'COORDINATOR',
];

/** Membership-only choir grants — no finance ledger visibility. */
export const CHOIR_MEMBERSHIP_GRANTS: readonly ChoirGrantSpec[] = [
  { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
  { resource: 'CHOIR_ROSTER', action: 'VIEW' },
];

export function choirNavKeysForOffice(
  office: ChoirOffice | null,
): readonly ChoirNavKey[] {
  return office ? CHOIR_OFFICE_NAV[office] : CHOIR_MEMBER_NAV;
}

export function choirOfficeMayAccess(
  office: ChoirOffice | null,
  key: ChoirNavKey,
): boolean {
  return choirNavKeysForOffice(office).includes(key);
}

/** Full finance suite (donations, accounting, …) — treasurer only. */
export function choirOfficeIsTreasurer(office: ChoirOffice | null): boolean {
  return office === 'TREASURER';
}

/** Family-gate Confirm/Partial/Decline on member claims. */
export function choirOfficeIsFamilyLeader(office: ChoirOffice | null): boolean {
  return office === 'FAMILY_LEADER';
}

/** Live oversight of claims + handoffs (treasurer + coordinator). */
export function choirOfficeIsContributionOversight(
  office: ChoirOffice | null,
): boolean {
  return office === 'TREASURER' || office === 'COORDINATOR';
}

/** Contribution rollup pages — treasurer, coordinator, president, VP, family leader, secretary. */
export function choirOfficeMayViewFinanceModule(
  office: ChoirOffice | null,
): boolean {
  return (
    office === 'TREASURER' ||
    office === 'COORDINATOR' ||
    office === 'PRESIDENT' ||
    office === 'VP' ||
    office === 'SECRETARY' ||
    office === 'FAMILY_LEADER'
  );
}

/** Final confirmed + issues tables (leadership view). */
export function choirOfficeMayViewContributionLedgers(
  office: ChoirOffice | null,
): boolean {
  return (
    office === 'TREASURER' ||
    office === 'COORDINATOR' ||
    office === 'PRESIDENT' ||
    office === 'VP' ||
    office === 'SECRETARY'
  );
}

export function choirOfficeMayViewAllFamilies(
  office: ChoirOffice | null,
): boolean {
  return office === 'TREASURER' || office === 'COORDINATOR';
}

/** Whole-choir (MINISTRY) goal visibility. */
export function choirOfficeMayViewMinistryGoal(
  office: ChoirOffice | null,
  drivePublic?: boolean,
): boolean {
  if (drivePublic) return true;
  return (
    office === 'TREASURER' ||
    office === 'COORDINATOR' ||
    office === 'PRESIDENT' ||
    office === 'VP' ||
    office === 'SECRETARY' ||
    office === 'MUSIC_DIRECTOR'
  );
}
