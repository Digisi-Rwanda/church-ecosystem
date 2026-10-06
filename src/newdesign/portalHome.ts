import type { PortalSystem } from '../api/frontDoorApi';

/** The main church: the church-wide level every member belongs to. */
export const CHURCH_SYSTEM = 'sys-main';

/** Where signing in lands: the church-wide home when the person may enter it, else the card page. */
export function landingPath(portal: PortalSystem[]): string | null {
  return portal.some((s) => s.id === CHURCH_SYSTEM) ? `/s/${CHURCH_SYSTEM}` : null;
}

/** The unit systems a person can step into from the church-wide home: every system they may enter except the church itself. */
export function myUnits(portal: PortalSystem[]): PortalSystem[] {
  return portal.filter((s) => s.id !== CHURCH_SYSTEM);
}

/** The way back to the church-wide level from a unit: only when the person may enter it, and never from the church itself. */
export function churchWideLink(portal: PortalSystem[], systemId: string): string | null {
  return systemId !== CHURCH_SYSTEM && portal.some((s) => s.id === CHURCH_SYSTEM) ? `/s/${CHURCH_SYSTEM}` : null;
}
