import type {
  Assignment,
  Membership,
  Position,
  SystemEntitlement,
  SystemId,
  SystemRole,
  UserAccount,
} from './types.js';

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

export function rolesFromPositions(
  positions: Position[],
  now = new Date(),
): SystemRole[] {
  const roles = new Set<SystemRole>();
  for (const p of positions) {
    if (!isPositionActive(p, now) || !p.systemRole) continue;
    roles.add(p.systemRole);
  }
  return [...roles];
}

export function resolveSystemEntitlements(
  personId: string,
  input: {
    memberships: Membership[];
    positions: Position[];
    assignments: Assignment[];
  },
  now = new Date(),
): SystemEntitlement[] {
  const map = new Map<string, SystemEntitlement>();
  const add = (systemId: SystemId, source: string, reason: string) => {
    const key = `${systemId}:${source}:${reason}`;
    if (!map.has(key)) map.set(key, { systemId, source, reason });
  };

  for (const m of input.memberships) {
    if (m.personId !== personId || !isMembershipActive(m, now)) continue;
    if (m.systemId) add(m.systemId, 'MEMBERSHIP', m.label);
  }
  for (const p of input.positions) {
    if (p.personId !== personId || !isPositionActive(p, now)) continue;
    if (
      p.systemRole
        ? GOVERNANCE_ROLES.includes(p.systemRole)
        : Boolean(p.grantsAllSystems)
    ) {
      // resolved at authorize time from governance scope
      continue;
    }
    if (p.systemId) add(p.systemId, 'POSITION', p.title);
  }
  for (const a of input.assignments) {
    if (a.personId !== personId || !isAssignmentActive(a, now)) continue;
    if (a.systemId) add(a.systemId, 'ASSIGNMENT', a.title);
  }
  return [...map.values()];
}

export function entitledSystemIds(
  entitlements: SystemEntitlement[],
): SystemId[] {
  return [...new Set(entitlements.map((e) => e.systemId))];
}

export function personCanEnterSystem(
  entitlements: SystemEntitlement[],
  systemId: SystemId,
): boolean {
  return entitlements.some((e) => e.systemId === systemId);
}

export function accountPersonId(account: UserAccount | null): string | null {
  return account?.personId ?? null;
}
