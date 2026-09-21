import type {
  Action,
  Activity,
  Attendance,
  ChurchEvent,
  PermissionGrant,
  Program,
  Resource,
  SystemId,
  WorkTask,
} from './types';

/** Actions implied when a stronger action is granted. */
const ACTION_IMPLIES: Partial<Record<Action, Action[]>> = {
  MANAGE: [
    'VIEW',
    'VIEW_FULL',
    'CREATE',
    'UPDATE',
    'DELETE',
    'LINK_ACCOUNT',
    'RECORD_ATTENDANCE',
    'APPROVE',
  ],
  APPROVE: ['VIEW'],
  VIEW_FULL: ['VIEW'],
  CREATE: ['VIEW'],
  UPDATE: ['VIEW'],
  DELETE: ['VIEW'],
  LINK_ACCOUNT: ['VIEW'],
  RECORD_ATTENDANCE: ['VIEW'],
};

export function actionSatisfied(held: Action, requested: Action): boolean {
  if (held === requested) return true;
  return ACTION_IMPLIES[held]?.includes(requested) ?? false;
}

export function grantMatches(
  grant: PermissionGrant,
  systemId: SystemId,
  resource: Resource,
  action: Action,
  fundId?: string,
): boolean {
  if (grant.systemId !== systemId) return false;
  if (grant.resource !== resource) return false;
  if (fundId) {
    if (grant.fundId && grant.fundId !== fundId) return false;
    if (!grant.fundId && resource === 'FINANCE') return false;
  } else if (grant.fundId && resource === 'FINANCE') {
    // Unscoped FINANCE check: any fund-scoped grant counts as "has finance access"
    // only for ENTER-style discovery — callers should use fundId for ledger ops.
    // For resource FINANCE without fundId, allow if grant satisfies action.
  }
  return actionSatisfied(grant.action, action);
}

export function resourceLabel(resource: Resource): string {
  const map: Record<Resource, string> = {
    SYSTEM: 'System entry',
    PERSON: 'People records',
    ORG_UNIT: 'Organisation',
    MEMBERSHIP: 'Memberships',
    POSITION: 'Positions',
    ASSIGNMENT: 'Assignments',
    PROGRAM: 'Programs',
    ACTIVITY: 'Activities',
    EVENT: 'Events',
    TASK: 'Tasks',
    PROJECT: 'Projects',
    FINANCE: 'Finance (org-private)',
    CHOIR_REPERTOIRE: 'Choir repertoire',
    CHOIR_ROSTER: 'Choir roster',
    CHOIR_FINANCE: 'Choir contributions & finance',
    WORSHIP_REPERTOIRE: 'Worship setlists',
    WORSHIP_ROSTER: 'Worship roster',
    WORSHIP_FINANCE: 'Worship contributions & finance',
    YOUTH_GROUP: 'Youth groups',
    PROTOCOL_ROSTER: 'Protocol roster',
    PROTOCOL_SCHEDULE: 'Protocol schedule',
    DEACON_ROSTER: 'Deacon roster',
    DEACON_CARE: 'Deacon care cases & visits',
    DEACON_FINANCE: 'Deacon contributions & finance',
    MINISTRY_FINANCE: 'Ministry contributions & finance',
    AUDIT: 'Access audit',
    SYSTEM_CONFIG: 'System administration (config)',
    BOARD: 'Board of Directors',
    CORRESPONDENCE: 'Letters & correspondence',
  };
  return map[resource];
}

export function actionLabel(action: Action): string {
  const map: Record<Action, string> = {
    ENTER: 'Enter',
    VIEW: 'View',
    VIEW_FULL: 'View full',
    CREATE: 'Create',
    UPDATE: 'Update',
    DELETE: 'Delete',
    MANAGE: 'Manage',
    LINK_ACCOUNT: 'Link account',
    RECORD_ATTENDANCE: 'Record attendance',
    APPROVE: 'Approve',
  };
  return map[action];
}

