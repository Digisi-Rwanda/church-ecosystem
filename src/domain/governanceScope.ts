import type { Position, SystemId } from './types';

/**
 * Which peer systems a Pastor may enter for now: Main Church + Evangelism.
 * Church Leader and Catechist keep every system. Widen this list later if the
 * church decides Pastors should oversee more ministries.
 */
export const PASTOR_SYSTEM_IDS: readonly SystemId[] = [
  'sys-main',
  'sys-evangelism',
];

/** True when this position's governance reach is limited to PASTOR_SYSTEM_IDS. */
export function isPastorScoped(p: Pick<Position, 'systemRole'>): boolean {
  return p.systemRole === 'PASTOR';
}

/** Systems a governance position covers. A named role wins over the legacy grantsAllSystems flag. */
export function governanceSystemsFor(
  p: Pick<Position, 'systemRole'>,
  allSystemIds: SystemId[],
): SystemId[] {
  if (isPastorScoped(p)) {
    return allSystemIds.filter((id) => PASTOR_SYSTEM_IDS.includes(id));
  }
  return allSystemIds;
}
