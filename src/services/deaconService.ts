import { DEACON_ROSTER } from '../data/deaconSeed';
import type { DeaconOffice } from '../domain/types';
import { peopleService } from './authService';

function personLabel(personId: string): string {
  const p = peopleService.getById(personId);
  return p?.preferredName || p?.fullName || personId;
}

export const deaconService = {
  personLabel,

  officeLabel(office: DeaconOffice): string {
    const map: Record<DeaconOffice, string> = {
      COORDINATOR: 'Coordinator',
      PRESIDENT: 'President',
      SECRETARY: 'Secretary',
      TREASURER: 'Treasurer',
      MEMBER: 'Member',
    };
    return map[office];
  },

  listRoster(activeOnly = true) {
    return DEACON_ROSTER.filter((r) =>
      activeOnly ? r.status === 'ACTIVE' : true,
    );
  },

  stats() {
    return {
      rosterCount: this.listRoster().length,
    };
  },
};
