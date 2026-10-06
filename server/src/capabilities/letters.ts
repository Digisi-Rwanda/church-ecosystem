import { actionSatisfied } from '../policy/permissions.js';
import type { PermissionGrant } from '../policy/types.js';
import {
  BLOCK_MODULE,
  MODULE_LETTERS,
  SHARED_BLOCKS,
  type AccessLetter,
  type SharedBlock,
} from '../shared/vocabulary.js';

/**
 * Which existing policy resources feed each shared block. The engine still decides
 * with resource/action grants; this only translates its answer into letters so the
 * app can show or hide screens. Slice 1.3 replaces the engine itself with letters.
 */
const BLOCK_RESOURCES: Record<Exclude<SharedBlock, 'home'>, readonly string[]> = {
  people: ['PERSON', 'MEMBERSHIP', 'ORG_UNIT', 'POSITION', 'ASSIGNMENT'],
  work: ['PROGRAM', 'EVENT', 'TASK', 'PROJECT', 'ACTIVITY'],
  schedule: [
    'PROTOCOL_SCHEDULE',
    'PROTOCOL_ROSTER',
    'DEACON_ROSTER',
    'WORSHIP_ROSTER',
    'CHOIR_ROSTER',
  ],
  money: ['FINANCE', 'MINISTRY_FINANCE', 'WORSHIP_FINANCE', 'DEACON_FINANCE', 'CHOIR_FINANCE'],
  reports: ['AUDIT', 'BOARD'],
};

const WRITE_ACTIONS = ['CREATE', 'UPDATE', 'MANAGE', 'DELETE', 'RECORD_ATTENDANCE'];

const holds = (grants: PermissionGrant[], resources: readonly string[], action: string) =>
  grants.some((g) => resources.includes(g.resource) && actionSatisfied(g.action, action));

/** The letters this person holds in one block of one system, limited to what the module allows. */
export function lettersForBlock(
  grants: PermissionGrant[],
  block: SharedBlock,
): AccessLetter[] {
  if (block === 'home') {
    return grants.some((g) => g.resource === 'SYSTEM' && g.action === 'ENTER') ? ['R'] : [];
  }
  const resources = BLOCK_RESOURCES[block];
  const out = new Set<AccessLetter>();
  if (holds(grants, resources, 'VIEW')) out.add('R');
  if (WRITE_ACTIONS.some((a) => holds(grants, resources, a))) out.add('W');
  if (holds(grants, resources, 'VIEW_FULL')) out.add('V');
  if (holds(grants, resources, 'APPROVE')) out.add('A');
  const allowed: readonly AccessLetter[] = MODULE_LETTERS[BLOCK_MODULE[block]];
  return [...out].filter((l) => allowed.includes(l));
}

export function blocksForSystem(
  grants: PermissionGrant[],
): Record<SharedBlock, AccessLetter[]> {
  const result = {} as Record<SharedBlock, AccessLetter[]>;
  for (const block of SHARED_BLOCKS) result[block] = lettersForBlock(grants, block);
  return result;
}
