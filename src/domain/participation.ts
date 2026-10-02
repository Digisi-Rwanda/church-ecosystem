import type {
  Assignment,
  Membership,
  Position,
  SystemEntitlement,
  SystemId,
  SystemRole,
  UserAccount,
} from './types';

import { governanceSystemsFor } from './governanceScope';

const GOVERNANCE_ROLES: SystemRole[] = [
  'CHURCH_LEADER',
  'PASTOR',
  'CATECHIST',
];

function isActiveDateRange(
  startDate: string,
  endDate: string | undefined,
  now: Date,
): boolean {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime()) || start > now) return false;
  if (!endDate) return true;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return true;
  return end >= now;
}

export function isMembershipActive(m: Membership, now = new Date()): boolean {
  return m.status === 'ACTIVE' && isActiveDateRange(m.startDate, m.endDate, now);
}

export function isPositionActive(p: Position, now = new Date()): boolean {
  return p.status === 'ACTIVE' && isActiveDateRange(p.startDate, p.endDate, now);
}

export function isAssignmentActive(a: Assignment, now = new Date()): boolean {
  return a.status === 'ACTIVE' && isActiveDateRange(a.startDate, a.endDate, now);
}

/** SystemRoles currently held via active Positions. */
export const MAIN_CHURCH_ROLES: SystemRole[] = [
  'CHURCH_LEADER',
  'PASTOR',
  'CATECHIST',
  'CHURCH_SECRETARY',
  'CHURCH_TREASURER',
];

export function rolesFromPositions(
  positions: Position[],
  now = new Date(),
): SystemRole[] {
  const roles = new Set<SystemRole>();
  for (const p of positions) {
    if (!isPositionActive(p, now) || !p.systemRole) continue;
    // Only the five main-church roles count here; ministry officers are plain members in Main.
    if (!MAIN_CHURCH_ROLES.includes(p.systemRole)) continue;
    roles.add(p.systemRole);
  }
  return [...roles];
}

function addEntitlement(
  map: Map<SystemId, SystemEntitlement>,
  systemId: SystemId,
  source: SystemEntitlement['sources'][number],
  reason: string,
) {
  const existing = map.get(systemId);
  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source);
    if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    return;
  }
  map.set(systemId, {
    systemId,
    sources: [source],
    reasons: [reason],
  });
}

/**
 * Resolve which systems a person may enter right now from participation.
 * Membership ≠ Position ≠ Assignment — each can independently grant access.
 */
export function resolveSystemEntitlements(
  personId: string,
  input: {
    memberships: Membership[];
    positions: Position[];
    assignments: Assignment[];
    /** All system ids that exist (for governance "all systems"). */
    allSystemIds: SystemId[];
  },
  now = new Date(),
): SystemEntitlement[] {
  const map = new Map<SystemId, SystemEntitlement>();

  // Anyone with an account path starts with Main Church via caller;
  // also grant Main when they have church membership.
  addEntitlement(map, 'sys-main', 'ACCOUNT', 'Signed-in church account');

  const mine = {
    memberships: input.memberships.filter((m) => m.personId === personId),
    positions: input.positions.filter((p) => p.personId === personId),
    assignments: input.assignments.filter((a) => a.personId === personId),
  };

  for (const m of mine.memberships) {
    if (!isMembershipActive(m, now)) continue;
    if (m.type === 'CHURCH_MEMBER') {
      addEntitlement(map, 'sys-main', 'MEMBERSHIP', m.label);
    }
    if (m.systemId) {
      addEntitlement(map, m.systemId, 'MEMBERSHIP', m.label);
    }
  }

  for (const p of mine.positions) {
    if (!isPositionActive(p, now)) continue;
    const grantsAll = p.systemRole
      ? GOVERNANCE_ROLES.includes(p.systemRole)
      : Boolean(p.grantsAllSystems);
    if (grantsAll) {
      for (const systemId of governanceSystemsFor(p, input.allSystemIds)) {
        addEntitlement(map, systemId, 'GOVERNANCE', `${p.title} (all systems)`);
      }
    } else if (p.systemId) {
      addEntitlement(map, p.systemId, 'POSITION', p.title);
    }
  }

  for (const a of mine.assignments) {
    if (!isAssignmentActive(a, now)) continue;
    if (a.systemId) {
      addEntitlement(
        map,
        a.systemId,
        'ASSIGNMENT',
        `${a.title} · ${a.contextLabel}`,
      );
    }
  }

  return [...map.values()];
}

export function entitledSystemIds(
  entitlements: SystemEntitlement[],
): SystemId[] {
  return entitlements.map((e) => e.systemId);
}

export function personCanEnterSystem(
  entitlements: SystemEntitlement[],
  systemId: SystemId,
): boolean {
  return entitlements.some((e) => e.systemId === systemId);
}

/** Convenience when you already have the account's personId. */
export function accountPersonId(account: UserAccount | null): string | null {
  return account?.personId ?? null;
}
