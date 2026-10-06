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

/* ── People, units and offices (slice 1.2) ── */

export type PersonStatus = 'ACTIVE' | 'INACTIVE' | 'VISITOR';

/** A person as the server shows them to this viewer; fields the viewer may not see are simply absent. */
export type DirectoryPerson = {
  id: string;
  fullName: string;
  preferredName?: string | null;
  memberCode?: string | null;
  status: PersonStatus;
  phone?: string | null;
  email?: string | null;
  archivedAt?: string | null;
  archivedReason?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  nationalId?: string | null;
  joinedChurchOn?: string | null;
  pastoralNotes?: string | null;
};

export type UnitRecord = {
  id: string;
  name: string;
  type: string;
  kind: 'CENTRAL' | 'MINISTRY' | 'ORGANISATION' | 'TEAM';
  code: string | null;
  parentId: string | null;
  description: string | null;
  systemId: string | null;
  leaderPersonId: string | null;
};

export type MembershipRecord = {
  id: string;
  personId: string;
  label: string;
  orgUnitId: string | null;
  systemId: string | null;
  status: string;
  startDate: string;
  endDate?: string | null;
};

export type OfficeRecord = {
  id: string;
  personId: string;
  title: string;
  office: OfficeCode | null;
  orgUnitId: string | null;
  systemId: string | null;
  status: string;
  startDate: string;
  endDate?: string | null;
};

export type Structure = {
  units: UnitRecord[];
  memberships: MembershipRecord[];
  offices: OfficeRecord[];
};

export async function fetchPeople(opts: { q?: string; status?: string; archived?: boolean; ids?: string[] } = {}): Promise<DirectoryPerson[]> {
  const qs = new URLSearchParams();
  if (opts.q) qs.set('q', opts.q);
  if (opts.status) qs.set('status', opts.status);
  if (opts.archived) qs.set('archived', 'true');
  if (opts.ids?.length) qs.set('ids', opts.ids.join(','));
  const res = await apiFetch<{ people: DirectoryPerson[] }>(`/api/people${qs.size ? `?${qs}` : ''}`);
  return res.people;
}

export async function fetchPerson(id: string): Promise<DirectoryPerson> {
  const res = await apiFetch<{ person: DirectoryPerson }>(`/api/people/${encodeURIComponent(id)}`);
  return res.person;
}

export async function fetchStructure(): Promise<Structure> {
  const res = await apiFetch<{
    orgUnits: UnitRecord[];
    memberships: MembershipRecord[];
    positions: OfficeRecord[];
  }>('/api/participation/records');
  return { units: res.orgUnits, memberships: res.memberships, offices: res.positions };
}

export type NewPerson = {
  fullName: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  nationalId?: string;
  confirmDuplicate?: boolean;
};

export async function createPerson(body: NewPerson): Promise<DirectoryPerson> {
  const res = await apiFetch<{ person: DirectoryPerson }>('/api/people', { method: 'POST', body });
  return res.person;
}

export async function archivePerson(id: string, reason?: string): Promise<DirectoryPerson> {
  const res = await apiFetch<{ person: DirectoryPerson }>(`/api/people/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    body: { reason },
  });
  return res.person;
}

export async function unarchivePerson(id: string): Promise<DirectoryPerson> {
  const res = await apiFetch<{ person: DirectoryPerson }>(`/api/people/${encodeURIComponent(id)}/unarchive`, {
    method: 'POST',
    body: {},
  });
  return res.person;
}
