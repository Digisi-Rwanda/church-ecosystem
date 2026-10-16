import { apiBaseUrl } from './config';
import { isKeptPath, readOffline, saveOffline, setStaleSince } from './offlineStore';

const TOKEN_KEY = 'adepr.apiToken';

export function getApiToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setApiToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * Token used only to share Music/Protocol data. A demo login that the server
 * knows as a bare account (no roles there) keeps its local demo permissions,
 * but still needs an identity to read and write the shared documents.
 */
const SYNC_TOKEN_KEY = 'adepr.syncToken';

export function getSyncToken(): string | null {
  return localStorage.getItem(SYNC_TOKEN_KEY);
}

export function setSyncToken(token: string | null): void {
  if (token) localStorage.setItem(SYNC_TOKEN_KEY, token);
  else localStorage.removeItem(SYNC_TOKEN_KEY);
}

/** The token the shared-document sync should use. */
export function getScheduleSyncToken(): string | null {
  return getApiToken() ?? getSyncToken();
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  token?: string | null;
  auth?: boolean;
};

export async function apiFetch<T>(
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const base = apiBaseUrl();
  if (!base) {
    throw new ApiError('API is not configured (VITE_API_URL)', 0);
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const token = opts.auth === false ? null : (opts.token ?? getApiToken());
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    // No signal: a screen that may be read offline shows the last saved copy, labelled with its time.
    if ((opts.method ?? 'GET') === 'GET' && opts.body === undefined) {
      const kept = readOffline<T>(path, token);
      if (kept) {
        setStaleSince(kept.at);
        return kept.data;
      }
    }
    throw new ApiError(
      e instanceof Error ? e.message : 'Network error',
      0,
    );
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }

  if ((opts.method ?? 'GET') === 'GET' && opts.body === undefined && isKeptPath(path)) {
    saveOffline(path, token, data);
    setStaleSince(null);
  }
  return data as T;
}

export async function apiHealth(): Promise<{
  status: string;
  service: string;
} | null> {
  try {
    return await apiFetch('/api/health', { auth: false });
  } catch {
    return null;
  }
}
