import { apiFetch } from './client';
import type { P360Section } from './frontDoorApi';

/** Registration-only requests load with the registration screens. */
export const fetchRegistrationOptions = (systemId: string): Promise<{write:P360Section[]}> => apiFetch('/api/people/registration-options?' + new URLSearchParams({systemId}));
