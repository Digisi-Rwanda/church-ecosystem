import { apiFetch, getScheduleSyncToken } from './client';

export type ScheduleDocKey = 'music' | 'protocol';

export type ScheduleDocResponse = {
  key: ScheduleDocKey;
  version: number;
  updatedAt: string | null;
  updatedByPersonId: string | null;
  data: Record<string, unknown> | null;
};

export function apiGetScheduleDoc(key: ScheduleDocKey) {
  return apiFetch<ScheduleDocResponse>(`/api/schedule-state/${key}`, {
    token: getScheduleSyncToken(),
  });
}

export function apiGetScheduleDocVersion(key: ScheduleDocKey) {
  return apiFetch<{ key: ScheduleDocKey; version: number }>(
    `/api/schedule-state/${key}/version`,
    { token: getScheduleSyncToken() },
  );
}

export function apiPutScheduleDoc(
  key: ScheduleDocKey,
  baseVersion: number,
  data: Record<string, unknown>,
) {
  return apiFetch<{ key: ScheduleDocKey; version: number }>(
    `/api/schedule-state/${key}`,
    { method: 'PUT', body: { baseVersion, data }, token: getScheduleSyncToken() },
  );
}

export type ProtocolOfficesResponse = {
  offices: import('../data/protocolOffices').ServerProtocolOffice[];
};

export function apiGetProtocolOffices() {
  return apiFetch<ProtocolOfficesResponse>('/api/protocol/offices', {
    token: getScheduleSyncToken(),
  });
}
