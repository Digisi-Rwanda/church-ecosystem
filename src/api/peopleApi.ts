import { apiFetch } from './client';

export type DirectoryPerson = {
  id: string;
  fullName: string;
  preferredName?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** Search the church directory on the server (needs a role there). */
export function apiSearchPeople(q: string) {
  return apiFetch<{ people: DirectoryPerson[] }>(
    `/api/people?q=${encodeURIComponent(q)}`,
  );
}

/** One person as the server describes them (fields depend on who asks). */
export type ServerPerson = {
  id: string;
  fullName: string;
  preferredName?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'VISITOR';
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  nationalId?: string | null;
  joinedChurchOn?: string | null;
  pastoralNotes?: string | null;
  photoUrl?: string | null;
  createdAt?: string;
};

export type PeopleRecordsPage = {
  tier: 'FULL' | 'BASIC' | 'DIRECTORY' | 'SELF';
  total: number;
  offset: number;
  people: ServerPerson[];
};

export function apiPeopleRecords(offset = 0, limit = 200) {
  return apiFetch<PeopleRecordsPage>(
    `/api/people/records?offset=${offset}&limit=${limit}`,
  );
}

export function apiCreatePerson(body: Record<string, unknown>) {
  return apiFetch<{ person: ServerPerson }>('/api/people', {
    method: 'POST',
    body,
  });
}

export function apiUpdatePerson(id: string, body: Record<string, unknown>) {
  return apiFetch<{ person: ServerPerson }>(
    `/api/people/${encodeURIComponent(id)}`,
    { method: 'PATCH', body },
  );
}

/* ───────────── memberships, positions, org units (slice 2) ───────────── */

export type ParticipationRecords = {
  orgUnits: Record<string, unknown>[];
  memberships: Record<string, unknown>[];
  positions: Record<string, unknown>[];
};

export const apiParticipationRecords = () =>
  apiFetch<ParticipationRecords>('/api/participation/records');

const send = (path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) =>
  apiFetch<Record<string, unknown>>(path, { method, body });

export const apiCreateMembership = (b: Record<string, unknown>) => send('/api/participation/memberships', 'POST', b);
export const apiUpdateMembership = (id: string, b: Record<string, unknown>) =>
  send(`/api/participation/memberships/${encodeURIComponent(id)}`, 'PATCH', b);
export const apiCreatePosition = (b: Record<string, unknown>) => send('/api/participation/positions', 'POST', b);
export const apiUpdatePosition = (id: string, b: Record<string, unknown>) =>
  send(`/api/participation/positions/${encodeURIComponent(id)}`, 'PATCH', b);
export const apiCreateOrgUnit = (b: Record<string, unknown>) => send('/api/participation/org-units', 'POST', b);
export const apiUpdateOrgUnit = (id: string, b: Record<string, unknown>) =>
  send(`/api/participation/org-units/${encodeURIComponent(id)}`, 'PATCH', b);
