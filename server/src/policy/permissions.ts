import type { Action, PermissionGrant, Resource, SystemId, WorkTask } from './types.js';

const ACTION_IMPLIES: Partial<Record<string, string[]>> = {
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
  }
  return actionSatisfied(grant.action, action);
}

/**
 * A task grants access while it is open and inside its dates. Same rule as the
 * SPA (src/domain/permissions.ts); the parity matrix test keeps them equal.
 */
export function isTaskActive(task: WorkTask, now = new Date()): boolean {
  if (task.status !== 'TODO' && task.status !== 'IN_PROGRESS') return false;
  const start = new Date(task.startDate ?? '');
  if (Number.isNaN(start.getTime()) || start > now) return false;
  if (task.endDate) {
    const end = new Date(task.endDate);
    if (!Number.isNaN(end.getTime()) && end < now) return false;
  }
  return true;
}
