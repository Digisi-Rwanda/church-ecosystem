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
  tier: 'FULL' | 'BASIC' | 'SELF';
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