/** Probe matrix used by the Access Engine UI. */
export const PERMISSION_PROBES: Array<{ resource: Resource; action: Action }> = [
  { resource: 'SYSTEM', action: 'ENTER' },
  { resource: 'PERSON', action: 'VIEW' },
  { resource: 'PERSON', action: 'VIEW_FULL' },
  { resource: 'PERSON', action: 'MANAGE' },
  { resource: 'PROGRAM', action: 'VIEW' },
  { resource: 'PROGRAM', action: 'MANAGE' },
  { resource: 'ACTIVITY', action: 'VIEW' },
  { resource: 'ACTIVITY', action: 'RECORD_ATTENDANCE' },
  { resource: 'EVENT', action: 'VIEW' },
  { resource: 'EVENT', action: 'MANAGE' },
  { resource: 'TASK', action: 'VIEW' },
  { resource: 'TASK', action: 'MANAGE' },
  { resource: 'PROJECT', action: 'VIEW' },
  { resource: 'PROJECT', action: 'MANAGE' },
  { resource: 'FINANCE', action: 'VIEW' },
  { resource: 'FINANCE', action: 'MANAGE' },
  { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
  { resource: 'CHOIR_REPERTOIRE', action: 'MANAGE' },
  { resource: 'CHOIR_ROSTER', action: 'VIEW' },
  { resource: 'CHOIR_ROSTER', action: 'MANAGE' },
  { resource: 'CHOIR_FINANCE', action: 'VIEW' },
  { resource: 'CHOIR_FINANCE', action: 'MANAGE' },
  { resource: 'MINISTRY_FINANCE', action: 'VIEW' },
  { resource: 'MINISTRY_FINANCE', action: 'MANAGE' },
  { resource: 'YOUTH_GROUP', action: 'VIEW' },
  { resource: 'YOUTH_GROUP', action: 'MANAGE' },
  { resource: 'PROTOCOL_ROSTER', action: 'VIEW' },
  { resource: 'PROTOCOL_ROSTER', action: 'MANAGE' },
  { resource: 'PROTOCOL_SCHEDULE', action: 'VIEW' },
  { resource: 'PROTOCOL_SCHEDULE', action: 'MANAGE' },
  { resource: 'AUDIT', action: 'VIEW' },
  { resource: 'BOARD', action: 'VIEW' },
  { resource: 'BOARD', action: 'MANAGE' },
  { resource: 'CORRESPONDENCE', action: 'VIEW' },
  { resource: 'CORRESPONDENCE', action: 'MANAGE' },
  { resource: 'CORRESPONDENCE', action: 'APPROVE' },
  { resource: 'SYSTEM_CONFIG', action: 'MANAGE' },
];

export function isTaskActive(task: WorkTask, now = new Date()): boolean {
  if (task.status !== 'TODO' && task.status !== 'IN_PROGRESS') return false;
  const start = new Date(task.startDate);
  if (Number.isNaN(start.getTime()) || start > now) return false;
  if (task.endDate) {
    const end = new Date(task.endDate);
    if (!Number.isNaN(end.getTime()) && end < now) return false;
  }
  return true;
}

export function programLabel(program: Program): string {
  return program.name;
}

export function eventTypeLabel(type: ChurchEvent['type']): string {
  return type.replaceAll('_', ' ');
}

export function calendarItems(
  activities: Activity[],
  events: ChurchEvent[],
  programsById: Map<string, Program>,
): Array<{
  id: string;
  kind: 'ACTIVITY' | 'EVENT';
  title: string;
  startsAt: string;
  endsAt?: string;
  systemId: SystemId;
  meta: string;
  /** Program sessions deep-link here. */
  programId?: string;
}> {
  const fromActivities = activities.map((a) => {
    const program = programsById.get(a.programId);
    return {
      id: a.id,
      kind: 'ACTIVITY' as const,
      title: a.title,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      systemId: program?.ownerSystemId ?? 'sys-main',
      meta: program?.name ?? 'Program',
      programId: a.programId,
    };
  });
  const fromEvents = events
    .filter((e) => e.status !== 'CANCELLED')
    .map((e) => ({
      id: e.id,
      kind: 'EVENT' as const,
      title: e.name,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      systemId: e.ownerSystemId,
      meta: eventTypeLabel(e.type),
    }));
  return [...fromActivities, ...fromEvents].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
}

export function attendanceCount(
  rows: Attendance[],
  activityId: string,
): { present: number; total: number } {
  const forActivity = rows.filter((r) => r.activityId === activityId);
  return {
    present: forActivity.filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
      .length,
    total: forActivity.length,
  };
}
