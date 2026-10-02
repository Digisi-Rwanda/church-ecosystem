import {
  CHOIR_ORG_UNITS,
  isChoirOrgUnitId,
  type ChoirOrgUnitEntry,
} from './choirCatalog';
import { isPastorScoped } from './governanceScope';
import type { Membership, Position, SystemRole } from './types';

/** Church-wide roles that may open any named choir (oversight, not vault manage). */
const CHOIR_OVERSIGHT_ROLES: readonly SystemRole[] = [
  'CHURCH_LEADER',
  'PASTOR',
  'CATECHIST',
];

export function personHasChoirOversight(positions: Position[]): boolean {
  return positions.some(
    (p) =>
      p.status === 'ACTIVE' &&
      // Pastors are limited to Main Church + Evangelism — no choir oversight.
      !isPastorScoped(p) &&
      ((p.systemRole == null && p.grantsAllSystems === true) ||
        (p.systemRole != null &&
          CHOIR_OVERSIGHT_ROLES.includes(p.systemRole))),
  );
}

/**
 * Named choirs this person may tenant into.
 * Oversight (Church Leader / Catechist) → all choirs.
 * Otherwise only org units from membership or position.
 */
export function resolveAccessibleChoirOrgUnitIds(
  memberships: Membership[],
  positions: Position[],
): string[] {
  if (personHasChoirOversight(positions)) {
    return CHOIR_ORG_UNITS.map((c) => c.id);
  }

  const ids = new Set<string>();
  for (const m of memberships) {
    if (
      m.status === 'ACTIVE' &&
      m.orgUnitId &&
      isChoirOrgUnitId(m.orgUnitId)
    ) {
      ids.add(m.orgUnitId);
    }
  }
  for (const p of positions) {
    if (
      p.status === 'ACTIVE' &&
      p.orgUnitId &&
      isChoirOrgUnitId(p.orgUnitId)
    ) {
      ids.add(p.orgUnitId);
    }
  }
  return [...ids];
}

export function resolveAccessibleChoirs(
  memberships: Membership[],
  positions: Position[],
): ChoirOrgUnitEntry[] {
  const ids = new Set(resolveAccessibleChoirOrgUnitIds(memberships, positions));
  return CHOIR_ORG_UNITS.filter((c) => ids.has(c.id));
}
