import { liveHoldings, type AccessData } from '../capabilities/engine.js';
import { peopleOfSystem, type UnitLite } from './peopleScope.js';

/** Direct, live unit offices only: no parent-system reach or borrowed authority. */
export function unitPeopleSystems(me: string, data: AccessData, now = new Date()): string[] {
  return [...new Set(liveHoldings(me, data, now).filter(h => h.via === 'OFFICE'
    && h.scope === 'UNIT' && ['PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY'].includes(h.office ?? '')
    && h.letters.PEOPLE?.includes('W')).map(h => h.systemId).filter((s): s is string => !!s))];
}

export function unitPeopleIds(me: string, data: AccessData, units: UnitLite[], now = new Date()): Set<string> {
  const ids = new Set<string>();
  for (const system of unitPeopleSystems(me, data, now)) {
    for (const id of peopleOfSystem(system, data.memberships, data.positions, units, now)) ids.add(id);
  }
  return ids;
}
