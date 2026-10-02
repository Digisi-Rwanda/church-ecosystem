import type {
  MissionLeaderOffice,
  MissionShareGrant,
  MissionVisibility,
  Position,
  SystemId,
} from './types';

export const MISSION_LEADER_OFFICES: MissionLeaderOffice[] = [
  'PRESIDENT',
  'VP',
  'SECRETARY',
  'TREASURER',
];

function officeFromPosition(p: Position): string | undefined {
  return (
    p.ministryOffice ??
    p.choirOffice ??
    p.worshipOffice ??
    p.protocolOffice ??
    p.deaconOffice
  );
}

/** President / VP / Secretary / Treasurer on this system (any office field). */
export function isMissionLeader(
  positions: Position[],
  systemId: SystemId,
  now = new Date(),
): boolean {
  return positions.some((p) => {
    if (p.systemId !== systemId || p.status !== 'ACTIVE') return false;
    if (p.endDate && new Date(p.endDate) < now) return false;
    const office = officeFromPosition(p);
    return (
      !!office &&
      MISSION_LEADER_OFFICES.includes(office as MissionLeaderOffice)
    );
  });
}

/** Main Church governance may create mission items for any owner (A4: both). */
export function isChurchMissionAdmin(
  positions: Position[],
  now = new Date(),
): boolean {
  return positions.some((p) => {
    if (p.status !== 'ACTIVE') return false;
    if (p.endDate && new Date(p.endDate) < now) return false;
    return (
      p.grantsAllSystems === true ||
      p.systemRole === 'CHURCH_LEADER' ||
      p.systemRole === 'PASTOR' ||
      p.systemRole === 'CATECHIST' ||
      p.systemRole === 'CHURCH_SECRETARY'
    );
  });
}

export function canManageMissionBoard(
  positions: Position[],
  systemId: SystemId,
): boolean {
  return (
    isMissionLeader(positions, systemId) ||
    (systemId === 'sys-main' && isChurchMissionAdmin(positions)) ||
    isChurchMissionAdmin(positions)
  );
}

export function shareIsActive(
  share: MissionShareGrant,
  now = new Date(),
): boolean {
  if (share.status !== 'ACTIVE') return false;
  if (new Date(share.startDate) > now) return false;
  if (share.endDate && new Date(share.endDate) < now) return false;
  return true;
}

/**
 * Item is visible to a person viewing from `viewerSystemId`.
 * SELECTIVE: mission leaders of owner + people with active share.
 * MINISTRY_PRIVATE: anyone who can enter that owner system (caller filters ENTER).
 * CHURCH: everyone with PROGRAM/EVENT view in any system context.
 */
export function missionItemVisibleTo(
  item: {
    id: string;
    ownerSystemId?: SystemId;
    systemId?: SystemId;
    visibility: MissionVisibility;
  },
  viewerSystemId: SystemId,
  opts?: {
    personId?: string;
    positions?: Position[];
    shares?: MissionShareGrant[];
    kind?: MissionShareGrant['kind'];
    /** True when person may ENTER the owning ministry system. */
    canEnterOwner?: boolean;
  },
): boolean {
  const owner = item.ownerSystemId ?? item.systemId;
  if (item.visibility === 'CHURCH') return true;

  if (item.visibility === 'MINISTRY_PRIVATE') {
    if (owner !== viewerSystemId) return false;
    return opts?.canEnterOwner !== false;
  }

  // SELECTIVE
  if (owner !== viewerSystemId && viewerSystemId === 'sys-main') {
    // Main never lists selective ministry items
    return false;
  }
  if (owner !== viewerSystemId) return false;

  const personId = opts?.personId;
  if (!personId) return false;

  if (
    opts.positions &&
    isMissionLeader(opts.positions, owner ?? viewerSystemId)
  ) {
    return true;
  }

  const shares = opts.shares ?? [];
  const kind = opts.kind;
  return shares.some(
    (s) =>
      shareIsActive(s) &&
      s.personId === personId &&
      s.resourceId === item.id &&
      (!kind || s.kind === kind) &&
      (s.action === 'VIEW' || s.action === 'MANAGE'),
  );
}

export function partitionMissionItems<
  T extends {
    id: string;
    ownerSystemId?: SystemId;
    systemId?: SystemId;
    visibility: MissionVisibility;
  },
>(
  items: T[],
  viewerSystemId: SystemId,
  opts?: {
    personId?: string;
    positions?: Position[];
    shares?: MissionShareGrant[];
    kind?: MissionShareGrant['kind'];
    canEnterOwner?: boolean;
  },
): { church: T[]; own: T[]; selective: T[] } {
  const visible = items.filter((i) =>
    missionItemVisibleTo(i, viewerSystemId, opts),
  );
  return {
    church: visible.filter((i) => i.visibility === 'CHURCH'),
    own: visible.filter((i) => i.visibility === 'MINISTRY_PRIVATE'),
    selective: visible.filter((i) => i.visibility === 'SELECTIVE'),
  };
}

export function visibilityLabel(v: MissionVisibility): string {
  if (v === 'CHURCH') return 'General church';
  if (v === 'SELECTIVE') return 'Selected members';
  return 'Ministry private';
}
