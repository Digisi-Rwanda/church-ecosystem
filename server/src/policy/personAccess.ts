import { authorizePerson } from './index.js';
import { tierFor, type PersonTier } from './personFields.js';

const MAIN = 'sys-main';
const ok = async (personId: string, resource: string, action: string) =>
  (await authorizePerson({ personId, systemId: MAIN, resource, action } as never)).allowed;

/**
 * What this viewer may see of `targetId`'s person record.
 * People-module access (BASIC) = PERSON VIEW plus the power to enrol church
 * members (Church Leader and Catechist). Ministry leaders hold PERSON VIEW only,
 * so they get the names-only DIRECTORY tier.
 */
export async function personTier(viewerId: string, targetId: string): Promise<PersonTier> {
  const [full, view, enrol] = await Promise.all([
    ok(viewerId, 'PERSON', 'VIEW_FULL'),
    ok(viewerId, 'PERSON', 'VIEW'),
    ok(viewerId, 'MEMBERSHIP', 'MANAGE'),
  ]);
  return tierFor({
    viewerId,
    targetId,
    canViewFull: full,
    canViewBasic: view && enrol,
    canViewDirectory: view,
  });
}

/** True when the viewer may see everyone's membership and position details. */
export async function hasPeopleModule(viewerId: string): Promise<boolean> {
  const t = await personTier(viewerId, '\u0000');
  return t === 'FULL' || t === 'BASIC';
}
