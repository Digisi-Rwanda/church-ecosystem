import type { Holding } from '../capabilities/engine.js';
import type { OfficeCode } from '../shared/vocabulary.js';

// Keep the persisted ADMINISTRATOR code for existing chief appointments.
export const isChiefAdministrator = (holdings: Holding[]) => holdings.some(h => h.via === 'OFFICE' && h.office === 'ADMINISTRATOR');
export const managedSystems = (holdings: Holding[]) => [...new Set(holdings.filter(h => h.via === 'OFFICE' && h.office === 'SYSTEM_ADMINISTRATOR' && h.systemId).map(h => h.systemId!))];
export function mayManageAppointment(holdings: Holding[], systemId: string | null | undefined, office: OfficeCode): boolean {
  if (isChiefAdministrator(holdings)) return true;
  return !!systemId && managedSystems(holdings).includes(systemId)
    && (['PRESIDENT', 'SECRETARY', 'TREASURER'] as OfficeCode[]).includes(office);
}
