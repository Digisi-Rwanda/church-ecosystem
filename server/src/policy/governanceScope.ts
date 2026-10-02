import type { Position, SystemId } from './types.js';

/**
 * Which peer systems a Pastor may enter for now: Main Church + Evangelism.
 * Church Leader and Catechist keep every system. Keep in sync with
 * src/domain/governanceScope.ts (the SPA copy).
 */
export const PASTOR_SYSTEM_IDS: readonly SystemId[] = [
  'sys-main',
  'sys-evangelism',
];

export function isPastorScoped(p: Pick<Position, 'systemRole'>): boolean {
  return p.systemRole === 'PASTOR';
}

export function governanceSystemsFor(
  p: Pick<Position, 'systemRole'>,
  allSystemIds: SystemId[],
): SystemId[] {
  if (isPastorScoped(p)) {
    return allSystemIds.filter((id) => PASTOR_SYSTEM_IDS.includes(id));
  }
  return allSystemIds;
}
