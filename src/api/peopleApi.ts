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
