import {
  authorize as authorizeCore,
  buildEffectiveAccess,
  grantsForSystem,
} from './buildAccess.js';
import { loadPolicyContext } from './loadContext.js';
import type {
  Action,
  AuthzDecision,
  PermissionGrant,
  Resource,
  SystemId,
} from './types.js';

export async function grantsForPerson(
  personId: string,
  now = new Date(),
): Promise<PermissionGrant[]> {
  const ctx = await loadPolicyContext();
  return buildEffectiveAccess(personId, ctx, now);
}

export async function authorizePerson(input: {
  personId: string;
  systemId: SystemId;
  resource: Resource;
  action: Action;
  now?: Date;
}): Promise<AuthzDecision> {
  const grants = await grantsForPerson(input.personId, input.now);
  return authorizeCore(
    {
      personId: input.personId,
      systemId: input.systemId,
      resource: input.resource,
      action: input.action,
      now: input.now,
    },
    grants,
  );
}

export async function grantsForPersonInSystem(
  personId: string,
  systemId: SystemId,
): Promise<PermissionGrant[]> {
  const grants = await grantsForPerson(personId);
  return grantsForSystem(grants, systemId);
}

export {
  authorizeCore as authorize,
  buildEffectiveAccess,
  grantsForSystem,
};
export type { AuthzDecision, PermissionGrant } from './types.js';
