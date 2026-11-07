import { apiFetch, setApiToken } from './client';

export type ApiLoginResponse = {
  token: string;
  account: { id: string; username: string; personId: string };
  person: {
    id: string;
    fullName: string;
    preferredName?: string | null;
    status: string;
  };
};

export type ApiMeResponse = {
  account: { id: string; username: string; personId: string };
  person: {
    id: string;
    fullName: string;
    preferredName?: string | null;
    status: string;
  };
  memberships: unknown[];
  positions: unknown[];
};

export async function apiLogin(
  username: string,
  password: string,
  systemId?: string,
): Promise<ApiLoginResponse> {
  const result = await apiFetch<ApiLoginResponse>('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: { username, password, systemId },
  });
  setApiToken(result.token);
  return result;
}

export async function apiMe(): Promise<ApiMeResponse> {
  return apiFetch<ApiMeResponse>('/api/auth/me');
}

export async function apiAuthorizeProbe(input: {
  systemId: string;
  resource: string;
  action: string;
}): Promise<{
  allowed: boolean;
  reason: string;
  reasons: string[];
  engine?: string;
}> {
  return apiFetch('/api/authorize/probe', {
    method: 'POST',
    body: input,
  });
}

export type ApiGrant = {
  systemId: string;
  resource: string;
  action: string;
  source: string;
  reason: string;
};

export async function apiFetchGrants(opts?: {
  systemId?: string;
  personId?: string;
}): Promise<{ personId: string; count: number; grants: ApiGrant[] }> {
  const q = new URLSearchParams();
  if (opts?.systemId) q.set('systemId', opts.systemId);
  if (opts?.personId) q.set('personId', opts.personId);
  const qs = q.toString();
  return apiFetch(`/api/authorize/grants${qs ? `?${qs}` : ''}`);
}
