import type { PortalSystem } from '../api/frontDoorApi';

/** Central Administration (today's main church system): the leadership system. */
export const CHURCH_SYSTEM = 'sys-main';

export type SystemKind = 'central' | 'organisation' | 'ministry';

/** The three kinds of the new design: Central Administration, organisations, and ministries. */
const ORGANISATIONS = new Set(['sys-choir', 'sys-protocol', 'sys-media']);
export function kindOfSystem(id: string): SystemKind {
  if (id === CHURCH_SYSTEM) return 'central';
  return ORGANISATIONS.has(id) ? 'organisation' : 'ministry';
}

/** Systems that are never opened on their own (Finance becomes a module inside every system). */
const NEVER_OPENED = new Set(['sys-finance']);

/**
 * Where signing in lands: a person with exactly one system goes straight into it; everyone else
 * (two or more, or none) lands on the Portal.
 */
export function landingPath(portal: PortalSystem[]): string | null {
  const open = portal.filter((s) => !NEVER_OPENED.has(s.id));
  return open.length === 1 ? `/s/${open[0]!.id}` : null;
}

/** The cards of the Portal, grouped by kind in the order Central Administration, organisations, ministries. */
export function groupByKind(portal: PortalSystem[]): Array<{ kind: SystemKind; systems: PortalSystem[] }> {
  const open = portal.filter((s) => !NEVER_OPENED.has(s.id));
  return (['central', 'organisation', 'ministry'] as const)
    .map((kind) => ({ kind, systems: open.filter((s) => kindOfSystem(s.id) === kind) }))
    .filter((g) => g.systems.length > 0);
}
