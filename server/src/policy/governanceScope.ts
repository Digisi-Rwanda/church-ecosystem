import type { Position, SystemId } from './types.js';

/**
 * Which peer systems a Pastor may enter for now: Main Church + Evangelism.
 * Church Leader and Catechist keep every system. Keep in sync with
 * src/domain/governanceScope.ts (the SPA copy).
 */
export const PASTOR_SYSTEM_IDS: readonly SystemId[] = ['sys-main'];

export function isPastorScoped(p: Pick<Position, 'systemRole'>): boolean {
  return p.systemRole === 'PASTOR';
}

export function governanceSystemsFor(
  p: Pick<Position, 'systemRole'>,
  allSystemIds: SystemId[],
): SystemId[] {
  // Only the Church Leader (or the legacy all-systems flag with no named role) reaches every system.
  if (p.systemRole === 'CHURCH_LEADER' || !p.systemRole) return allSystemIds;
  return allSystemIds.filter((id) => id === 'sys-main');
}
