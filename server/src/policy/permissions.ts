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
): boolean {
  if (grant.systemId !== systemId) return false;
  if (grant.resource !== resource) return false;
  return actionSatisfied(grant.action, action);
}

export function isTaskActive(task: WorkTask, now = new Date()): boolean {
  if (task.status !== 'TODO' && task.status !== 'IN_PROGRESS') return false;
  if (!task.dueAt) return true;
  // Active work items stay valid until closed — due date is informational.
  void now;
  return true;
}
