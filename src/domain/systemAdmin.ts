/**
 * System Admin — appointed tech operator for one system.
 * Tool config only; never auto finance / sacraments / discipline Approve.
 *
 * Who may see the System admin surface:
 * Church Leader, ministry/organisation presidents, and appointed System Admins.
 *
 * Appointments:
 * - Peer ministry/org System Admins — presidents (or Protocol/Deacon coordinators)
 *   appoint for their own system only.
 * - Main Church System Admin — Church Leader only.
 * Leader may view peer appointments; does not appoint them.
 * One active System Admin per system.
 */
import { isChurchLeader } from './churchLeadership';
import type { Position, SystemId, SystemRole } from './types';

/** Main Church — Leader appoints this System Admin. */
export const MAIN_CHURCH_SYSTEM_ID: SystemId = 'sys-main';

/** Org unit used when attaching Main Church System Admin positions. */
export const MAIN_CHURCH_ADMIN_ORG_UNIT_ID = 'ou-leadership';

function isPresidentSeat(p: Position): boolean {
  return (
    p.ministryOffice === 'PRESIDENT' ||
    p.choirOffice === 'PRESIDENT' ||
    p.worshipOffice === 'PRESIDENT' ||
    p.protocolOffice === 'COORDINATOR' ||
    p.deaconOffice === 'COORDINATOR'
  );
}

export function isSystemAdminOf(
  personId: string,
  systemId: SystemId,
  positions: Position[],
): boolean {
  return positions.some(
    (p) =>
      p.personId === personId &&
      p.status === 'ACTIVE' &&
      p.systemAdmin === true &&
      p.systemId === systemId,
  );
}

export function systemAdminSystemIds(
  personId: string,
  positions: Position[],
): SystemId[] {
  const ids = new Set<SystemId>();
  for (const p of positions) {
    if (
      p.personId === personId &&
      p.status === 'ACTIVE' &&
      p.systemAdmin === true &&
      p.systemId
    ) {
      ids.add(p.systemId);
    }
  }
  return [...ids];
}

/** Systems where this person holds a president / coordinator seat. */
export function systemsPresidedBy(
  personId: string,
  positions: Position[],
): SystemId[] {
  const ids = new Set<SystemId>();
  for (const p of positions) {
    if (
      p.personId === personId &&
      p.status === 'ACTIVE' &&
      isPresidentSeat(p) &&
      p.systemId
    ) {
      ids.add(p.systemId);
    }
  }
  return [...ids];
}

/** Ministry / choir / worship presidents, plus Protocol & Deacon coordinators. */
export function isMinistryOrOrgPresident(
  personId: string,
  positions: Position[],
): boolean {
  return systemsPresidedBy(personId, positions).length > 0;
}

/** Active System Admin position for a system (at most one expected). */
export function activeSystemAdminPosition(
  systemId: SystemId,
  positions: Position[],
): Position | null {
  return (
    positions.find(
      (p) =>
        p.status === 'ACTIVE' &&
        p.systemAdmin === true &&
        p.systemId === systemId,
    ) ?? null
  );
}

export function listActiveSystemAdminPositions(
  positions: Position[],
): Position[] {
  return positions.filter(
    (p) => p.status === 'ACTIVE' && p.systemAdmin === true && Boolean(p.systemId),
  );
}

/**
 * Who may appoint/remove/change System Admin for a system:
 * - Main Church → Church Leader only
 * - Peer system → that system's president/coordinator only
 */
export function canManageSystemAdminAppointments(
  personId: string,
  positions: Position[],
  roles: SystemRole[],
  systemId: SystemId,
): boolean {
  if (systemId === MAIN_CHURCH_SYSTEM_ID) {
    return isChurchLeader(roles);
  }
  if (isChurchLeader(roles)) return false;
  return systemsPresidedBy(personId, positions).includes(systemId);
}

/**
 * Systems this viewer may appoint/remove/change System Admin for.
 * Leader: Main Church only. Presidents: their peer systems only.
 */
export function manageableSystemAdminSystemIds(
  personId: string,
  positions: Position[],
  roles: SystemRole[],
  peerSystemIds: SystemId[],
): SystemId[] {
  if (isChurchLeader(roles)) return [MAIN_CHURCH_SYSTEM_ID];
  const presided = new Set(systemsPresidedBy(personId, positions));
  return peerSystemIds.filter((id) => presided.has(id));
}

/** Nav + entry: Leader, presidents, or appointed System Admin — not plain members. */
export function canSeeSystemAdminNav(
  personId: string,
  positions: Position[],
  roles: SystemRole[],
): boolean {
  if (isChurchLeader(roles)) return true;
  if (isMinistryOrOrgPresident(personId, positions)) return true;
  return systemAdminSystemIds(personId, positions).length > 0;
}
