/**
 * Choir office → permission grants (ported from SPA choirAccess.ts).
 * Nav matrices stay in the SPA; grants live here for server authorize().
 */
import type { Action, ChoirOffice, Resource } from './types.js';

export type ChoirGrantSpec = { resource: Resource; action: Action };

export const CHOIR_OFFICE_GRANTS: Record<ChoirOffice, readonly ChoirGrantSpec[]> =
  {
    MUSIC_DIRECTOR: [
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
      { resource: 'CHOIR_REPERTOIRE', action: 'MANAGE' },
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'MANAGE' },
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
      { resource: 'CHOIR_FINANCE', action: 'VIEW' },
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
      { resource: 'CHOIR_FINANCE', action: 'MANAGE' },
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
      { resource: 'CHOIR_FINANCE', action: 'MANAGE' },
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
    ],
    MEMBER: [
      { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
      { resource: 'CHOIR_ROSTER', action: 'VIEW' },
    ],
  };

export const CHOIR_OFFICES_WITH_PEOPLE_DIRECTORY: readonly ChoirOffice[] = [
  'PRESIDENT',
  'VP',
  'SECRETARY',
  'COORDINATOR',
];

export const CHOIR_MEMBERSHIP_GRANTS: readonly ChoirGrantSpec[] = [
  { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
  { resource: 'CHOIR_ROSTER', action: 'VIEW' },
];
