import type { AccessLetter, OfficeCode, SharedBlock } from '../../server/src/shared/vocabulary';
import { apiFetch } from './client';

export type PortalSystem = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  basePath: string;
  /** The person's role in that system, e.g. "Choir Leader" or "Member". */
  role: string;
  unreadCount: number;
};

export type Capabilities = {
  personId: string;
  offices: Array<{ id: string; systemId: string | null; title: string; code: OfficeCode | null }>;
  systems: Array<{ id: string; blocks: Record<SharedBlock, AccessLetter[]> }>;
  blockOrder: SharedBlock[];
};

export async function fetchPortal(): Promise<PortalSystem[]> {
  const res = await apiFetch<{ systems: PortalSystem[] }>('/api/portal');
  return res.systems;
}

export async function fetchCapabilities(): Promise<Capabilities> {
  return apiFetch<Capabilities>('/api/me/capabilities');
}
