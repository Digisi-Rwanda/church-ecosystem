import {
  ACCOUNTS,
  ASSIGNMENTS,
  MEMBERSHIPS,
  POSITIONS,
  SYSTEMS,
  TASKS,
} from '../data/seed';
import {
  authorize as authorizeCore,
  buildEffectiveAccess,
  grantsForSystem,
} from '../domain/authorize';
import { PERMISSION_PROBES } from '../domain/permissions';
import type {
  Action,
  AuthzDecision,
  PermissionGrant,
  Resource,
  SessionState,
  SystemId,
} from '../domain/types';
import { auditService } from './auditService';

function participationInput() {
  return {
    memberships: MEMBERSHIPS,
    positions: POSITIONS,
    assignments: ASSIGNMENTS,
    tasks: TASKS,
    allSystemIds: SYSTEMS.map((s) => s.id) as SystemId[],
  };
}

export const accessService = {
  effectiveAccess(personId: string, now = new Date()): PermissionGrant[] {
    return buildEffectiveAccess(personId, participationInput(), now);
  },

  grantsInSystem(
    personId: string,
    systemId: SystemId,
    now = new Date(),
  ): PermissionGrant[] {
    return grantsForSystem(this.effectiveAccess(personId, now), systemId);
  },

  /**
   * Single authorization entry point for Main Church and ministry systems.
   * Optionally writes an audit row (default for sensitive checks).
   */
  authorize(
    personId: string,
    systemId: SystemId,
    resource: Resource,
    action: Action,
    options?: {
      now?: Date;
      audit?: boolean;
      entryMode?: SessionState['entryMode'];
    },
  ): AuthzDecision {
    const now = options?.now ?? new Date();
    const grants = this.effectiveAccess(personId, now);
    const decision = authorizeCore(
      {
        personId,
        systemId,
        resource,
        action,
        now,
      },
      grants,
    );

    const shouldAudit =
      options?.audit ??
      (action === 'MANAGE' ||
        action === 'ENTER' ||
        action === 'LINK_ACCOUNT' ||
        action === 'APPROVE' ||
        resource === 'AUDIT' ||
        resource === 'FINANCE' ||
        !decision.allowed);

    if (shouldAudit) {
      auditService.record(decision, options?.entryMode);
    }

    return decision;
  },

  /**
   * Authorize using a precomputed grant list (e.g. from GET /api/authorize/grants).
   */
  authorizeWithGrants(
    personId: string,
    systemId: SystemId,
    resource: Resource,
    action: Action,
    grants: PermissionGrant[],
    options?: {
      now?: Date;
      audit?: boolean;
      entryMode?: SessionState['entryMode'];
    },
  ): AuthzDecision {
    const now = options?.now ?? new Date();
    const decision = authorizeCore(
      {
        personId,
        systemId,
        resource,
        action,
        now,
      },
      grants,
    );

    const shouldAudit =
      options?.audit ??
      (action === 'MANAGE' ||
        action === 'ENTER' ||
        action === 'LINK_ACCOUNT' ||
        action === 'APPROVE' ||
        resource === 'AUDIT' ||
        resource === 'FINANCE' ||
        !decision.allowed);

    if (shouldAudit) {
      auditService.record(decision, options?.entryMode);
    }
    return decision;
  },

  can(
    personId: string,
    systemId: SystemId,
    resource: Resource,
    action: Action,
    now = new Date(),
  ): boolean {
    return this.authorize(personId, systemId, resource, action, {
      now,
      audit: false,
    }).allowed;
  },

  /** Evaluate the standard probe matrix for UI / debugging. */
  probeMatrix(
    personId: string,
    systemId: SystemId,
    now = new Date(),
  ): AuthzDecision[] {
    const grants = this.effectiveAccess(personId, now);
    return PERMISSION_PROBES.map((probe) =>
      authorizeCore(
        {
          personId,
          systemId,
          resource: probe.resource,
          action: probe.action,
          now,
        },
        grants,
      ),
    );
  },

  canManagePeople(personId: string, systemId: SystemId = 'sys-main'): boolean {
    return this.can(personId, systemId, 'PERSON', 'MANAGE');
  },

  canLinkAccounts(personId: string, systemId: SystemId = 'sys-main'): boolean {
    return this.can(personId, systemId, 'PERSON', 'LINK_ACCOUNT');
  },

  canViewFullPersonRecord(
    personId: string,
    systemId: SystemId = 'sys-main',
  ): boolean {
    return this.can(personId, systemId, 'PERSON', 'VIEW_FULL');
  },

  canViewPeople(personId: string, systemId: SystemId = 'sys-main'): boolean {
    return (
      this.can(personId, systemId, 'PERSON', 'VIEW') ||
      this.can(personId, systemId, 'PERSON', 'VIEW_FULL') ||
      this.can(personId, systemId, 'PERSON', 'MANAGE')
    );
  },

  canEnter(personId: string, systemId: SystemId): boolean {
    return this.can(personId, systemId, 'SYSTEM', 'ENTER');
  },

  /** Person ids who are allowed for the given resource/action in a system. */
  peopleWhoCan(
    resource: Resource,
    action: Action,
    systemId: SystemId,
    now = new Date(),
  ): string[] {
    const personIds = [
      ...new Set(ACCOUNTS.map((a) => a.personId).filter(Boolean)),
    ];
    return personIds.filter((personId) =>
      this.can(personId, systemId, resource, action, now),
    );
  },
};
