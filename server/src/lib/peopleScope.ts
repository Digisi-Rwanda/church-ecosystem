/**
 * Whose people a system may see. Central Administration sees the whole church; every other system sees its
 * own members and its own leaders, and nothing else. A system that has units under it (Music has its choirs,
 * Deacon has Protocol) can also open that part of the organisation, but only as structure.
 */
import { CENTRAL, isLive, lettersInSystem, reachesEverySystem, liveHoldings, type AccessData } from '../capabilities/engine.js';

export { CENTRAL };

export interface UnitLite { id: string; parentId?: string | null; systemId?: string | null }

/** May this person read the People block of this system? Only the Church Leader reaches a system that is not their own. */
export function mayReadPeople(me: string, systemId: string, data: AccessData, now = new Date()): boolean {
  const holdings = liveHoldings(me, data, now);
  if (holdings.some(reachesEverySystem)) return true;
  return (lettersInSystem(me, systemId, data, now, holdings).PEOPLE as string[]).includes('R');
}

export const isAdministrator = (me: string, data: AccessData, now = new Date()): boolean =>
  liveHoldings(me, data, now).some((h) => h.via === 'OFFICE' && h.office === 'ADMINISTRATOR');

/** Units that belong to this system, with every unit below them. Central owns the whole tree. */
export function subtreeUnitIds(units: UnitLite[], systemId: string): Set<string> {
  if (systemId === CENTRAL) return new Set(units.map((u) => u.id));
  const out = new Set(units.filter((u) => u.systemId === systemId).map((u) => u.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of units) if (u.parentId && out.has(u.parentId) && !out.has(u.id)) { out.add(u.id); grew = true; }
  }
  return out;
}

interface Placed { personId: string; systemId?: string | null; orgUnitId?: string | null; status?: string; startDate?: Date | string | null; endDate?: Date | string | null }

/** Is this membership or office part of the system itself (not of a unit below it)? */
export const isOwn = (r: Placed, systemId: string, unitSystem: Map<string, string | null>): boolean =>
  systemId === CENTRAL || r.systemId === systemId || (!r.systemId && !!r.orgUnitId && unitSystem.get(r.orgUnitId) === systemId);

/** The people of one system: its live members and its live office holders. */
export function peopleOfSystem(
  systemId: string,
  memberships: Placed[],
  positions: Placed[],
  units: UnitLite[],
  now = new Date(),
): Set<string> {
  const unitSystem = new Map(units.map((u) => [u.id, u.systemId ?? null]));
  const out = new Set<string>();
  const live = (r: Placed) => isLive({ status: r.status ?? 'ACTIVE', startDate: r.startDate, endDate: r.endDate }, now);
  for (const m of memberships) if (live(m) && isOwn(m, systemId, unitSystem)) out.add(m.personId);
  for (const p of positions) if (live(p) && isOwn(p, systemId, unitSystem)) out.add(p.personId);
  return out;
}
