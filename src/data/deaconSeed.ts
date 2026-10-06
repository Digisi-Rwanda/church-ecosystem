import type { DeaconRosterMember } from '../domain/types';

export const DEACON_ROSTER: DeaconRosterMember[] = [
  {
    id: 'drm-coord',
    personId: 'p-deacon-coord',
    office: 'COORDINATOR',
    status: 'ACTIVE',
  },
  {
    id: 'drm-treas',
    personId: 'p-deacon-treas',
    office: 'TREASURER',
    status: 'ACTIVE',
  },
  {
    id: 'drm-patrick',
    personId: 'p-member',
    office: 'MEMBER',
    status: 'ACTIVE',
  },
  {
    id: 'drm-secretary',
    personId: 'p-secretary',
    office: 'SECRETARY',
    status: 'INACTIVE',
  },
];
